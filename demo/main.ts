import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  applyInk,
  createBrushTexture,
  InkPass,
  steppedTime,
  type InkBinding,
} from "../src/index.js";
import {
  courtyard,
  lighthouse,
  withPaintedStage,
  isScenery,
} from "./scenery.js";
import { studioRobot } from "./model.js";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const viewport = $("viewport"),
  status = $("status");
const renderer = new T.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
viewport.prepend(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color("#d8dfd5");
const camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(5, 3.8, 7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.4, 0);
controls.enableDamping = true;
scene.add(new T.AmbientLight("#d4dfec", 0.6));
const key = new T.DirectionalLight("#fff3d8", 3);
key.position.set(-3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ink = new InkPass(scene, camera, {
  pixelRatio: renderer.getPixelRatio(),
  acrylic: 0.5,
  grain: 0.5,
});
composer.addPass(ink);
composer.addPass(new OutputPass());
const brushMap = createBrushTexture();
let paintScale = 0.24,
  currentClips: T.AnimationClip[] = [];
let model: T.Object3D,
  binding: InkBinding,
  mixer: T.AnimationMixer | undefined,
  animate: ((t: number) => void) | undefined;
let mode = "ink",
  generation = 0,
  start = performance.now();
function disposeModel(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    if (!(o as T.Mesh).isMesh) return;
    const m = o as T.Mesh;
    geometries.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      materials.add(mat);
      for (const v of Object.values(mat))
        if (v instanceof T.Texture) textures.add(v);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
function mount(
  root: T.Object3D,
  name: string,
  clips: T.AnimationClip[] = [],
  motion?: (t: number) => void,
) {
  if (model) {
    binding.dispose();
    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    }
    scene.remove(model);
    disposeModel(model);
  }
  ink.reset();
  model = root;
  scene.add(root);
  const extent = new T.Box3().setFromObject(root).getSize(new T.Vector3());
  paintScale = 1.8 / Math.max(extent.x, extent.y, extent.z, 0.1);
  binding = applyInk(root, {
    paint: { map: brushMap, scale: paintScale, select: isScenery },
  });
  animate = motion;
  mixer = clips.length ? new T.AnimationMixer(root) : undefined;
  currentClips = clips;
  const motionSelect = $<HTMLSelectElement>("motion");
  motionSelect.replaceChildren();
  clips.forEach((clip, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = clip.name || `Clip ${index + 1}`;
    motionSelect.append(option);
  });
  $("motion-label").hidden = !clips.length;
  if (clips.length) {
    const index = Math.max(
      0,
      clips.findIndex((c) => c.name.toLowerCase() === "walk"),
    );
    motionSelect.value = String(index);
    mixer!.clipAction(clips[index]).play();
  }
  start = performance.now();
  const box = new T.Box3().setFromObject(root),
    center = box.getCenter(new T.Vector3()),
    size = box.getSize(new T.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.1);
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new T.Vector3(1, 0.6, 1.6).normalize().multiplyScalar(radius * 1.85));
  camera.near = radius / 100;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.2;
  controls.maxDistance = radius * 10;
  key.target.position.copy(center);
  scene.add(key.target);
  key.shadow.camera.left = key.shadow.camera.bottom = -radius;
  key.shadow.camera.right = key.shadow.camera.top = radius;
  key.shadow.camera.far = radius * 10;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = radius * 0.003;
  updateLight();
  $("model-name").textContent = name.toUpperCase();
  status.textContent = `${binding.materials.length} materials adapted${clips.length ? ` · ${clips.length} animation clip${clips.length === 1 ? "" : "s"}` : ""}.`;
  if (binding.skipped.length)
    status.textContent +=
      " Kept original: " +
      binding.skipped.map((s) => `${s.object}: ${s.reason}`).join("; ");
  updateMode();
}
function updateLight() {
  if (!model) return;
  const size = new T.Box3()
    .setFromObject(model)
    .getSize(new T.Vector3())
    .length();
  const a = (Number($<HTMLInputElement>("light").value) * Math.PI) / 180;
  key.position
    .copy(controls.target)
    .add(new T.Vector3(Math.sin(a) * size, size * 1.3, Math.cos(a) * size));
}
function updatePaint() {
  binding?.setPaint({
    strength:
      mode === "cel" ? 0 : Number($<HTMLInputElement>("paint").value) / 100,
    scale: (paintScale * 100) / Number($<HTMLInputElement>("brush-size").value),
  });
}
function updateMode() {
  updatePaint();
  binding?.setEnabled(mode !== "original");
  ink.enabled = mode === "ink";
  document
    .querySelectorAll<HTMLButtonElement>("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
}
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      mode = b.dataset.mode!;
      updateMode();
    }),
);
for (const id of ["acrylic", "grain", "pen"])
  $<HTMLInputElement>(id).oninput = () => {
    const v = Number($<HTMLInputElement>(id).value);
    $(id + "-value").textContent =
      id === "pen" ? `${(v / 10).toFixed(1)} px` : `${v}%`;
    ink.configure(id === "pen" ? { penWidth: v / 10 } : { [id]: v / 100 });
  };
$<HTMLInputElement>("light").oninput = updateLight;
const examples = {
  robot: {
    name: "Studio robot",
    credit: "Original procedural model · MIT",
    url: "https://github.com/xymeow/three-ink",
    factory: studioRobot,
  },
  courtyard: {
    name: "Sunlit courtyard",
    credit: "Original architectural scene · MIT",
    url: "https://github.com/xymeow/three-ink",
    factory: courtyard,
  },
  lighthouse: {
    name: "Lighthouse coast",
    credit: "Original coastal scene · MIT",
    url: "https://github.com/xymeow/three-ink",
    factory: lighthouse,
  },
  avocado: {
    name: "Avocado",
    credit: "Microsoft · CC0 · via Khronos",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Avocado",
    file: "models/avocado.glb",
    stage: true,
  },
  fox: {
    name: "Animated fox",
    credit: "PixelMannen / tomkranis / AsoboStudio / scurest · CC0 + CC BY 4.0",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox",
    file: "models/fox.glb",
    stage: true,
  },
  fixture: {
    name: "Animation fixture",
    credit: "Original skinning + morph fixture · MIT",
    url: "https://github.com/xymeow/three-ink",
    file: "animation-fixture.glb",
    stage: false,
  },
};
type ExampleKey = keyof typeof examples;
function credit(text: string, url?: string) {
  const el = $<HTMLAnchorElement>("credit");
  el.textContent = text;
  if (url) el.href = url;
  else el.removeAttribute("href");
}
function markExample(id: string) {
  document
    .querySelectorAll<HTMLButtonElement>("[data-example]")
    .forEach((b) => b.classList.toggle("active", b.dataset.example === id));
}
async function chooseExample(id: ExampleKey) {
  const token = ++generation,
    example = examples[id];
  status.textContent = "Opening " + example.name + "…";
  try {
    if ("factory" in example) {
      const item: { root: T.Object3D; animate?: (t: number) => void } =
        example.factory();
      mount(item.root, example.name, [], item.animate);
    } else {
      const response = await fetch(import.meta.env.BASE_URL + example.file);
      if (!response.ok) throw new Error("Model download failed");
      const gltf = await parseGLB(await response.arrayBuffer());
      if (token !== generation) {
        disposeModel(gltf.scene);
        return;
      }
      mount(
        example.stage ? withPaintedStage(gltf.scene) : gltf.scene,
        example.name,
        gltf.animations,
      );
    }
    credit(example.credit, example.url);
    markExample(id);
    const url = new URL(location.href);
    url.searchParams.set("example", id);
    history.replaceState(null, "", url);
  } catch (e) {
    if (token === generation) status.textContent = String(e);
  }
}
document
  .querySelectorAll<HTMLButtonElement>("[data-example]")
  .forEach(
    (b) =>
      (b.onclick = () => void chooseExample(b.dataset.example as ExampleKey)),
  );
$<HTMLSelectElement>("motion").onchange = () => {
  mixer?.stopAllAction();
  const clip = currentClips[Number($<HTMLSelectElement>("motion").value)];
  if (clip) mixer?.clipAction(clip).reset().play();
  start = performance.now();
};
for (const id of ["paint", "brush-size"])
  $<HTMLInputElement>(id).oninput = () => {
    $(id + "-value").textContent =
      id === "paint"
        ? `${$<HTMLInputElement>(id).value}%`
        : `${(Number($<HTMLInputElement>(id).value) / 100).toFixed(1)}×`;
    updatePaint();
  };
async function parseGLB(data: ArrayBuffer) {
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith("blob:") && !url.startsWith("data:"))
      throw new Error(
        "Embed textures in the GLB; external texture URLs are disabled.",
      );
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(data, "");
  // The viewer owns these freshly loaded geometries. Keep the reusable adapter non-mutating.
  gltf.scene.traverse((object) => {
    const mesh = object as T.Mesh;
    if (mesh.isMesh && !mesh.geometry.getAttribute("normal"))
      mesh.geometry.computeVertexNormals();
  });
  return gltf;
}
async function load(file: File) {
  const token = ++generation;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    status.textContent = "Choose a binary .glb with embedded textures.";
    return;
  }
  status.textContent = "Opening " + file.name + "…";
  try {
    const gltf = await parseGLB(await file.arrayBuffer());
    if (token !== generation) {
      disposeModel(gltf.scene);
      return;
    }
    mount(withPaintedStage(gltf.scene), file.name, gltf.animations);
    markExample("");
    credit("Local GLB · painted stage added by Three Ink");
  } catch (e) {
    if (token === generation)
      status.textContent =
        "Could not open this GLB. Use embedded assets without Draco / KTX2 compression. " +
        String(e);
  }
}
$<HTMLInputElement>("file").onchange = (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) void load(input.files[0]);
  input.value = "";
};
viewport.ondragover = (e) => {
  e.preventDefault();
  viewport.classList.add("dragging");
};
viewport.ondragleave = () => viewport.classList.remove("dragging");
viewport.ondrop = (e) => {
  e.preventDefault();
  viewport.classList.remove("dragging");
  if (e.dataTransfer?.files[0]) void load(e.dataTransfer.files[0]);
};
function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
$("capture").onclick = () => {
  composer.render(0);
  download(renderer.domElement.toDataURL("image/png"), "three-ink.png");
};
$("export").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          material: {
            thresholds: [0.51, 0.785],
            paint: {
              strength: Number($<HTMLInputElement>("paint").value) / 100,
              scale:
                (paintScale * 100) /
                Number($<HTMLInputElement>("brush-size").value),
            },
          },
          post: {
            acrylic: Number($<HTMLInputElement>("acrylic").value) / 100,
            grain: Number($<HTMLInputElement>("grain").value) / 100,
            penWidth: Number($<HTMLInputElement>("pen").value) / 10,
          },
          animationFps: Number($<HTMLSelectElement>("fps").value),
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  download(url, "three-ink.json");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
new ResizeObserver(() => {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(viewport);
const initial = new URLSearchParams(location.search).get("example");
void chooseExample(
  initial && Object.hasOwn(examples, initial)
    ? (initial as ExampleKey)
    : "courtyard",
);
let previous = performance.now();
renderer.setAnimationLoop((now) => {
  const delta = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  const t = steppedTime(
    Math.max(0, (now - start) / 1000),
    Number($<HTMLSelectElement>("fps").value),
  );
  mixer?.setTime(t);
  animate?.(t);
  controls.update();
  composer.render(delta);
});
