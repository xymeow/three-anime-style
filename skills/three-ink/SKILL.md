---
name: three-ink
description: Add Three Ink three-tone shading, pen outlines, film grain and frosted acrylic to an existing Three.js scene. Use when the user requests Three Ink integration, cel/toon rendering with this library, its 12 fps animation look, or debugging its material and post-processing setup.
---

# Three Ink integration

Integrate into the user's existing scene and animation loop. Three Ink exports `applyInk`, `InkPass`, `createBrushTexture`, and `steppedTime` from `@xymeow/three-ink`.

## Inspect first

1. Find the renderer, composer, model loading, lighting, animation and teardown code.
2. Check Three.js is r186 and the renderer is WebGLRenderer. The current package uses shader-chunk patches; do not silently upgrade a whole app or assume WebGPU/TSL compatibility.
3. Determine whether materials are standard opaque/cutout, blended transparent, transmissive, or custom shaders. The last three stay original. Surface these reasons through `binding.skipped`.
4. Reuse an existing composer, loop and loader. Configure Draco/KTX2 in the app's loader when its models need them.

## Connect

Install with `npm install three@0.186.0 github:xymeow/three-ink#v0.2.0` when these dependencies are absent and r186 fits the app. The package is not on npm yet. Respect an existing package manager and lockfile.

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

## Painted backgrounds

For walls, ground and scenery, pass `paint: { map: createBrushTexture(), strength: 0.7, scale: 0.24, select: (mesh) => mesh.userData.inkPaint === true }` to `applyInk`. Mark the individual scenery meshes explicitly; unselected foreground meshes keep three bands. Selected scenery gets continuous lighting shaped by a sparse broad-stroke atlas. Do not replace this with dense noise. `scale` is atlas repeats per world unit; decrease it for wider strokes and adapt it to model dimensions. Use `binding.setPaint({strength, scale})` to update uniforms. Strength zero preserves smooth lighting but removes brush modulation.

The atlas is sampled in world space with triplanar blending: orbiting does not move the marks, while moving objects travel through the pattern. Favor static backgrounds. The caller owns the brush texture and must dispose it after its bindings. `createBrushTexture()` is browser-only; SSR can import the library but must defer texture creation or supply its own texture.

For third-party models, carry their own licenses and attribution, separately from the library’s MIT license. When a model has alternative clips such as Fox’s Survey/Walk/Run, play one chosen clip rather than starting all tracks at once.

## Experimental cel shadows (local branch)

Check the installed API before using these options: they are not in the public `v0.2.0` tag. `applyInk(root, {shadowHighlight: 0.65})` and `binding.setShadowHighlight(value)` control a restrained reflected rim inside the cel shadow band, leaving painted scenery unchanged. Values are 0..1, default 0.

For front-lit cel separation, set `InkPass` options `celShadow: 0.45` and `celShadowSelect: mesh => mesh.userData.inkCel === true`. Mark only foreground meshes, not the entire scene. Strength is 0..1 and defaults to 0. The pass reuses the ID/depth buffer, excludes the actor itself, and rejects a shadow behind a nearer surface. `penWidth: 0` does not disable this effect; set `celShadow: 0` separately when comparing original rendering.

For abstract grounding, the host app can use the lab's `lab/contact-shadow.ts` as a flat-stage example and disable the character's computed casting/receiving shadows. Preserve the app's original shadow flags when toggling; this is separate from the material binding. The example patch assumes y=0 and is not a terrain-projected decal. Keep these shadow layers distinct from ink width and grain.

When changing contour detection, run `/tests/gpu.html` in an actual browser. Check low-angle flat surfaces remain clean while same-mesh occlusion lines survive. Increasing a global depth threshold or removing depth edges can hide the regression by losing useful contours.
