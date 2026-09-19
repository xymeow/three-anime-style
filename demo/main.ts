import {
  examples,
  loadExample,
  parseGLB,
  stageModel,
  disposeRoot,
  type ViewerScene,
} from "./catalog";
import { createContactShadow } from "../lab/contact-shadow";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
import { palettes, type Role } from "../lab/scenes";
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
let fixture: ViewerScene | undefined,
  binding: InkBinding | undefined,
  mixer: T.AnimationMixer | undefined,
  clips: T.AnimationClip[] = [];
let initialCompare = new URLSearchParams(location.search).get("compare");
let current = "terrain",
  generation = 0,
  elapsed = 0,
  paused = false;
let preset = "full";
const shadowFlags = new Map<T.Mesh, { cast: boolean; receive: boolean }>();
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
  // Restyle can temporarily detach source textures; restore them before disposal.
  for (const [material, original] of originals) {
    material.map = original.map;
    material.normalMap = original.normal;
  }
  scene.remove(fixture.root);
  disposeRoot(fixture.root);
  originals.clear();
  shadowFlags.clear();
  fixture = undefined;
}
function paintScale() {
  return (fixture?.character ? 0.5 : 0.23) / (value("size") / 100);
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
  if (preset === "original") el("right-label").textContent = "原材质";
  el("paint-out").textContent = `${value("paint")}%`;
  el("size-out").textContent = `${(value("size") / 100).toFixed(1)}×`;
  el("pen-out").textContent = `${(value("pen") / 10).toFixed(1)} px`;
  for (const id of ["grain", "frost"])
    el(`${id}-out`).textContent = `${value(id)}%`;
  const url = new URL(location.href);
  url.searchParams.delete("example");
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
  const width = fixture?.character
      ? 4
      : size.x * Math.abs(d.z) + size.z * Math.abs(d.x),
    height = fixture?.character
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
async function choose(name: string, file?: File) {
  const token = ++generation;
  el("stats").textContent = "正在载入…";
  try {
    let next: ViewerScene;
    if (file) {
      const gltf = await parseGLB(await file.arrayBuffer());
      next = stageModel(gltf.scene, gltf.animations);
    } else next = await loadExample(name, select("shape").value === "faceted");
    if (token !== generation) {
      disposeRoot(next.root);
      return;
    }
    disposeFixture();
    fixture = next;
    current = name;
    scene.add(next.root);
    clips = next.animations;
    elapsed = 0;
    paused = false;
    el("pause").textContent = "暂停动画";
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
      if (!m.userData.inkPaint) m.userData.inkCel = true;
      if (next.character && !contactBone && (o as T.SkinnedMesh).isSkinnedMesh)
        contactBone = (o as T.SkinnedMesh).skeleton.bones.find((b) =>
          /hips|pelvis/i.test(b.name),
        );
      m.castShadow = true;
      m.receiveShadow = true;
      shadowFlags.set(m, { cast: m.castShadow, receive: m.receiveShadow });
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
    input("clay").disabled = !next.character;
    input("shadows").checked = Boolean(next.character);
    key.castShadow = Boolean(next.character);
    el("face").hidden = !next.character;
    el("anime-options").hidden = !next.character;
    select("shadow-mode").value = next.character ? "anime" : "standard";
    el("expression-row").hidden = name !== "robot";
    select("expression").value = "";
    select("compare").value = next.character ? "source" : "brush";
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
    el("pause").hidden = !clips.length && !next.animate;
    el("note").textContent =
      next.note + (next.character ? " “分面”只改变法线插值，保留原网格。" : "");
    document
      .querySelectorAll<HTMLButtonElement>("[data-scene]")
      .forEach((b) => b.classList.toggle("active", b.dataset.scene === name));
    el("credit").replaceChildren();
    const model = examples[name];
    if (model) {
      const a = document.createElement("a");
      a.href = model.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = model.credit;
      el("credit").append(a);
    } else
      el("credit").textContent =
        `本地 GLB：${file?.name ?? ""} · 文件仅在浏览器中读取`;
    restyle();
    updateLight();
    fit();
    el("stats").textContent =
      `${Math.round(triangles).toLocaleString()} 场景三角面 · ${meshes} 网格 · ${originals.size} 材质 · ${bones.size} 骨骼 · ${skinned} 蒙皮网格 · ${morphs} 形变目标 · ${clips.length} 动作${binding?.skipped.length ? ` · ${binding.skipped.length} 材质保留原样` : ""}`;
  } catch (error) {
    if (token !== generation) return;
    el("stats").textContent = `加载失败：${String(error)}`;
    console.error(error);
  }
}
for (const [name, item] of Object.entries(examples)) {
  const button = document.createElement("button");
  button.textContent = item.label;
  button.dataset.scene = name;
  button.onclick = () => void choose(name);
  el("examples").append(button);
}
async function importFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".glb")) {
    el("stats").textContent = "请选择资源已嵌入的 .glb 文件。";
    return;
  }
  await choose("local", file);
}
input("file").onchange = () => {
  const file = input("file").files?.[0];
  if (file) void importFile(file);
  input("file").value = "";
};
el("views").ondragover = (event) => {
  event.preventDefault();
  el("views").classList.add("dragging");
};
el("views").ondragleave = () => el("views").classList.remove("dragging");
el("views").ondrop = (event) => {
  event.preventDefault();
  el("views").classList.remove("dragging");
  const file = event.dataTransfer?.files[0];
  if (file) void importFile(file);
};
select("preset").onchange = () => {
  preset = select("preset").value;
  if (preset === "original") select("compare").value = "source";
  input("paint").value = preset === "cel" ? "0" : "100";
  input("pen").value = preset === "full" ? "11" : "0";
  input("grain").value = input("frost").value = preset === "full" ? "50" : "0";
  updateLabels();
};
el("export").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          scene: current,
          palette: select("palette").value,
          comparison: select("compare").value,
          preset,
          material: {
            paint: { strength: value("paint") / 100, scale: paintScale() },
            shadowHighlight:
              input("shadow-highlight").checked &&
              select("shadow-mode").value === "anime"
                ? 0.65
                : 0,
          },
          post: {
            penWidth: value("pen") / 10,
            grain: value("grain") / 100,
            acrylic: value("frost") / 100,
            celShadow:
              input("layer-shadow").checked &&
              select("shadow-mode").value === "anime"
                ? 0.45
                : 0,
          },
          shadows: {
            mode: select("shadow-mode").value,
            computed: input("shadows").checked,
            contact: input("contact-shadow").checked,
          },
          animationFps: Number(select("fps").value),
          clip: select("clip").selectedOptions[0]?.text,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "three-anime-style.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
select("palette").onchange = restyle;
select("compare").onchange = () => {
  if (select("compare").value === "shadows") {
    select("shadow-mode").value = "anime";
    preset = select("preset").value = "full";
  }
  updateLabels();
};
select("shadow-mode").onchange = updateLabels;
select("shape").onchange = () =>
  examples[current]?.landscape ? void choose(current) : restyle();
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
  controls.target.copy(fixture.target).add(new T.Vector3(0, 0.5, 0));
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
  preset = select("preset").value = "full";
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
  link.download = `three-anime-style-${current}-${select("palette").value}.png`;
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
      const original = shadowFlags.get(mesh)!;
      mesh.castShadow = original.cast && !(anime && mesh.userData.inkCel);
      mesh.receiveShadow = original.receive && !(anime && mesh.userData.inkCel);
    }
  });
  contactShadow.visible = Boolean(
    anime && fixture?.character && input("contact-shadow").checked,
  );
  if (contactShadow.visible) {
    contactAnchor.set(0, 0, 0);
    contactBone?.getWorldPosition(contactAnchor);
    contactShadow.position.set(
      contactAnchor.x,
      fixture.contactY + 0.012,
      contactAnchor.z,
    );
    contactShadow.material.uniforms.color.value.set(
      palettes[select("palette").value].ink,
    );
  }
}
let previous = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const delta = Math.max(0, Math.min((now - previous) / 1000, 0.05));
  previous = now;
  if (!paused) elapsed += delta;
  const time = steppedTime(elapsed, Number(select("fps").value));
  mixer?.setTime(time);
  fixture?.animate?.(time);
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
  const styled = preset !== "original";
  const anime = styled && select("shadow-mode").value === "anime";
  const highlight = anime && input("shadow-highlight").checked ? 0.65 : 0;
  const offsetShadow = anime && input("layer-shadow").checked ? 0.45 : 0;
  const effects = {
    penWidth: value("pen") / 10,
    grain: value("grain") / 100,
    acrylic: value("frost") / 100,
    penColor: p.ink,
  };
  try {
    configureShadowStyle(brushMode && styled);
    binding.setEnabled(brushMode || select("compare").value === "shadows");
    binding.setShadowHighlight(brushMode ? highlight : 0);
    binding.setPaint({
      strength: brushMode ? 0 : value("paint") / 100,
      scale: paintScale(),
    });
    left.ink.configure(
      brushMode || select("compare").value === "shadows"
        ? { ...effects, celShadow: brushMode ? offsetShadow : 0 }
        : { ...effects, penWidth: 0, grain: 0, acrylic: 0, celShadow: 0 },
    );
    left.composer.render(delta);
    configureShadowStyle(styled);
    binding.setEnabled(styled);
    binding.setShadowHighlight(highlight);
    binding.setPaint({ strength: value("paint") / 100, scale: paintScale() });
    right.ink.configure({
      ...(styled ? effects : { ...effects, penWidth: 0, grain: 0, acrylic: 0 }),
      celShadow: offsetShadow,
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
// Old ?example=robot is the procedural robot; lab ?scene=robot is Robot Expressive.
const legacy = params.get("example");
const initial =
  params.get("scene") ?? (legacy === "robot" ? "studio" : legacy) ?? "robot";
void choose(Object.hasOwn(examples, initial) ? initial : "robot");
requestAnimationFrame(frame);
