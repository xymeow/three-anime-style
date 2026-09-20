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
  grain: 0,
  acrylic: 0,
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

Keep your existing composer if you already have one. Place `InkPass` after the scene render and before the final `OutputPass`; don't add a second renderer or animation loop. Keep the original lighting while checking the material conversion. A dominant directional light makes the three bands easy to read; interiors still need ambient or hemisphere fill. Each direct light gets a three-tone ramp; multiple lights, shadows, textures and ambient light can produce additional final colors. The library does not change light intensities.

## Tune in layers

First compare source materials with `binding.setEnabled(false)` and `ink.enabled = false`. Then enable the binding alone, followed by outlines, painted scenery, shadows and the image finish. This separates lighting and material changes from post-processing.

The example explicitly starts grain and acrylic at zero; omitted options still default to `0.5`. For a subtle finish, try:

```ts
ink.configure({ grain: 0.15, acrylic: 0.2 });
```

These controls update live. Use the local playground to explore them and export settings, then copy the desired values into your app; a runtime tuning panel is optional. Check both bright and dim areas, close-up views, and grazing camera angles before choosing a preset. Preserve the scene's ambient fill while tuning: frost is not a replacement for lighting.

## Troubleshoot contours and dark scenes

| Symptom                                                   | Check and action                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad ink patches appear on a flat wall at certain angles | Set `penWidth: 0` and `celShadow: 0` to isolate contours. The fixed pass rejects continuous slopes and coplanar ID changes. If the source view also flickers, inspect overlapping faces and the camera's near/far range. Remove unintended duplicate faces; preserve intentional decal polygon offsets. |
| A deliberate coplanar color seam has no outline           | Coplanar ID boundaries are suppressed to prevent false ink. Use a texture or explicit line geometry for a drawn seam.                                                                                                                                                                                   |
| Dark surfaces turn gray, grainy or acquire light edges    | Start with grain/acrylic at zero and check the installed library version. The corrected finish attenuates noise and veil in shadows, and ink only darkens. Keep `InkPass` before the final `OutputPass` and avoid a second output/tone-mapping pass.                                                    |
| The cel image is too dark even with the pass disabled     | Check the original lights and material conversion. PBR environment reflections become toon lighting; retain or add appropriate fill instead of brightening with grain/frost.                                                                                                                            |
| A pen changes width between devices                       | Keep renderer/composer DPR synchronized and pass the same `pixelRatio` to `InkPass`. Width is measured in CSS pixels.                                                                                                                                                                                   |
| A locally rebuilt package still looks unchanged           | Check `npm ls @xymeow/three-anime-style three`, the lockfile and the installed files. After replacing a local tarball, restart Vite with `--force` to refresh optimized dependencies. A local package version is not proof that its Git release exists.                                                 |

For a contour bug report, include a minimal scene, Three.js/library versions, camera near/far, DPR and the angle that fails. Run `/tests/gpu.html` in the library's local playground: it covers grazing planes, overlapping panels, preserved occlusion edges and dark finishes. Do not hide a contour defect by raising a global depth threshold; that can erase real edges.
