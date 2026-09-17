// Original procedural test asset. Regenerate with: node scripts/create-fixture.mjs
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { writeFile } from "node:fs/promises";
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const scene = new T.Scene(),
  geometry = new T.CylinderGeometry(0.35, 0.45, 2, 16, 12);
const weights = [],
  indices = [];
for (let i = 0; i < geometry.attributes.position.count; i++) {
  const y = geometry.attributes.position.getY(i);
  const w = Math.max(0, Math.min(1, y + 0.5));
  weights.push(1 - w, w, 0, 0);
  indices.push(0, 1, 0, 0);
}
geometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
geometry.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
const skin = new T.SkinnedMesh(
  geometry,
  new T.MeshStandardMaterial({ color: "#699e97" }),
);
skin.name = "Bending sculpture";
skin.position.set(-0.8, 1, 0);
const bottom = new T.Bone(),
  top = new T.Bone();
bottom.name = "BaseBone";
top.name = "TipBone";
bottom.add(top);
skin.add(bottom);
skin.bind(new T.Skeleton([bottom, top]));
scene.add(skin);
const sphereGeo = new T.SphereGeometry(0.5, 20, 16),
  target = sphereGeo.attributes.position.clone();
for (let i = 0; i < target.count; i++) target.setY(i, target.getY(i) * 1.65);
sphereGeo.morphAttributes.position = [target];
const sphere = new T.Mesh(
  sphereGeo,
  new T.MeshStandardMaterial({ color: "#d89264" }),
);
sphere.name = "Breathing";
sphere.position.set(0.8, 0.85, 0);
scene.add(sphere);
const times = [0, 1, 2, 3, 4],
  values = [];
for (const a of [0, 0.5, 0, -0.5, 0]) {
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), a);
  values.push(...q.toArray());
}
const clip = new T.AnimationClip("Skin and morph", 4, [
  new T.QuaternionKeyframeTrack("TipBone.quaternion", times, values),
  new T.NumberKeyframeTrack(
    "Breathing.morphTargetInfluences",
    times,
    [0, 1, 0, 0.5, 0],
  ),
]);
const data = await new GLTFExporter().parseAsync(scene, {
  binary: true,
  animations: [clip],
});
await writeFile(
  new URL("../public/animation-fixture.glb", import.meta.url),
  Buffer.from(data),
);
