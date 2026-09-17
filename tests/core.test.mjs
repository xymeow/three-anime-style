import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { applyInk, InkPass, steppedTime } from "../dist/index.js";

test("shares adapters, keeps texture ownership, restores original arrays, disposes once", () => {
  const root = new T.Group(),
    texture = new T.Texture();
  const original = new T.MeshStandardMaterial({
    map: texture,
    color: "#ac6542",
  });
  const array = [original, original];
  const a = new T.Mesh(new T.BoxGeometry(), array),
    b = new T.Mesh(a.geometry, original);
  root.add(a, b);
  let originalDisposals = 0,
    textureDisposals = 0,
    inkDisposals = 0;
  original.addEventListener("dispose", () => originalDisposals++);
  texture.addEventListener("dispose", () => textureDisposals++);
  const ink = applyInk(root);
  assert.equal(ink.materials.length, 1);
  assert.equal(a.material[0], b.material);
  assert.equal(b.material.map, texture);
  assert.notEqual(b.material.color, original.color);
  assert.equal(b.material.color.getHex(), original.color.getHex());
  ink.materials[0].addEventListener("dispose", () => inkDisposals++);
  ink.setEnabled(false);
  assert.equal(a.material, array);
  ink.setEnabled(true);
  assert.notEqual(a.material, array);
  ink.dispose();
  ink.dispose();
  assert.equal(a.material, array);
  assert.equal(b.material, original);
  assert.equal(inkDisposals, 1);
  assert.equal(originalDisposals + textureDisposals, 0);
});
test("preserves external material replacements and prevents nested bindings", () => {
  const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
  const ink = applyInk(mesh);
  assert.throws(() => applyInk(mesh), /already/);
  const next = new T.MeshNormalMaterial();
  mesh.material = next;
  ink.dispose();
  assert.equal(mesh.material, next);
  const second = applyInk(mesh);
  second.dispose();
});
test("reports custom shaders, blended glass, transmission, and missing normals", () => {
  const group = new T.Group();
  const source = [
    new T.ShaderMaterial(),
    new T.MeshStandardMaterial({ transparent: true }),
    new T.MeshPhysicalMaterial({ transmission: 1 }),
  ];
  source.forEach((m) => group.add(new T.Mesh(new T.BoxGeometry(), m)));
  const noNormal = new T.BufferGeometry();
  group.add(new T.Mesh(noNormal, new T.MeshBasicMaterial()));
  const ink = applyInk(group);
  assert.equal(ink.skipped.length, 4);
  assert.equal(ink.materials.length, 0);
  source.forEach((m, i) => assert.equal(group.children[i].material, m));
  ink.dispose();
});
test("does not disturb skinning, morph targets, instancing, or alpha cutouts", () => {
  const g = new T.BoxGeometry();
  g.morphAttributes.position = [g.attributes.position.clone()];
  const mat = new T.MeshStandardMaterial({
    alphaTest: 0.5,
    alphaMap: new T.Texture(),
    side: T.DoubleSide,
  });
  const skin = new T.SkinnedMesh(g, mat),
    bone = new T.Bone();
  skin.add(bone);
  const skeleton = new T.Skeleton([bone]);
  skin.bind(skeleton);
  const instances = new T.InstancedMesh(g, mat, 2),
    group = new T.Group();
  group.add(skin, instances);
  skin.morphTargetInfluences[0] = 0.7;
  const ink = applyInk(group);
  assert.equal(skin.skeleton, skeleton);
  assert.equal(skin.geometry, g);
  assert.equal(skin.morphTargetInfluences[0], 0.7);
  assert.equal(instances.count, 2);
  assert.equal(skin.material.alphaMap, mat.alphaMap);
  assert.equal(skin.material.alphaTest, 0.5);
  assert.equal(skin.material.side, T.DoubleSide);
  ink.dispose();
});
test("shader patch replaces the current Three.js toon chunk and retains lighting pipeline", () => {
  const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial());
  const ink = applyInk(mesh);
  const shader = {
    uniforms: {},
    fragmentShader: T.ShaderLib.toon.fragmentShader,
  };
  mesh.material.onBeforeCompile(shader, {});
  assert.match(shader.fragmentShader, /uniform vec2 inkThresholds/);
  assert.doesNotMatch(
    shader.fragmentShader,
    /#include <gradientmap_pars_fragment>/,
  );
  assert.match(shader.fragmentShader, /#include <lights_fragment_begin>/);
  ink.dispose();
});
test("time stepping uses absolute time without slowing animation", () => {
  assert.equal(steppedTime(1.049, 12), 1);
  assert.equal(steppedTime(1.09, 12), 13 / 12);
  assert.equal(steppedTime(1.09, 0), 1.09);
  assert.throws(() => steppedTime(-1));
  assert.throws(() => steppedTime(1, -1));
});
test("rejects invalid tone thresholds and post options", () => {
  assert.throws(() => applyInk(new T.Group(), { thresholds: [0.8, 0.2] }));
  const pass = new InkPass(new T.Scene(), new T.PerspectiveCamera());
  assert.throws(() => pass.configure({ acrylic: 2 }));
  assert.throws(() => pass.configure({ pixelRatio: 0 }));
  pass.dispose();
  pass.dispose();
});
test("auxiliary render failure restores scene, materials and renderer settings", () => {
  const scene = new T.Scene(),
    mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial());
  scene.add(mesh);
  const original = mesh.material;
  const bg = new T.Color("red");
  scene.background = bg;
  const pass = new InkPass(scene, new T.PerspectiveCamera());
  const target = {};
  const renderer = {
    capabilities: {},
    shadowMap: { autoUpdate: true },
    xr: { enabled: true },
    autoClear: false,
    target,
    getClearColor: (c) => c.set("blue"),
    getClearAlpha: () => 0.4,
    setClearColor() {},
    getRenderTarget() {
      return this.target;
    },
    setRenderTarget(t) {
      this.target = t;
    },
    clear() {},
    render() {
      throw new Error("simulated GPU failure");
    },
  };
  assert.throws(() => pass.render(renderer, {}, {}), /simulated/);
  assert.equal(mesh.material, original);
  assert.equal(scene.background, bg);
  assert.equal(renderer.target, target);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.autoClear, false);
  pass.dispose();
});
