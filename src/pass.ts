import {
  Color,
  DepthTexture,
  Material,
  Mesh,
  MeshDepthMaterial,
  Object3D,
  PerspectiveCamera,
  OrthographicCamera,
  RGBAFormat,
  RGBADepthPacking,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
  NearestFilter,
  UnsignedIntType,
} from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

export interface InkPassOptions {
  /** Outline width in CSS pixels. */
  penWidth?: number;
  penColor?: string | number;
  /** Strength from 0 to 1. */
  grain?: number;
  acrylic?: number;
  pixelRatio?: number;
}
const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse, tId, tDepth;
  uniform vec2 resolution;
  uniform float penWidth, grain, acrylic, pixelRatio, time, cameraNear, cameraFar, perspective;
  uniform vec3 penColor;
  varying vec2 vUv;
  #include <packing>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float viewDepth(vec2 uv) {
    float z = texture2D(tDepth,uv).x;
    return -mix(orthographicDepthToViewZ(z,cameraNear,cameraFar),perspectiveDepthToViewZ(z,cameraNear,cameraFar),perspective);
  }
  float boundary(vec2 uv, vec3 id, float d) {
    vec3 other=texture2D(tId,uv).rgb;
    float hasObject=step(0.0001,length(id)+length(other));
    float idEdge=step(0.001,length(id-other));
    float depthEdge=step(max(0.03,d*0.018),abs(viewDepth(uv)-d));
    return max(idEdge,depthEdge)*hasObject;
  }
  void main() {
    vec2 px=1.0/resolution;
    vec4 source=texture2D(tDiffuse,vUv);
    vec3 c=source.rgb;
    vec2 q=gl_FragCoord.xy/max(pixelRatio,1.0);
    if(penWidth>0.0) {
      vec3 id=texture2D(tId,vUv).rgb;
      float d=viewDepth(vUv);
      float pressure=0.82+0.3*hash(floor(q/5.0));
      vec2 r=px*pixelRatio*penWidth*pressure;
      float edge=boundary(vUv+vec2(r.x,0),id,d);
      edge=max(edge,boundary(vUv-vec2(r.x,0),id,d));
      edge=max(edge,boundary(vUv+vec2(0,r.y),id,d));
      edge=max(edge,boundary(vUv-vec2(0,r.y),id,d));
      float ink=0.8+0.2*hash(floor(q*1.7));
      c=mix(c,penColor,edge*ink);
    }
    if(acrylic>0.0) {
      vec2 r=px*pixelRatio*(1.2+acrylic*2.4);
      vec3 scatter=(texture2D(tDiffuse,vUv+vec2(r.x,0)).rgb+texture2D(tDiffuse,vUv-vec2(r.x,0)).rgb+texture2D(tDiffuse,vUv+vec2(0,r.y)).rgb+texture2D(tDiffuse,vUv-vec2(0,r.y)).rgb)*0.25;
      c=mix(c,scatter,0.24*acrylic);
      c=mix(c,vec3(0.87,0.9,0.89),0.075*acrylic);
      float fine=hash(floor(q)+vec2(41.7,93.1))-0.5;
      float coarse=hash(floor(q/2.4)+vec2(8.3,27.9))-0.5;
      c+=(fine*0.75+coarse*0.25)*0.085*acrylic;
    }
    c+=(hash(floor(q)+floor(time*24.0)*vec2(7.13,3.71))-0.5)*0.1*grain;
    gl_FragColor=vec4(max(c,vec3(0.0)),source.a);
  }
`;
/** Add after RenderPass, before OutputPass. Owns only its internal buffers and materials. */
export class InkPass extends Pass {
  readonly material: ShaderMaterial;
  private target: WebGLRenderTarget;
  private quad: FullScreenQuad;
  private idMaterials = new Map<string, MeshDepthMaterial>();
  private elapsed = 0;
  private disposed = false;
  constructor(
    readonly scene: Scene,
    readonly camera: PerspectiveCamera | OrthographicCamera,
    options: InkPassOptions = {},
  ) {
    super();
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat,
      depthBuffer: true,
    });
    this.target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tId: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: new Vector2(1, 1) },
        penWidth: { value: 1.1 },
        penColor: { value: new Color("#272333") },
        grain: { value: 0.5 },
        acrylic: { value: 0.5 },
        pixelRatio: { value: 1 },
        time: { value: 0 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        perspective: { value: 1 },
      },
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader,
    });
    this.quad = new FullScreenQuad(this.material);
    this.configure(options);
  }
  configure(options: InkPassOptions): void {
    const u = this.material.uniforms;
    for (const key of ["penWidth", "grain", "acrylic", "pixelRatio"] as const) {
      const value = options[key];
      if (value === undefined) continue;
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        ((key === "grain" || key === "acrylic") && value > 1) ||
        (key === "pixelRatio" && value === 0)
      )
        throw new Error(`Invalid ${key}`);
      u[key].value = value;
    }
    if (options.penColor !== undefined) u.penColor.value.set(options.penColor);
  }
  override setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
  }
  /** Release cached auxiliary materials when removing/replacing scene models. */
  reset(): void {
    for (const m of this.idMaterials.values()) m.dispose();
    this.idMaterials.clear();
  }
  private idMaterial(source: Material, id: number): Material {
    const key = `${source.uuid}:${id}`;
    let m = this.idMaterials.get(key);
    if (!m) {
      m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      const color = new Color();
      color.r = (id & 255) / 255;
      color.g = ((id >> 8) & 255) / 255;
      color.b = ((id >> 16) & 255) / 255;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.inkId = { value: color };
        shader.fragmentShader =
          "uniform vec3 inkId;\n" +
          shader.fragmentShader.replace(
            "gl_FragColor = packDepthToRGBA( fragCoordZ );",
            "gl_FragColor = vec4(inkId,1.0);",
          );
      };
      m.customProgramCacheKey = () => "three-ink-id-v1";
      this.idMaterials.set(key, m);
    }
    const s = source as Material & Record<string, any>;
    const target = m as Material & Record<string, any>;
    for (const key of [
      "map",
      "alphaMap",
      "alphaTest",
      "alphaHash",
      "displacementMap",
      "displacementScale",
      "displacementBias",
      "side",
      "clippingPlanes",
      "clipIntersection",
      "wireframe",
    ])
      if (s[key] !== undefined) target[key] = s[key];
    m.visible =
      source.visible &&
      !s.transparent &&
      !(s.transmission > 0) &&
      !s.isShaderMaterial;
    return m;
  }
  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime = 0,
  ): void {
    if (this.disposed) return;
    if (
      renderer.capabilities.logarithmicDepthBuffer ||
      renderer.capabilities.reversedDepthBuffer
    )
      throw new Error(
        "InkPass requires standard depth (disable logarithmicDepthBuffer and reversedDepthBuffer).",
      );
    this.elapsed += Number.isFinite(deltaTime) ? deltaTime : 0;
    const u = this.material.uniforms;
    u.time.value = this.elapsed;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    u.perspective.value = (this.camera as PerspectiveCamera).isPerspectiveCamera
      ? 1
      : 0;
    if (u.penWidth.value > 0) {
      const changed: { mesh: Mesh; material: Material | Material[] }[] = [];
      const hidden: Object3D[] = [];
      const background = this.scene.background,
        override = this.scene.overrideMaterial;
      const clearColor = renderer.getClearColor(new Color()),
        clearAlpha = renderer.getClearAlpha();
      const autoClear = renderer.autoClear,
        shadowUpdate = renderer.shadowMap.autoUpdate,
        xr = renderer.xr.enabled;
      const oldTarget = renderer.getRenderTarget();
      let id = 1;
      try {
        this.scene.traverse((o) => {
          if ((o as Mesh).isMesh) {
            const mesh = o as Mesh;
            changed.push({ mesh, material: mesh.material });
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) => this.idMaterial(m, id++))
              : this.idMaterial(mesh.material, id++);
          } else if (
            ((o as any).isLine || (o as any).isPoints || (o as any).isSprite) &&
            o.visible
          ) {
            hidden.push(o);
            o.visible = false;
          }
        });
        this.scene.background = null;
        this.scene.overrideMaterial = null;
        renderer.autoClear = true;
        renderer.shadowMap.autoUpdate = false;
        renderer.xr.enabled = false;
        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(this.target);
        renderer.clear();
        renderer.render(this.scene, this.camera);
      } finally {
        for (const r of changed) r.mesh.material = r.material;
        for (const o of hidden) o.visible = true;
        this.scene.background = background;
        this.scene.overrideMaterial = override;
        renderer.setClearColor(clearColor, clearAlpha);
        renderer.autoClear = autoClear;
        renderer.shadowMap.autoUpdate = shadowUpdate;
        renderer.xr.enabled = xr;
        renderer.setRenderTarget(oldTarget);
      }
    }
    u.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }
  override dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
    this.disposed = true;
  }
}
