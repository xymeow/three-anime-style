import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  applyInk,
  InkPass,
  steppedTime,
  type InkBinding,
} from "../src/index.js";
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
  binding = applyInk(root);
  animate = motion;
  mixer = clips.length ? new T.AnimationMixer(root) : undefined;
  clips.forEach((c) => mixer!.clipAction(c).play());
  start = performance.now();
  const box = new T.Box3().setFromObject(root),
    center = box.getCenter(new T.Vector3()),
    size = box.getSize(new T.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.1);
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new T.Vector3(1, 0.6, 1.6).normalize().multiplyScalar(radius * 2.1));
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
function updateMode() {
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
$("reset").onclick = () => {
  generation++;
  const robot = studioRobot();
  mount(robot.root, "Studio robot", [], robot.animate);
};
$("fixture").onclick = async () => {
  const token = ++generation;
  try {
    const response = await fetch(
      import.meta.env.BASE_URL + "animation-fixture.glb",
    );
    if (!response.ok) throw new Error("Fixture unavailable");
    const blob = await response.blob();
    if (token === generation)
      void load(new File([blob], "animation-fixture.glb"));
  } catch (e) {
    if (token === generation) status.textContent = String(e);
  }
};
async function load(file: File) {
  const token = ++generation;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    status.textContent = "Choose a binary .glb with embedded textures.";
    return;
  }
  status.textContent = "Opening " + file.name + "…";
  try {
    const manager = new T.LoadingManager();
    manager.setURLModifier((url) => {
      if (!url.startsWith("blob:") && !url.startsWith("data:"))
        throw new Error(
          "External texture URLs are disabled; embed textures in the GLB.",
        );
      return url;
    });
    const gltf = await new GLTFLoader(manager).parseAsync(
      await file.arrayBuffer(),
      "",
    );
    if (token !== generation) {
      disposeModel(gltf.scene);
      return;
    }
    mount(gltf.scene, file.name, gltf.animations);
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
          material: { thresholds: [0.51, 0.785] },
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
const robot = studioRobot();
mount(robot.root, "Studio robot", [], robot.animate);
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
