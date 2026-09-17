---
name: three-ink
description: Add Three Ink three-tone shading, pen outlines, film grain and frosted acrylic to an existing Three.js scene. Use when the user requests Three Ink integration, cel/toon rendering with this library, its 12 fps animation look, or debugging its material and post-processing setup.
---

# Three Ink integration

Integrate into the user's existing scene and animation loop. Three Ink exports `applyInk`, `InkPass`, and `steppedTime` from `@xymeow/three-ink`.

## Inspect first

1. Find the renderer, composer, model loading, lighting, animation and teardown code.
2. Check Three.js is r186 and the renderer is WebGLRenderer. The current package uses shader-chunk patches; do not silently upgrade a whole app or assume WebGPU/TSL compatibility.
3. Determine whether materials are standard opaque/cutout, blended transparent, transmissive, or custom shaders. The last three stay original. Surface these reasons through `binding.skipped`.
4. Reuse an existing composer, loop and loader. Configure Draco/KTX2 in the app's loader when its models need them.

## Connect

Install with `npm install three@0.186.0 github:xymeow/three-ink#v0.1.0` when these dependencies are absent and r186 fits the app. The package is not on npm yet. Respect an existing package manager and lockfile.

```ts
import { applyInk, InkPass, steppedTime } from "@xymeow/three-ink";

const binding = applyInk(model, {
  thresholds: [0.51, 0.785],
  shadow: "#514f73",
  mid: "#c1c4c9",
  light: "#fff5df",
});
const ink = new InkPass(scene, camera, {
  penWidth: 1.1,
  grain: 0.5,
  acrylic: 0.5,
  pixelRatio: renderer.getPixelRatio(),
});
```

Insert `ink` after the scene RenderPass and before the final OutputPass. Keep intermediate render targets linear. Use one dominant directional light with modest ambient fill to make the three bands readable; additive lights and shadows affect the final palette. The thresholds are in half-Lambert space, `dot(N,L) * 0.5 + 0.5`.

For stepped animation, use `mixer.setTime(steppedTime(elapsedSeconds, 12))` in the existing render loop. Supply non-negative absolute elapsed time. Keep camera controls and composer rendering at display refresh rate. `steppedTime(t, 0)` keeps motion smooth. Do not apply both `mixer.update(delta)` and `setTime` to the same frame.

For comparison, call `binding.setEnabled(false)` and set `ink.enabled = false`. To restore the effect, enable both. `ink.configure({ acrylic: 0.5 })` updates the finish without rebuilding the scene. Grain and acrylic use 0..1 strength; penWidth is in CSS pixels.

Keep renderer and composer sizes synchronized. If DPR changes, update renderer/composer pixel ratio and `ink.configure({ pixelRatio })`. Camera aspect is width/height for a perspective camera; an orthographic camera needs its own bounds update.

## Ownership and limits

- Keep the returned binding. Call `binding.dispose()` before reapplying or removing the model. It restores original materials and frees only its own adapted materials. The app still owns model resources.
- Call `ink.reset()` when replacing models to release cached contour materials. Remove the pass from its composer and call `ink.dispose()` on teardown.
- Materials are snapshots of source properties. To adopt later source-property changes, dispose and reapply. Texture content is shared.
- Do not change geometry or animation data to make this effect work. Do not stack multiple bindings on the same mesh.
- Custom `onBeforeCompile` source modifications are not migrated. Preserve those meshes separately or write a specific adapter.
- Contours use object/material IDs and depth, not every geometric crease. Blended/transmissive materials are absent from the contour buffer, so they do not occlude lines.
- Standard depth is required. WebXR, stencil-mask composers and custom callbacks that mutate rendering are outside the tested pipeline.
- Acrylic is a finish on the rendered image: fixed grain, slight scatter, milky tint. It is not physically refractive glass. Keep broad painted shading separate from fine film noise.

## Verify

Run the app's checks, then inspect actual browser rendering: original/effect switching, color and lighting, resizing, orbit controls, animation, and at least one representative imported model. Check for shader compilation errors. Exercise model replacement and cleanup when part of the app. Report concrete unsupported material cases rather than promising universal model compatibility.

Full API and source: https://github.com/xymeow/three-ink
