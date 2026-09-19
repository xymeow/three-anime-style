import * as T from "three";
import { ContactShadow } from "../lab/contact-shadow";
const renderer = new T.WebGLRenderer();
renderer.setSize(256, 256);
renderer.setPixelRatio(1);
renderer.outputColorSpace = T.LinearSRGBColorSpace;
document.getElementById("view")!.append(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color(0xffffff);
const root = new T.Group();
scene.add(root);
const floor = new T.Mesh(
  new T.BoxGeometry(8, 0.1, 8),
  new T.MeshBasicMaterial({ color: 0xffffff }),
);
floor.position.y = -0.05;
floor.userData.inkPaint = true;
root.add(floor);
const material = new T.MeshBasicMaterial();
const a = new T.Mesh(new T.BoxGeometry(0.8, 1, 0.8), material);
a.position.set(-1.8, 0.5, 0);
a.userData.inkCel = true;
root.add(a);
const geometry = new T.SphereGeometry(0.45, 24, 16);
const morph = geometry.attributes.position.clone();
for (let i = 0; i < morph.count; i++) morph.setX(i, morph.getX(i) * 2);
geometry.morphAttributes.position = [morph];
const b = new T.Mesh(geometry, material);
b.position.set(1.8, 0.8, 0);
b.userData.inkCel = true;
root.add(b);
const light = new T.DirectionalLight();
light.position.set(0, 8, 0);
scene.add(light, light.target);
const shadow = new ContactShadow();
scene.add(shadow.mesh);
const camera = new T.OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
camera.position.set(0, 10, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
const output = new T.WebGLRenderTarget(256, 256);
const results: string[] = [];
function record(ok: boolean, label: string) {
  results.push(`${ok ? "PASS" : "FAIL"} ${label}`);
  document.getElementById("results")!.textContent = results.join("\n");
  if (!ok) throw Error(label);
}
const casters: T.Mesh[] = [a, b];
function capture(context = renderer) {
  shadow.update(context, scene, root, light, 0, 0x000000);
  shadow.mesh.visible = true;
  casters.forEach((mesh) => (mesh.visible = false));
  context.setRenderTarget(output);
  context.render(scene, camera);
  const data = new Uint8Array(256 * 256 * 4);
  context.readRenderTargetPixels(output, 0, 0, 256, 256, data);
  context.setRenderTarget(null);
  context.render(scene, camera);
  casters.forEach((mesh) => (mesh.visible = true));
  return (x: number, z: number) =>
    data[
      (Math.floor((1 - z / 4) * 128) * 256 + Math.floor((x / 4 + 1) * 128)) * 4
    ];
}
let sample = capture();
record(
  sample(-1.8, 0) < 230 && sample(1.8, 0) < 230 && sample(0, 0) > 250,
  "two separated casters produce two shadows, with an empty gap",
);
b.position.x = 0.6;
sample = capture();
record(
  sample(0.6, 0) < 230 && sample(1.8, 0) > 250,
  "moving one caster moves only its shadow",
);
b.morphTargetInfluences![0] = 1;
sample = capture();
record(
  sample(1.3, 0) < 230,
  "morph-target deformation changes the captured footprint",
);
b.morphTargetInfluences![0] = 0;
b.position.set(1.2, 1.5, 0);
light.position.set(4, 8, 0);
sample = capture();
record(
  sample(0.45, 0) < 230 && sample(1.4, 0) > 250,
  "elevated caster projects along the light direction rather than straight down",
);
light.position.set(0, 8, 0);
const skinGeometry = new T.BoxGeometry(0.25, 1, 0.25);
const indices: number[] = [],
  weights: number[] = [];
for (let i = 0; i < skinGeometry.attributes.position.count; i++) {
  indices.push(0, 1, 0, 0);
  const topWeight = skinGeometry.attributes.position.getY(i) > 0 ? 1 : 0;
  weights.push(1 - topWeight, topWeight, 0, 0);
}
skinGeometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
skinGeometry.setAttribute(
  "skinWeight",
  new T.Float32BufferAttribute(weights, 4),
);
const skin = new T.SkinnedMesh(skinGeometry, material);
const bottom = new T.Bone(),
  tip = new T.Bone();
tip.position.y = -0.5;
bottom.add(tip);
skin.add(bottom);
skin.bind(new T.Skeleton([bottom, tip]));
skin.position.set(-1.8, 0.5, 0);
skin.userData.inkCel = true;
root.add(skin);
casters.push(skin);
sample = capture();
const before = sample(-1, 0);
tip.rotation.z = -Math.PI / 2;
sample = capture();
record(
  before > 250 && sample(-1, 0) < 230,
  "skeletal pose deforms the actual projected silhouette",
);
const secondRenderer = new T.WebGLRenderer();
secondRenderer.setSize(256, 256);
secondRenderer.outputColorSpace = T.LinearSRGBColorSpace;
const secondSample = capture(secondRenderer);
sample = capture();
record(
  secondSample(-1, 0) < 230 && sample(-1, 0) < 230,
  "both comparison WebGL contexts receive the current projection",
);
const originalBackground = scene.background,
  originalMaterial = a.material;
const override = new T.MeshBasicMaterial();
scene.overrideMaterial = override;
renderer.setRenderTarget(output);
renderer.setClearColor(0x123456, 0.3);
renderer.autoClear = false;
renderer.shadowMap.autoUpdate = false;
const render = renderer.render;
renderer.render = () => {
  throw Error("intentional render failure");
};
let threw = false;
try {
  shadow.update(renderer, scene, root, light, 0, 0);
} catch {
  threw = true;
}
renderer.render = render;
record(
  threw &&
    a.material === originalMaterial &&
    scene.background === originalBackground &&
    scene.overrideMaterial === override &&
    renderer.getRenderTarget() === output &&
    !renderer.autoClear &&
    !renderer.shadowMap.autoUpdate &&
    Math.abs(renderer.getClearAlpha() - 0.3) < 0.001,
  "capture failure restores source materials, scene and renderer state",
);
scene.overrideMaterial = null;
renderer.autoClear = true;
renderer.setRenderTarget(null);
shadow.reset();
record(
  !shadow.ready && !shadow.mesh.visible,
  "reset removes the previous model's projection",
);
shadow.dispose();
shadow.dispose();
record(true, "dispose is safe to repeat");
