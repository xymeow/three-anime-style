import {
  Color,
  Material,
  Mesh,
  MeshToonMaterial,
  Object3D,
  Vector2,
  Texture,
} from "three";

export interface InkPaintSettings {
  /** Brush influence, 0..1. */
  strength?: number;
  /** Atlas repeats per world unit. Smaller values make larger strokes. */
  scale?: number;
}
export interface InkPaintOptions extends InkPaintSettings {
  /** Linear grayscale mask, midpoint 128/255. Caller-owned. */
  map: Texture;
  /** Select scenery meshes. Defaults to all meshes in this binding. */
  select?: (mesh: Mesh) => boolean;
}
export interface InkOptions {
  /** Selected scenery uses continuous painted lighting; other meshes keep three bands. */
  paint?: InkPaintOptions;
  /** Thresholds in the half-Lambert range 0..1. */
  thresholds?: [number, number];
  shadow?: string | number;
  mid?: string | number;
  light?: string | number;
}
export interface InkSkip {
  object: string;
  material: string;
  reason: string;
}
export interface InkBinding {
  readonly materials: MeshToonMaterial[];
  readonly skipped: InkSkip[];
  setEnabled(enabled: boolean): void;
  setPaint(settings: InkPaintSettings): void;
  dispose(): void;
}
const attached = new WeakSet<Mesh>();
/** Adapt ordinary mesh materials while keeping geometry, textures and animation owned by the caller. */
export function applyInk(root: Object3D, options: InkOptions = {}): InkBinding {
  const paintUniforms = {
    inkBrushMap: { value: options.paint?.map ?? null },
    inkPaintStrength: { value: options.paint?.strength ?? 0.7 },
    inkPaintScale: { value: options.paint?.scale ?? 0.24 },
  };
  function setPaint(settings: InkPaintSettings) {
    if (
      settings.strength !== undefined &&
      (!Number.isFinite(settings.strength) ||
        settings.strength < 0 ||
        settings.strength > 1)
    )
      throw new Error("paint strength must be between 0 and 1");
    if (
      settings.scale !== undefined &&
      (!Number.isFinite(settings.scale) || settings.scale <= 0)
    )
      throw new Error("paint scale must be positive");
    if (settings.strength !== undefined)
      paintUniforms.inkPaintStrength.value = settings.strength;
    if (settings.scale !== undefined)
      paintUniforms.inkPaintScale.value = settings.scale;
  }
  setPaint(options.paint ?? {});
  const thresholds = options.thresholds ?? [0.51, 0.785];
  if (
    !thresholds.every(Number.isFinite) ||
    thresholds[0] < 0 ||
    thresholds[1] > 1 ||
    thresholds[0] >= thresholds[1]
  ) {
    throw new Error("thresholds must be two increasing values between 0 and 1");
  }
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  if (meshes.some((m) => attached.has(m)))
    throw new Error(
      "This model already has an Ink binding. Dispose it before applying again.",
    );
  const cache = new Map<string, Material>();
  const skipped: InkSkip[] = [];
  const owned: MeshToonMaterial[] = [];
  const records: {
    mesh: Mesh;
    original: Material | Material[];
    ink: Material | Material[];
  }[] = [];
  for (const mesh of meshes) {
    const original = mesh.material;
    const painted = Boolean(
      options.paint && (!options.paint.select || options.paint.select(mesh)),
    );
    const convert = (source: Material): Material => {
      const s = source as Material & Record<string, any>;
      const reason = !mesh.geometry.getAttribute("normal")
        ? "Geometry has no normals"
        : s.isShaderMaterial || s.isRawShaderMaterial
          ? "Custom shader"
          : s.transmission > 0
            ? "Transmissive material"
            : s.transparent
              ? "Blended transparency"
              : !(
                    s.isMeshStandardMaterial ||
                    s.isMeshPhongMaterial ||
                    s.isMeshLambertMaterial ||
                    s.isMeshBasicMaterial ||
                    s.isMeshToonMaterial
                  )
                ? "Unsupported material type"
                : "";
      if (reason) {
        skipped.push({
          object: mesh.name || mesh.type,
          material: source.name || source.type,
          reason,
        });
        return source;
      }
      const cacheKey = `${source.uuid}:${painted}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;
      const material = new MeshToonMaterial();
      const target = material as Material & Record<string, any>;
      const keys = [
        "color",
        "map",
        "normalMap",
        "normalMapType",
        "normalScale",
        "bumpMap",
        "bumpScale",
        "displacementMap",
        "displacementScale",
        "displacementBias",
        "alphaMap",
        "alphaTest",
        "alphaHash",
        "opacity",
        "side",
        "shadowSide",
        "vertexColors",
        "emissive",
        "emissiveMap",
        "emissiveIntensity",
        "aoMap",
        "aoMapIntensity",
        "lightMap",
        "lightMapIntensity",
        "flatShading",
        "wireframe",
        "depthTest",
        "depthWrite",
        "colorWrite",
        "polygonOffset",
        "polygonOffsetFactor",
        "polygonOffsetUnits",
        "clippingPlanes",
        "clipIntersection",
        "clipShadows",
        "visible",
        "fog",
      ];
      for (const key of keys)
        if (s[key] !== undefined)
          target[key] =
            s[key]?.isColor || s[key]?.isVector2 ? s[key].clone() : s[key];
      material.name = `${source.name || source.type} / Ink`;
      const uniforms = {
        inkThresholds: { value: new Vector2(...thresholds) },
        inkShadow: { value: new Color(options.shadow ?? "#514f73") },
        inkMid: { value: new Color(options.mid ?? "#c1c4c9") },
        inkLight: { value: new Color(options.light ?? "#fff5df") },
      };
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        if (painted) {
          Object.assign(shader.uniforms, paintUniforms);
          // transformed already contains morphing, skinning and displacement.
          shader.vertexShader =
            "varying vec3 vInkWorldPosition;\n" +
            shader.vertexShader.replace(
              "#include <project_vertex>",
              `
            #include <project_vertex>
            vec4 inkPosition = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
              inkPosition = batchingMatrix * inkPosition;
            #endif
            #ifdef USE_INSTANCING
              inkPosition = instanceMatrix * inkPosition;
            #endif
            vInkWorldPosition = (modelMatrix * inkPosition).xyz;
          `,
            );
        }
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <gradientmap_pars_fragment>",
          `
          ${
            painted
              ? `
          uniform sampler2D inkBrushMap;
          uniform float inkPaintStrength, inkPaintScale;
          varying vec3 vInkWorldPosition;
          float inkBrush(vec3 n) {
            vec3 blend = pow(abs(inverseTransformDirection(n, viewMatrix)),vec3(4.0));
            blend /= max(dot(blend,vec3(1.0)),0.0001);
            vec3 p = vInkWorldPosition * inkPaintScale;
            vec3 strokes = vec3(texture2D(inkBrushMap,p.zy+vec2(.17,.31)).r,
              texture2D(inkBrushMap,p.xz+vec2(.43,.19)).r,
              texture2D(inkBrushMap,p.xy+vec2(.27,.61)).r);
            return dot(strokes,blend)-128.0/255.0;
          }`
              : ""
          }
          uniform vec2 inkThresholds;
          uniform vec3 inkShadow, inkMid, inkLight;
          vec3 getGradientIrradiance(vec3 n, vec3 l) {
            float v = dot(n,l)*0.5+0.5;
            ${
              painted
                ? `
            float transition = 1.0-smoothstep(.15,.48,abs(v-.53));
            v = clamp(v + inkBrush(n)*.55*inkPaintStrength*transition,0.0,1.0);
            return mix(inkShadow,inkLight,v);
            `
                : `
            float aa = max(fwidth(v), 0.001);
            vec3 c = mix(inkShadow, inkMid, smoothstep(inkThresholds.x-aa, inkThresholds.x+aa,v));
            return mix(c, inkLight, smoothstep(inkThresholds.y-aa, inkThresholds.y+aa,v));
            `
            }
          }
        `,
        );
      };
      material.customProgramCacheKey = () =>
        painted ? "three-ink-paint-v1" : "three-ink-toon-v1";
      cache.set(cacheKey, material);
      owned.push(material);
      return material;
    };
    const ink = Array.isArray(original)
      ? original.map(convert)
      : convert(original);
    records.push({ mesh, original, ink });
    attached.add(mesh);
    mesh.material = ink;
  }
  let disposed = false;
  return {
    materials: owned,
    setPaint(settings) {
      if (!disposed) setPaint(settings);
    },
    skipped,
    setEnabled(enabled) {
      if (disposed) return;
      for (const r of records)
        if (r.mesh.material === r.original || r.mesh.material === r.ink)
          r.mesh.material = enabled ? r.ink : r.original;
    },
    dispose() {
      if (disposed) return;
      for (const r of records) {
        if (r.mesh.material === r.ink) r.mesh.material = r.original;
        attached.delete(r.mesh);
      }
      for (const m of owned) m.dispose();
      disposed = true;
    },
  };
}
