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
  /** Front-lit cel layer offset shadow, 0..1. Default 0. Requires celShadowSelect. */
  celShadow?: number;
  /** Mark foreground cel meshes; evaluated during the auxiliary pass. */
  celShadowSelect?: (mesh: Mesh) => boolean;
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
  uniform float celShadow;
  varying vec2 vUv;
  #include <packing>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float viewDepth(vec2 uv) {
    float z = texture2D(tDepth,uv).x;
    return -mix(orthographicDepthToViewZ(z,cameraNear,cameraFar),perspectiveDepthToViewZ(z,cameraNear,cameraFar),perspective);
  }
  float sameId(vec3 a, vec3 b) { return 1.0-step(0.001,length(a-b)); }
  float boundary(vec2 uv, vec2 offset, vec3 id, float d) {
    vec2 next = uv + offset;
    vec3 other=texture2D(tId,next).rgb;
    float hasObject=step(0.0001,length(id)+length(other));
    float idEdge=1.0-sameId(id,other);
    // Hardware depth is affine across a projected plane (unlike linear view depth).
    // Estimate the continuous slope from either side of this candidate edge.
    float z0=texture2D(tDepth,uv).x, z1=texture2D(tDepth,next).x;
    float backDelta=z0-texture2D(tDepth,uv-offset).x;
    float aheadDelta=texture2D(tDepth,next+offset).x-z1;
    float back=abs(backDelta), ahead=abs(aheadDelta);
    // Separate IDs on the same projected plane are not a geometric contour.
    // This suppresses depth-buffer tie flicker between overlapping wall panels.
    float planeError=max(abs((z1-z0)-backDelta),abs(aheadDelta-(z1-z0)));
    idEdge*=smoothstep(0.00000025,0.000001,planeError);
    float backValid=sameId(id,texture2D(tId,uv-offset).rgb);
    float aheadValid=sameId(other,texture2D(tId,next+offset).rgb);
    float slope=min(mix(1.0,back,backValid),mix(1.0,ahead,aheadValid));
    slope *= max(backValid,aheadValid);
    float tolerance=max(0.03,d*0.018)/(cameraFar-cameraNear);
    tolerance=mix(tolerance,tolerance*cameraNear*cameraFar/max(d*d,0.0001),perspective);
    float depthEdge=step(max(tolerance,0.000002)+slope*1.25,abs(z1-z0));
    return max(idEdge,depthEdge)*hasObject;
  }
  float celMask(vec2 uv, float receiverDepth) {
    // Do not paint a rear actor's offset shadow over a nearer surface.
    return texture2D(tId,uv).a * step(viewDepth(uv),receiverDepth+0.001);
  }
  void main() {
    vec2 px=1.0/resolution;
    vec4 source=texture2D(tDiffuse,vUv);
    vec3 c=source.rgb;
    vec2 q=gl_FragCoord.xy/max(pixelRatio,1.0);
    if(celShadow>0.0) {
      float receiver=viewDepth(vUv);
      vec2 offset=vec2(2.5,-2.5)*px*pixelRatio;
      vec2 sampleUv=vUv-offset;
      float mask=celMask(sampleUv,receiver)*0.5;
      mask+=celMask(sampleUv+px*pixelRatio,receiver)*0.25;
      mask+=celMask(sampleUv-px*pixelRatio,receiver)*0.25;
      mask*=1.0-texture2D(tId,vUv).a;
      c=mix(c,c*0.55,mask*celShadow);
    }
    if(acrylic>0.0) {
      vec2 r=px*pixelRatio*(1.2+acrylic*2.4);
      // Color-aware scatter avoids dragging bright surfaces across dark edges.
      vec3 scatter=c;
      float weight=1.0;
      float luminance=dot(c,vec3(0.2126,0.7152,0.0722));
      for(int axis=0;axis<4;axis++) {
        vec2 offset=axis==0?vec2(r.x,0.0):axis==1?vec2(-r.x,0.0):axis==2?vec2(0.0,r.y):vec2(0.0,-r.y);
        vec3 neighbor=texture2D(tDiffuse,vUv+offset).rgb;
        float w=exp(-abs(dot(neighbor,vec3(0.2126,0.7152,0.0722))-luminance)*32.0);
        scatter+=neighbor*w;
        weight+=w;
      }
      c=mix(c,scatter/weight,0.24*acrylic);
      // Preserve black and colored night lighting; veil belongs in brighter tones.
      float veil=smoothstep(0.02,0.45,luminance);
      c=mix(c,vec3(0.87,0.9,0.89),0.075*acrylic*veil);
      float fine=hash(floor(q)+vec2(41.7,93.1))-0.5;
      float coarse=hash(floor(q/2.4)+vec2(8.3,27.9))-0.5;
      c+=(fine*0.75+coarse*0.25)*min(vec3(0.085),c*0.3)*acrylic;
    }
    if(penWidth>0.0) {
      vec2 center=(floor(vUv*resolution)+0.5)*px;
      vec3 id=texture2D(tId,center).rgb;
      float d=viewDepth(center);
      float pressure=0.82+0.3*hash(floor(q/5.0));
      vec2 r=px*max(vec2(1.0),floor(vec2(pixelRatio*penWidth*pressure)+0.5));
      float edge=boundary(center,vec2(r.x,0),id,d);
      edge=max(edge,boundary(center,-vec2(r.x,0),id,d));
      edge=max(edge,boundary(center,vec2(0,r.y),id,d));
      edge=max(edge,boundary(center,-vec2(0,r.y),id,d));
      float ink=0.8+0.2*hash(floor(q*1.7));
      c=mix(c,min(c,penColor),edge*ink);
    }
    // Relative noise in shadows, bounded absolute noise in highlights.
    c+=(hash(floor(q)+floor(time*24.0)*vec2(7.13,3.71))-0.5)*min(vec3(0.1),c*0.3)*grain;
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
  private celShadowSelect?: (mesh: Mesh) => boolean;
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
        celShadow: { value: 0 },
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
    if (options.celShadowSelect !== undefined)
      this.celShadowSelect = options.celShadowSelect;
    for (const key of [
      "penWidth",
      "grain",
      "acrylic",
      "pixelRatio",
      "celShadow",
    ] as const) {
      const value = options[key];
      if (value === undefined) continue;
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        ((key === "grain" || key === "acrylic" || key === "celShadow") &&
          value > 1) ||
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
  private idMaterial(source: Material, id: number, cel: boolean): Material {
    const key = `${source.uuid}:${id}:${cel}`;
    let m = this.idMaterials.get(key);
    if (!m) {
      m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      const color = new Color();
      color.r = (id & 255) / 255;
      color.g = ((id >> 8) & 255) / 255;
      color.b = ((id >> 16) & 255) / 255;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.inkId = { value: color };
        shader.uniforms.inkCel = { value: cel ? 1 : 0 };
        shader.fragmentShader =
          "uniform vec3 inkId; uniform float inkCel;\n" +
          shader.fragmentShader.replace(
            "gl_FragColor = packDepthToRGBA( fragCoordZ );",
            "gl_FragColor = vec4(inkId,inkCel);",
          );
      };
      m.customProgramCacheKey = () => "three-ink-id-v2";
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
      "polygonOffset",
      "polygonOffsetFactor",
      "polygonOffsetUnits",
      "depthTest",
      "depthWrite",
      "depthFunc",
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
    if (u.penWidth.value > 0 || u.celShadow.value > 0) {
      const changed: { mesh: Mesh; material: Material | Material[] }[] = [];
      const hidden: Object3D[] = [];
      const background = this.scene.background,
        override = this.scene.overrideMaterial;
      const clearColor = renderer.getClearColor(new Color()),
        clearAlpha = renderer.getClearAlpha();
      const autoClear = renderer.autoClear,
        shadowUpdate = renderer.shadowMap.autoUpdate,
        shadowNeedsUpdate = renderer.shadowMap.needsUpdate,
        xr = renderer.xr.enabled;
      const oldTarget = renderer.getRenderTarget();
      let id = 1;
      try {
        this.scene.traverse((o) => {
          if ((o as Mesh).isMesh) {
            const mesh = o as Mesh;
            changed.push({ mesh, material: mesh.material });
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) =>
                  this.idMaterial(
                    m,
                    id++,
                    this.celShadowSelect?.(mesh) ?? false,
                  ),
                )
              : this.idMaterial(
                  mesh.material,
                  id++,
                  this.celShadowSelect?.(mesh) ?? false,
                );
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
        renderer.shadowMap.needsUpdate = false;
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
        renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
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
