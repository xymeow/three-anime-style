import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { InkPass } from "../src/index";
const size = 256,
  renderer = new T.WebGLRenderer();
renderer.setSize(size, size);
renderer.setPixelRatio(1);
const input = new T.WebGLRenderTarget(size, size),
  output = new T.WebGLRenderTarget(size, size);
const scene = new T.Scene();
scene.background = new T.Color(0.5, 0.5, 0.5);
const white = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });
const results: string[] = [];
function record(ok: boolean, name: string, detail: string) {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  document.getElementById("results")!.textContent = results.join("\n");
  if (!ok) throw new Error(name + ": " + detail);
}
function pixels() {
  const data = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(output, 0, 0, size, size, data);
  return data;
}
function render(
  camera: T.PerspectiveCamera | T.OrthographicCamera,
  pass: InkPass,
) {
  renderer.setRenderTarget(input);
  renderer.render(scene, camera);
  pass.render(renderer, output, input);
  return pixels();
}
function shot(data: Uint8Array, title: string) {
  const box = document.createElement("section");
  const h = document.createElement("h2");
  h.textContent = title;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const flipped = new Uint8ClampedArray(data.length);
  for (let y = 0; y < size; y++)
    flipped.set(
      data.subarray(y * size * 4, (y + 1) * size * 4),
      (size - y - 1) * size * 4,
    );
  c.getContext("2d")!.putImageData(new ImageData(flipped, size, size), 0, 0);
  box.append(h, c);
  document.getElementById("images")!.append(box);
}
function makePass(
  camera: T.PerspectiveCamera | T.OrthographicCamera,
  legacy = false,
) {
  const p = new InkPass(scene, camera, {
    penWidth: 3,
    grain: 0,
    acrylic: 0,
    penColor: 0,
    pixelRatio: 1,
  });
  p.setSize(size, size);
  if (legacy) {
    const shader = p.material.fragmentShader;
    const start = shader.indexOf("  float boundary("),
      end = shader.indexOf("  float celMask(", start);
    p.material.fragmentShader =
      shader.slice(0, start) +
      `float boundary(vec2 uv,vec2 offset,vec3 id,float d){vec3 other=texture2D(tId,uv+offset).rgb;return max(step(.001,length(id-other)),step(max(.03,d*.018),abs(viewDepth(uv+offset)-d)))*step(.0001,length(id)+length(other));}\n` +
      shader.slice(end);
  }
  return p;
}
function interiorCount(data: Uint8Array, reference: Uint8Array) {
  let count = 0,
    total = 0;
  for (let y = 14; y < size - 14; y++)
    for (let x = 14; x < size - 14; x++) {
      let inside = true;
      for (const dy of [-12, 0, 12])
        for (const dx of [-12, 0, 12])
          if (reference[((y + dy) * size + x + dx) * 4] < 250) inside = false;
      if (inside) {
        total++;
        if (data[(y * size + x) * 4] < 200) count++;
      }
    }
  return { count, total };
}
try {
  const plane = new T.Mesh(new T.PlaneGeometry(100, 100), white);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
  let oldErrors = 0;
  for (const angle of [0.03, 0.1, 0.3, 0.65])
    for (const ortho of [false, true]) {
      const camera = ortho
        ? new T.OrthographicCamera(-5, 5, 5, -5, 0.05, 200)
        : new T.PerspectiveCamera(42, 1, 0.05, 200);
      camera.position.set(0, 0.8, 6);
      camera.lookAt(0, 0.8 - Math.tan(angle) * 6, 0);
      camera.updateMatrixWorld();
      const baseline = makePass(camera);
      baseline.configure({ penWidth: 0 });
      const reference = render(camera, baseline);
      baseline.dispose();
      const before = makePass(camera, true),
        after = makePass(camera);
      const a = render(camera, before),
        b = render(camera, after);
      const old = interiorCount(a, reference),
        fixed = interiorCount(b, reference);
      oldErrors += old.count;
      record(
        fixed.total > 1000 && fixed.count === 0,
        `${ortho ? "orthographic" : "perspective"} plane ${angle}`,
        `old false ink ${old.count}; new ${fixed.count}/${fixed.total}`,
      );
      if (angle === 0.1 && !ortho) {
        shot(a, "Old: false ink on a plane");
        shot(b, "Fixed: same camera and width");
      }
      before.dispose();
      after.dispose();
    }
  record(
    oldErrors > 500,
    "Regression reproduces the old failure",
    `${oldErrors} false ink pixels`,
  );
  scene.remove(plane);
  plane.geometry.dispose();
  const back = new T.PlaneGeometry(5, 5),
    front = new T.PlaneGeometry(1.6, 1.6);
  front.translate(0, 0, 1.3);
  const geometry = mergeGeometries([back, front]);
  back.dispose();
  front.dispose();
  const mesh = new T.Mesh(geometry, white);
  scene.add(mesh);
  const camera = new T.PerspectiveCamera(42, 1, 0.05, 200);
  camera.position.z = 6;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const pass = makePass(camera),
    data = render(camera, pass);
  let occlusion = 0;
  for (let y = 60; y < 196; y++)
    for (let x = 60; x < 196; x++)
      if (data[(y * size + x) * 4] < 200) occlusion++;
  record(
    occlusion > 100,
    "Same-mesh self-occlusion preserved",
    `${occlusion} dark boundary pixels`,
  );
  shot(data, "Same ID: occluding surface retained");
  pass.dispose();
  scene.remove(mesh);
  geometry.dispose();
  const actor = new T.Mesh(new T.PlaneGeometry(1.5, 2.5), white);
  scene.add(actor);
  const layer = new InkPass(scene, camera, {
    penWidth: 0,
    grain: 0,
    acrylic: 0,
    celShadow: 1,
    celShadowSelect: (o) => o === actor,
  });
  layer.setSize(size, size);
  const withLayer = render(camera, layer);
  layer.configure({ celShadow: 0 });
  const withoutLayer = render(camera, layer);
  let outside = 0,
    inside = 0;
  for (let i = 0; i < withLayer.length; i += 4)
    if (withLayer[i] + 3 < withoutLayer[i]) {
      if (withoutLayer[i] > 250) inside++;
      else outside++;
    }
  record(
    outside > 10 && inside === 0,
    "Cel offset does not tint its own actor",
    `${outside} background pixels; ${inside} actor pixels`,
  );
  layer.configure({ celShadow: 1 });
  const blocker = new T.Mesh(new T.PlaneGeometry(6, 6), white);
  blocker.position.z = 2;
  scene.add(blocker);
  const blocked = render(camera, layer);
  layer.configure({ celShadow: 0 });
  const unshadowed = render(camera, layer);
  let leaked = 0;
  for (let i = 0; i < blocked.length; i += 4)
    if (blocked[i] + 3 < unshadowed[i]) leaked++;
  record(
    leaked === 0,
    "Cel shadow cannot leak through foreground geometry",
    `${leaked} leaked pixels`,
  );
  layer.dispose();
  blocker.geometry.dispose();
  actor.geometry.dispose();
  scene.clear();
  // Wall and cabinet panels can share a plane without sharing mesh IDs.
  const flat = new T.Group();
  const wall = new T.Mesh(new T.PlaneGeometry(8, 8), white);
  flat.add(wall);
  for (let i = 0; i < 5; i++) {
    const panel = new T.Mesh(new T.BoxGeometry(1.37, 3.1, 0.12), white);
    panel.position.set((i - 2) * 0.57, 0.17, -0.06);
    flat.add(panel);
  }
  flat.rotation.y = 0.43;
  scene.add(flat);
  let reproduced = 0;
  for (const near of [0.035, 0.1]) {
    camera.near = near;
    camera.far = 55;
    camera.position.set(0.71, 0.19, 3.1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const fixed = makePass(camera);
    fixed.configure({ penWidth: 0 });
    const reference = render(camera, fixed);
    fixed.configure({ penWidth: 1.1 });
    const corrected = render(camera, fixed);
    const legacy = makePass(camera);
    legacy.configure({ penWidth: 1.1 });
    legacy.material.fragmentShader = legacy.material.fragmentShader.replace(
      "idEdge*=smoothstep(0.00000025,0.000001,planeError);",
      "idEdge*=1.0;",
    );
    const previous = render(camera, legacy);
    const beforeCount = interiorCount(previous, reference),
      afterCount = interiorCount(corrected, reference);
    reproduced += beforeCount.count;
    record(
      afterCount.total > 1000 && afterCount.count === 0,
      `Overlapping coplanar panels / near ${near}`,
      `old ${beforeCount.count}; fixed ${afterCount.count} false ink pixels`,
    );
    if (near === 0.035) {
      shot(previous, "Before: coplanar panel false ink");
      shot(corrected, "After: continuous coplanar surface");
    }
    fixed.dispose();
    legacy.dispose();
  }
  record(
    reproduced > 100,
    "Coplanar regression reproduces the reported failure",
    `${reproduced} false ink pixels`,
  );
  scene.clear();
  flat.traverse((o) => {
    if (o instanceof T.Mesh) o.geometry.dispose();
  });

  // Ink must not become a light-colored outline around dark objects.
  const dark = new T.MeshBasicMaterial({
    color: new T.Color(0.01, 0.01, 0.01),
  });
  const darkPanel = new T.Mesh(new T.PlaneGeometry(2, 2), dark);
  scene.background = new T.Color(0.02, 0.02, 0.02);
  scene.add(darkPanel);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const night = makePass(camera);
  night.configure({ penWidth: 0 });
  const plain = render(camera, night);
  night.configure({ penWidth: 1.1, penColor: "#777777" });
  const outlined = render(camera, night);
  let brightEdges = 0;
  for (let i = 0; i < plain.length; i += 4)
    if (outlined[i] > plain[i] + 1) brightEdges++;
  record(
    brightEdges === 0,
    "Night outlines only darken",
    `${brightEdges} brightened pixels`,
  );
  scene.remove(darkPanel);
  night.configure({ penWidth: 0, grain: 0.5, acrylic: 0.5 });
  for (const luminance of [0, 0.008, 0.04, 0.3]) {
    scene.background = new T.Color(luminance, luminance, luminance);
    const finished = render(camera, night);
    let sum = 0,
      sumSq = 0;
    for (let i = 0; i < finished.length; i += 4) {
      sum += finished[i];
      sumSq += finished[i] ** 2;
    }
    const mean = sum / (size * size),
      deviation = Math.sqrt(Math.max(0, sumSq / (size * size) - mean ** 2));
    record(
      luminance === 0
        ? mean === 0
        : luminance < 0.05
          ? Math.abs(mean - luminance * 255) < 2 && deviation < 1.5
          : deviation > 0.2,
      `Film and frost / luminance ${luminance}`,
      `mean ${mean.toFixed(2)}, noise deviation ${deviation.toFixed(2)}`,
    );
    shot(finished, `Night finish: linear light ${luminance}`);
  }
  night.dispose();
  darkPanel.geometry.dispose();
  dark.dispose();
  results.push("ALL GPU CHECKS PASSED");
  document.getElementById("results")!.textContent = results.join("\n");
} catch (error) {
  document.getElementById("results")!.textContent =
    results.join("\n") + "\n" + String(error);
  console.error(error);
} finally {
  input.dispose();
  output.dispose();
  white.dispose();
  renderer.dispose();
}
