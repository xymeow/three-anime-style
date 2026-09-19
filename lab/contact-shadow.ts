import * as T from "three";

/** A flat, tinted projection of the actual animated casters onto a horizontal stage. */
export class ContactShadow {
  readonly mesh: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  private readonly target = new T.WebGLRenderTarget(512, 512, {
    minFilter: T.NearestFilter,
    magFilter: T.NearestFilter,
    depthTexture: new T.DepthTexture(512, 512, T.UnsignedIntType),
  });
  private readonly camera = new T.OrthographicCamera();
  private readonly materials = new Map<T.Material, T.MeshDepthMaterial>();
  private readonly empty = new T.MeshBasicMaterial({ visible: false });
  private readonly bounds = new T.Box3();
  private readonly point = new T.Vector3();
  private readonly size = new T.Vector3();
  private readonly center = new T.Vector3();
  private disposed = false;
  ready = false;

  constructor() {
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        color: { value: new T.Color("#20233e") },
        opacity: { value: 0.42 },
        roundReceiver: { value: 0 },
        shadowDepth: { value: this.target.depthTexture },
        shadowMatrix: { value: new T.Matrix4() },
        shadowInverse: { value: new T.Matrix4() },
        floorY: { value: 0 },
        worldTexel: { value: 0.02 },
      },
      vertexShader: `varying vec2 vUv; varying vec4 vShadow; uniform mat4 shadowMatrix;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vShadow = shadowMatrix * world;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vShadow;
        uniform sampler2D shadowDepth;
        uniform mat4 shadowInverse;
        uniform vec3 color;
        uniform float opacity, floorY, worldTexel, roundReceiver;
        float coverage(vec2 uv, float receiver) {
          if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
          float depth = texture2D(shadowDepth, uv).r;
          return step(depth + 0.00005, receiver) * (1.0 - step(0.99999, depth));
        }
        void main() {
          if(roundReceiver > 0.5 && length(vUv - 0.5) > 0.5) discard;
          vec3 q = vShadow.xyz / vShadow.w * 0.5 + 0.5;
          if(q.z < 0.0 || q.z > 1.0) discard;
          // Higher surfaces get a slightly broader penumbra. Ground contact stays crisp.
          float depth = texture2D(shadowDepth, clamp(q.xy, 0.0, 1.0)).r;
          vec4 caster = shadowInverse * vec4(q.xy * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          float height = depth < 0.99999 ? max(0.0, caster.y / caster.w - floorY) : 0.0;
          float radius = clamp(0.65 + height * 0.035 / worldTexel, 0.65, 3.0) / 512.0;
          float mask = coverage(q.xy, q.z) * 0.2;
          for(int i = 0; i < 8; i++) {
            float angle = float(i) * 0.78539816;
            mask += coverage(q.xy + vec2(cos(angle), sin(angle)) * radius, q.z) * 0.1;
          }
          // Keep one clear painted value inside the shadow and soften only its boundary.
          mask = smoothstep(0.12, 0.88, mask);
          if(mask < 0.001) discard;
          gl_FragColor = vec4(color, mask * opacity);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new T.Mesh(new T.PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.mesh.name = "Animated contact projection";
    this.mesh.visible = false;
  }

  private depthMaterial(source: T.Material): T.Material {
    const s = source as T.MeshStandardMaterial;
    if (
      !source.visible ||
      s.transparent ||
      (s as T.MeshPhysicalMaterial).transmission > 0 ||
      (s as unknown as T.ShaderMaterial).isShaderMaterial
    )
      return this.empty;
    let depth = this.materials.get(source);
    if (!depth) {
      depth = new T.MeshDepthMaterial();
      this.materials.set(source, depth);
    }
    depth.map = s.map ?? null;
    depth.alphaMap = s.alphaMap ?? null;
    depth.alphaTest = s.alphaTest;
    depth.side = s.side;
    depth.displacementMap = s.displacementMap ?? null;
    depth.displacementScale = s.displacementScale;
    depth.displacementBias = s.displacementBias;
    return depth;
  }

  /** Capture once per pose, before either comparison view. No caller state survives the capture. */
  update(
    renderer: T.WebGLRenderer,
    scene: T.Scene,
    root: T.Object3D,
    light: T.DirectionalLight,
    floorY: number,
    color: T.ColorRepresentation,
  ) {
    this.ready = false;
    if (this.disposed) return;
    root.updateWorldMatrix(true, true);
    const casters: T.Mesh[] = [];
    root.traverseVisible((o) => {
      const mesh = o as T.Mesh;
      if (mesh.isMesh && mesh.userData.inkCel) casters.push(mesh);
    });
    this.bounds.makeEmpty();
    for (const mesh of casters) {
      if ((mesh as T.SkinnedMesh).isSkinnedMesh)
        (mesh as T.SkinnedMesh).skeleton.update();
      // Recompute bounds from the current deformed vertices rather than cached bind-pose bounds.
      this.bounds.expandByObject(mesh, true);
    }
    if (this.bounds.isEmpty()) {
      this.mesh.visible = false;
      return;
    }
    this.bounds.getCenter(this.center);
    this.bounds.getSize(this.size);
    const direction = light
      .getWorldPosition(new T.Vector3())
      .sub(light.target.getWorldPosition(new T.Vector3()))
      .normalize();
    if (direction.y <= 0.01) {
      this.mesh.visible = false;
      return;
    }
    // Fit both the casters and their projected floor footprint, including off-center objects.
    const projected = this.bounds.clone();
    for (const x of [this.bounds.min.x, this.bounds.max.x])
      for (const y of [this.bounds.min.y, this.bounds.max.y])
        for (const z of [this.bounds.min.z, this.bounds.max.z]) {
          const height = Math.max(0, y - floorY);
          projected.expandByPoint(
            this.point.set(
              x - (direction.x * height) / direction.y,
              floorY,
              z - (direction.z * height) / direction.y,
            ),
          );
        }
    projected.getCenter(this.center);
    const radius = projected.getSize(this.size).length() * 0.6 + 0.5;
    this.camera.position
      .copy(this.center)
      .addScaledVector(direction, radius * 2);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(this.center);
    this.camera.left = this.camera.bottom = -radius;
    this.camera.right = this.camera.top = radius;
    this.camera.near = 0.01;
    this.camera.far = radius * 4;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    const matrix = this.mesh.material.uniforms.shadowMatrix.value as T.Matrix4;
    matrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.mesh.material.uniforms.shadowInverse.value.copy(matrix).invert();
    this.mesh.material.uniforms.worldTexel.value = (radius * 2) / 512;
    this.mesh.material.uniforms.floorY.value = floorY;
    this.mesh.material.uniforms.color.value.set(color);
    // The receiver is the actual flat stage, not an infinite screen-space decal.
    const receiver = new T.Box3();
    let round = false;
    root.traverse((o) => {
      const mesh = o as T.Mesh;
      if (mesh.isMesh && mesh.userData.inkPaint) {
        const box = new T.Box3().setFromObject(mesh);
        if (Math.abs(box.max.y - floorY) < 0.02) {
          receiver.union(box);
          round = mesh.geometry.type === "CylinderGeometry";
        }
      }
    });
    if (receiver.isEmpty()) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.material.uniforms.roundReceiver.value = round ? 1 : 0;
    receiver.getCenter(this.point);
    receiver.getSize(this.size);
    this.mesh.position.set(this.point.x, floorY + 0.008, this.point.z);
    this.mesh.scale.set(this.size.x, this.size.z, 1);
    this.mesh.updateMatrixWorld(true);
    const changed: Array<[T.Mesh, T.Material | T.Material[]]> = [];
    const hidden: T.Object3D[] = [];
    const previous = {
      target: renderer.getRenderTarget(),
      clear: renderer.getClearColor(new T.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.autoUpdate,
      xr: renderer.xr.enabled,
      background: scene.background,
      override: scene.overrideMaterial,
    };
    try {
      scene.traverse((o) => {
        const mesh = o as T.Mesh;
        if (mesh.isMesh) {
          changed.push([mesh, mesh.material]);
          mesh.material = casters.includes(mesh)
            ? Array.isArray(mesh.material)
              ? mesh.material.map((m) => this.depthMaterial(m))
              : this.depthMaterial(mesh.material)
            : this.empty;
        } else if (
          ((o as T.Line).isLine ||
            (o as T.Points).isPoints ||
            (o as T.Sprite).isSprite) &&
          o.visible
        ) {
          hidden.push(o);
          o.visible = false;
        }
      });
      scene.background = null;
      scene.overrideMaterial = null;
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.xr.enabled = false;
      renderer.setClearColor(0xffffff, 1);
      renderer.setRenderTarget(this.target);
      renderer.clear();
      renderer.render(scene, this.camera);
      this.ready = true;
    } finally {
      for (const [mesh, material] of changed) mesh.material = material;
      for (const object of hidden) object.visible = true;
      scene.background = previous.background;
      scene.overrideMaterial = previous.override;
      renderer.setRenderTarget(previous.target);
      renderer.setClearColor(previous.clear, previous.alpha);
      renderer.autoClear = previous.autoClear;
      renderer.shadowMap.autoUpdate = previous.shadows;
      renderer.xr.enabled = previous.xr;
    }
  }
  reset() {
    this.ready = false;
    this.mesh.visible = false;
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.reset();
    this.target.dispose();
    this.empty.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.disposed = true;
  }
}
