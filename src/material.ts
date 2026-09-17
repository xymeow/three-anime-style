import {
  Color,
  Material,
  Mesh,
  MeshToonMaterial,
  Object3D,
  Vector2,
} from "three";

export interface InkOptions {
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
  dispose(): void;
}
const attached = new WeakSet<Mesh>();
/** Adapt ordinary mesh materials while keeping geometry, textures and animation owned by the caller. */
export function applyInk(root: Object3D, options: InkOptions = {}): InkBinding {
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
  const cache = new Map<Material, Material>();
  const skipped: InkSkip[] = [];
  const owned: MeshToonMaterial[] = [];
  const records: {
    mesh: Mesh;
    original: Material | Material[];
    ink: Material | Material[];
  }[] = [];
  for (const mesh of meshes) {
    const original = mesh.material;
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
      if (cache.has(source)) return cache.get(source)!;
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
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <gradientmap_pars_fragment>",
          `
          uniform vec2 inkThresholds;
          uniform vec3 inkShadow, inkMid, inkLight;
          vec3 getGradientIrradiance(vec3 n, vec3 l) {
            float v = dot(n,l)*0.5+0.5;
            float aa = max(fwidth(v), 0.001);
            vec3 c = mix(inkShadow, inkMid, smoothstep(inkThresholds.x-aa, inkThresholds.x+aa,v));
            return mix(c, inkLight, smoothstep(inkThresholds.y-aa, inkThresholds.y+aa,v));
          }
        `,
        );
      };
      material.customProgramCacheKey = () => "three-ink-toon-v1";
      cache.set(source, material);
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
