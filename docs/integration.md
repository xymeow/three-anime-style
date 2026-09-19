# Integrate into an existing Three.js app

[Overview](../README.md) · [API and compatibility](api.md)

Requires Three.js r186 and WebGLRenderer. The app owns the renderer, scene, camera, model loader and animation loop.

```ts
import { applyInk, InkPass, steppedTime } from "@xymeow/three-anime-style";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// renderer, scene, camera and model come from your existing Three.js app.
const binding = applyInk(model, {
  thresholds: [0.51, 0.785],
  shadow: "#514f73",
  mid: "#c1c4c9",
  light: "#fff5df",
});
scene.add(model);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ink = new InkPass(scene, camera, {
  penWidth: 1.1,
  grain: 0.5,
  acrylic: 0.5,
  pixelRatio: renderer.getPixelRatio(),
});
composer.addPass(ink);
composer.addPass(new OutputPass());

let previous = 0;
renderer.setAnimationLoop((milliseconds) => {
  const seconds = milliseconds / 1000;
  const delta = previous ? seconds - previous : 0;
  previous = seconds;
  // If your model has an AnimationMixer:
  // mixer.setTime(steppedTime(seconds, 12));
  // Update camera controls at display refresh rate.
  composer.render(delta);
});

function resize(width: number, height: number) {
  renderer.setSize(width, height);
  composer.setSize(width, height);
  camera.aspect = width / height; // PerspectiveCamera
  camera.updateProjectionMatrix();
}

// If your app changes device pixel ratio:
function setPixelRatio(ratio: number) {
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  ink.configure({ pixelRatio: ratio });
}

// When removing this effect:
function disposeInk() {
  binding.dispose(); // restores original materials
  composer.removePass(ink);
  ink.dispose();
}
```

Keep your existing composer if you already have one. Place `InkPass` after the scene render and before the final `OutputPass`; don't add a second renderer or animation loop. Start with one directional light and modest ambient light. Each direct light gets a three-tone ramp; multiple lights, shadows, textures and ambient light can produce additional final colors.
