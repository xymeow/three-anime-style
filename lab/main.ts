import { createContactShadow } from "./contact-shadow";
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
} from "../src/index";
import {
  backdrop,
  characterStage,
  palettes,
  type Fixture,
  type Role,
} from "./scenes";
const el = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;
const select = (id: string) => el<HTMLSelectElement>(id);
const input = (id: string) => el<HTMLInputElement>(id);
const value = (id: string) => Number(input(id).value);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(42, 1, 0.05, 200);
const ambient = new T.AmbientLight("white", 0.6);
const key = new T.DirectionalLight("white", 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -15;
key.shadow.camera.right = 15;
key.shadow.camera.top = 15;
key.shadow.camera.bottom = -15;
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.08;
scene.add(ambient, key, key.target);
const contactShadow = createContactShadow();
scene.add(contactShadow);
const contactAnchor = new T.Vector3();
let contactBone: T.Object3D | undefined;
const ratio = Math.min(devicePixelRatio, 1.5);
function pipeline(id: string) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(ratio);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  el(id).append(renderer.domElement);
  const composer = new EffectComposer(renderer),
    ink = new InkPass(scene, camera, {
      pixelRatio: ratio,
      celShadowSelect: (mesh) => mesh.userData.inkCel === true,
      penWidth: 0,
      grain: 0,
      acrylic: 0,
    });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(ink);
  composer.addPass(new OutputPass());
  return { renderer, composer, ink };
}
const left = pipeline("left"),
  right = pipeline("right");
const controls = new OrbitControls(camera, el("views"));
controls.enableDamping = true;
const brush = createBrushTexture();
const models: Record<
  string,
  { file: string; name: string; url: string; author: string; license: string }
> = {
  cesium: {
    file: "cesium-man.glb",
    name: "Cesium Man",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan",
    author: "Cesium",
    license: "CC BY 4.0（商标另列）",
  },
  quaternius: {
    file: "quaternius-character.glb",
    name: "Character Animated",
    url: "https://poly.pizza/m/DgOCW9ZCRJ",
    author: "Quaternius",
    license: "CC0",
  },
  robot: {
    file: "robot-expressive.glb",
    name: "Robot Expressive",
    url: "https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive",
    author: "Quaternius / Don McCurdy",
    license: "CC0",
  },
};
let fixture: Fixture | undefined,
  binding: InkBinding | undefined,
  mixer: T.AnimationMixer | undefined,
  clips: T.AnimationClip[] = [];
let initialCompare = new URLSearchParams(location.search).get("compare");
let current = "terrain",
  generation = 0,
  elapsed = 0,
  paused = false;
const originals = new Map<
  T.MeshStandardMaterial,
  {
    color: T.Color;
    map: T.Texture | null;
    normal: T.Texture | null;
    flat: boolean;
  }
>();
function disposeFixture() {
  binding?.dispose();
  binding = undefined;
  left.ink.reset();
  right.ink.reset();
  if (!fixture) return;
  contactBone = undefined;
  contactShadow.visible = false;
  mixer?.stopAllAction();
  mixer?.uncacheRoot(fixture.root);
  mixer = undefined;
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  fixture.root.traverse((o) => {
    if (!(o as T.Mesh).isMesh) return;
    const m = o as T.Mesh;
    geometries.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      materials.add(mat);
      for (const v of Object.values(mat))
        if (v instanceof T.Texture) textures.add(v);
    }
    if ((m as T.SkinnedMesh).isSkinnedMesh)
      (m as T.SkinnedMesh).skeleton.dispose();
  });
  for (const original of originals.values()) {
    if (original.map) textures.add(original.map);
    if (original.normal) textures.add(original.normal);
  }
  scene.remove(fixture.root);
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  originals.clear();
  fixture = undefined;
}
function paintScale() {
  return (models[current] ? 0.5 : 0.23) / (value("size") / 100);
}
function updateLight() {
  const a = (value("light") * Math.PI) / 180;
  key.position.set(Math.sin(a) * 10, 5, Math.cos(a) * 10);
  key.target.position.set(0, 1, 0);
}
function restyle() {
  if (!fixture) return;
  binding?.dispose();
  left.ink.reset();
  right.ink.reset();
  const p = palettes[select("palette").value];
  scene.background = new T.Color(p.bg);
  key.color.set(p.key);
  ambient.color.set(p.ambient);
  for (const [m, original] of originals) {
    m.color.copy(original.color);
    m.map = original.map;
    m.normalMap = original.normal;
    m.flatShading = original.flat;
    const role = m.userData.role as Role | undefined;
    if (role) m.color.set(p[role]);
    else {
      if (input("clay").checked) {
        m.color.set("#bbbbbb");
        m.map = null;
        m.normalMap = null;
      }
      if (select("shape").value === "faceted") m.flatShading = true;
    }
    m.needsUpdate = true;
  }
  binding = applyInk(fixture.root, {
    shadow: p.shadow,
    shadowHighlight: input("shadow-highlight").checked ? 0.65 : 0,
    mid: p.mid,
    light: p.light,
    paint: {
      map: brush,
      strength: value("paint") / 100,
      scale: paintScale(),
      select: (mesh) => mesh.userData.inkPaint === true,
    },
  });
  updateLabels();
}
function updateLabels() {
  const brushMode = select("compare").value === "brush";
  el("left-label").textContent = brushMode ? "背景 · 无笔触" : "原材质";
  el("right-label").textContent = brushMode
    ? "背景 · 宽笔触"
    : "三渲二 + 背景笔触";
  if (select("compare").value === "shadows") {
    el("left-label").textContent = "三渲二 · 普通投影";
    el("right-label").textContent =
      select("shadow-mode").value === "anime"
        ? "三渲二 · 动画阴影"
        : "三渲二 · 普通投影";
  }
  el("paint-out").textContent = `${value("paint")}%`;
  el("size-out").textContent = `${(value("size") / 100).toFixed(1)}×`;
  el("pen-out").textContent = `${(value("pen") / 10).toFixed(1)} px`;
  for (const id of ["grain", "frost"])
    el(`${id}-out`).textContent = `${value(id)}%`;
  const url = new URL(location.href);
  url.searchParams.set("scene", current);
  url.searchParams.set("palette", select("palette").value);
  url.searchParams.set("compare", select("compare").value);
  history.replaceState(null, "", url);
}
function fit() {
  if (!fixture) return;
  const size = new T.Box3()
      .setFromObject(fixture.root)
      .getSize(new T.Vector3()),
    d = fixture.direction.clone().normalize();
  const width = models[current]
      ? 4
      : size.x * Math.abs(d.z) + size.z * Math.abs(d.x),
    height = models[current]
      ? 4.2
      : size.y + Math.max(size.x, size.z) * Math.abs(d.y) * 0.75;
  const distance =
    (Math.max(height, width / camera.aspect) /
      2 /
      Math.tan(T.MathUtils.degToRad(camera.fov / 2))) *
    1.13;
  controls.target.copy(fixture.target);
  camera.position.copy(fixture.target).addScaledVector(d, distance);
  camera.lookAt(fixture.target);
  controls.update();
}
function resize() {
  const { width, height } = el("left").getBoundingClientRect();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  for (const p of [left, right]) {
    p.renderer.setSize(width, height);
    p.composer.setSize(width, height);
  }
}
new ResizeObserver(resize).observe(el("views"));
resize();
function playClip() {
  if (!mixer) return;
  mixer.stopAllAction();
  const clip = clips[Number(select("clip").value)];
  if (clip) mixer.clipAction(clip).play();
  elapsed = 0;
}
async function choose(name: string) {
  const token = ++generation;
  el("stats").textContent = "正在载入…";
  try {
    let next: Fixture,
      animations: T.AnimationClip[] = [];
    if (models[name]) {
      const gltf = await new GLTFLoader().loadAsync(
        `${import.meta.env.BASE_URL}lab-models/${models[name].file}`,
      );
      gltf.scene.traverse((o) => {
        if ((o as T.Mesh).isMesh) o.userData.inkCel = true;
      });
      next = characterStage(gltf.scene);
      animations = gltf.animations;
    } else next = backdrop(name, select("shape").value === "faceted");
    if (token !== generation) {
      const holder = next.root;
      holder.traverse((o) => {
        if ((o as T.Mesh).isMesh) (o as T.Mesh).geometry.dispose();
      });
      return;
    }
    disposeFixture();
    fixture = next;
    current = name;
    scene.add(next.root);
    clips = animations;
    let triangles = 0,
      meshes = 0,
      skinned = 0,
      morphs = 0;
    const bones = new Set<T.Bone>();
    fixture.root.traverse((o) => {
      if (!(o as T.Mesh).isMesh) return;
      const m = o as T.Mesh;
      meshes++;
      triangles +=
        (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
      if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
      if (!models[name] && !m.userData.inkPaint) m.userData.inkCel = true;
      if (models[name] && !contactBone && (o as T.SkinnedMesh).isSkinnedMesh)
        contactBone = (o as T.SkinnedMesh).skeleton.bones.find((b) =>
          /hips|pelvis/i.test(b.name),
        );
      m.castShadow = true;
      m.receiveShadow = true;
      if ((m as T.SkinnedMesh).isSkinnedMesh) {
        skinned++;
        (m as T.SkinnedMesh).skeleton.bones.forEach((b) => bones.add(b));
      }
      morphs += m.morphTargetInfluences?.length ?? 0;
      for (const material of Array.isArray(m.material)
        ? m.material
        : [m.material]) {
        const s = material as T.MeshStandardMaterial;
        if (s.color && !originals.has(s))
          originals.set(s, {
            color: s.color.clone(),
            map: s.map ?? null,
            normal: s.normalMap ?? null,
            flat: s.flatShading,
          });
      }
    });
    input("clay").disabled = !models[name];
    input("shadows").checked = Boolean(models[name]);
    key.castShadow = Boolean(models[name]);
    el("face").hidden = !models[name];
    el("anime-options").hidden = !models[name];
    select("shadow-mode").value = models[name] ? "anime" : "standard";
    el("expression-row").hidden = name !== "robot";
    select("expression").value = "";
    select("compare").value = models[name] ? "source" : "brush";
    if (
      initialCompare &&
      ["source", "brush", "shadows"].includes(initialCompare)
    ) {
      select("compare").value = initialCompare;
      initialCompare = null;
    }
    el("clip-row").hidden = clips.length === 0;
    select("clip").replaceChildren(
      ...clips.map((c, i) => new Option(c.name, String(i))),
    );
    if (clips.length) {
      mixer = new T.AnimationMixer(fixture.root);
      const idle = clips.findIndex((c) => /^idle$/i.test(c.name));
      select("clip").value = String(Math.max(0, idle));
      playClip();
    }
    el("pause").hidden = !clips.length;
    el("note").textContent =
      next.note + (models[name] ? " “分面”只改变法线插值，保留原网格。" : "");
    document
      .querySelectorAll<HTMLButtonElement>("[data-scene]")
      .forEach((b) => b.classList.toggle("active", b.dataset.scene === name));
    el("credit").replaceChildren();
    const model = models[name];
    if (model) {
      const a = document.createElement("a");
      a.href = model.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = `${model.name} · ${model.author} · ${model.license}`;
      el("credit").append(a);
    } else
      el("credit").textContent =
        "原创程序化场景 · 同一组材质角色映射到六套配色";
    restyle();
    updateLight();
    fit();
    el("stats").textContent =
      `${Math.round(triangles).toLocaleString()} 场景三角面 · ${meshes} 网格 · ${originals.size} 材质 · ${bones.size} 骨骼 · ${skinned} 蒙皮网格 · ${morphs} 形变目标 · ${clips.length} 动作${binding?.skipped.length ? ` · ${binding.skipped.length} 材质保留原样` : ""}`;
  } catch (error) {
    el("stats").textContent = `加载失败：${String(error)}`;
    console.error(error);
  }
}
document
  .querySelectorAll<HTMLButtonElement>("[data-scene]")
  .forEach((b) => (b.onclick = () => void choose(b.dataset.scene!)));
select("palette").onchange = restyle;
select("compare").onchange = () => {
  if (select("compare").value === "shadows")
    select("shadow-mode").value = "anime";
  updateLabels();
};
select("shadow-mode").onchange = updateLabels;
select("shape").onchange = () =>
  models[current] ? restyle() : void choose(current);
input("clay").onchange = restyle;
select("clip").onchange = playClip;
for (const id of ["paint", "size", "pen", "grain", "frost"])
  input(id).oninput = updateLabels;
input("light").oninput = updateLight;
el("fit").onclick = fit;
input("shadows").onchange = () => {
  key.castShadow = input("shadows").checked;
};
el("face").onclick = () => {
  if (!fixture) return;
  controls.target.set(0, 2.75, 0);
  camera.position
    .copy(controls.target)
    .addScaledVector(fixture.direction.clone().normalize(), 3.2);
  controls.update();
};
el("pause").onclick = () => {
  paused = !paused;
  el("pause").textContent = paused ? "继续动画" : "暂停动画";
};
el("finish").onclick = () => {
  input("pen").value = "11";
  input("grain").value = "50";
  input("frost").value = "50";
  updateLabels();
};
el("clean").onclick = () => {
  for (const id of ["pen", "grain", "frost"]) input(id).value = "0";
  updateLabels();
};
el("save").onclick = () => {
  const a = left.renderer.domElement,
    b = right.renderer.domElement,
    c = document.createElement("canvas");
  c.width = a.width + b.width;
  c.height = a.height + 54;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f5f3ed";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(a, 0, 54);
  ctx.drawImage(b, a.width, 54);
  ctx.fillStyle = "#222";
  ctx.font = "20px sans-serif";
  ctx.fillText(
    `${el("left-label").textContent} · ${palettes[select("palette").value].name}`,
    18,
    34,
  );
  ctx.fillText(el("right-label").textContent!, a.width + 18, 34);
  const link = document.createElement("a");
  link.download = `three-ink-${current}-${select("palette").value}.png`;
  link.href = c.toDataURL();
  link.click();
};
function configureShadowStyle(stylized: boolean) {
  if (!fixture) return;
  const anime = stylized && select("shadow-mode").value === "anime";
  key.castShadow = input("shadows").checked;
  fixture.root.traverse((o) => {
    if ((o as T.Mesh).isMesh) {
      const mesh = o as T.Mesh;
      mesh.castShadow = !(anime && mesh.userData.inkCel);
      mesh.receiveShadow = !(anime && mesh.userData.inkCel);
    }
  });
  contactShadow.visible = Boolean(
    anime && models[current] && input("contact-shadow").checked,
  );
  if (contactShadow.visible) {
    contactAnchor.set(0, 0, 0);
    contactBone?.getWorldPosition(contactAnchor);
    contactShadow.position.set(contactAnchor.x, 0.012, contactAnchor.z);
    contactShadow.material.uniforms.color.value.set(
      palettes[select("palette").value].ink,
    );
  }
}
let previous = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (!paused) elapsed += delta;
  mixer?.setTime(steppedTime(elapsed, Number(select("fps").value)));
  controls.update();
  if (fixture && current === "robot")
    fixture.root.traverse((o) => {
      const m = o as T.Mesh;
      if (m.morphTargetDictionary && m.morphTargetInfluences)
        for (const [name, index] of Object.entries(m.morphTargetDictionary))
          m.morphTargetInfluences[index] =
            name === select("expression").value ? 1 : 0;
    });
  if (!binding) return;
  const brushMode = select("compare").value === "brush",
    p = palettes[select("palette").value];
  const effects = {
    penWidth: value("pen") / 10,
    grain: value("grain") / 100,
    acrylic: value("frost") / 100,
    penColor: p.ink,
  };
  try {
    configureShadowStyle(false);
    binding.setEnabled(brushMode || select("compare").value === "shadows");
    binding.setShadowHighlight(0);
    binding.setPaint({
      strength: brushMode ? 0 : value("paint") / 100,
      scale: paintScale(),
    });
    left.ink.configure(
      brushMode || select("compare").value === "shadows"
        ? { ...effects, celShadow: 0 }
        : { ...effects, penWidth: 0, grain: 0, acrylic: 0, celShadow: 0 },
    );
    left.composer.render(delta);
    configureShadowStyle(true);
    binding.setEnabled(true);
    binding.setShadowHighlight(
      input("shadow-highlight").checked &&
        select("shadow-mode").value === "anime"
        ? 0.65
        : 0,
    );
    binding.setPaint({ strength: value("paint") / 100, scale: paintScale() });
    right.ink.configure({
      ...effects,
      celShadow:
        input("layer-shadow").checked && select("shadow-mode").value === "anime"
          ? 0.45
          : 0,
    });
    right.composer.render(delta);
  } finally {
    binding.setEnabled(true);
    configureShadowStyle(false);
  }
}
const params = new URLSearchParams(location.search);
if (palettes[params.get("palette") ?? ""])
  select("palette").value = params.get("palette")!;
void choose(params.get("scene") ?? "terrain");
requestAnimationFrame(frame);
