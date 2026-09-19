# Painted backgrounds and anime shadows

## Painted backgrounds

For walls, ground and scenery, pass `paint: { map: createBrushTexture(), strength: 0.7, scale: 0.24, select: (mesh) => mesh.userData.inkPaint === true }` to `applyInk`. Mark the individual scenery meshes explicitly; unselected foreground meshes keep three bands. Selected scenery gets continuous lighting shaped by a sparse broad-stroke atlas. Do not replace this with dense noise. `scale` is atlas repeats per world unit; decrease it for wider strokes and adapt it to model dimensions. Use `binding.setPaint({strength, scale})` to update uniforms. Strength zero preserves smooth lighting but removes brush modulation.

The atlas is sampled in world space with triplanar blending: orbiting does not move the marks, while moving objects travel through the pattern. Favor static backgrounds. The caller owns the brush texture and must dispose it after its bindings. `createBrushTexture()` is browser-only; SSR can import the library but must defer texture creation or supply its own texture.

For third-party models, carry their own licenses and attribution, separately from the library’s MIT license. When a model has alternative clips such as Fox’s Survey/Walk/Run, play one chosen clip rather than starting all tracks at once.

## Cel shadows

`applyInk(root, {shadowHighlight: 0.65})` and `binding.setShadowHighlight(value)` control a restrained reflected rim inside the cel shadow band, leaving painted scenery unchanged. Values are 0..1, default 0.

For front-lit cel separation, set `InkPass` options `celShadow: 0.45` and `celShadowSelect: mesh => mesh.userData.inkCel === true`. Mark only foreground meshes, not the entire scene. Strength is 0..1 and defaults to 0. The pass reuses the ID/depth buffer, excludes the actor itself, and rejects a shadow behind a nearer surface. `penWidth: 0` does not disable this effect; set `celShadow: 0` separately when comparing original rendering.

For stylized ground shadows, the host app can adapt `ContactShadow` in `lab/contact-shadow.ts`. It projects actual animated caster geometry along the directional light onto a flat stage, with a uniform tint and softened edge. Do not replace independent objects with a single fixed oval. Capture per WebGL context after updating pose, keep the capture hidden from the source view, and reset/dispose its cached materials and target when replacing the scene. Preserve original cast/receive flags when toggling. The helper is separate from `InkPass` and supports the viewer's horizontal rectangular/circular stages; uneven terrain needs its own receiver. Validate changes at `/tests/contact-shadow.html`.

When changing contour detection, run `/tests/gpu.html` in an actual browser. Check low-angle flat surfaces remain clean while same-mesh occlusion lines survive. Increasing a global depth threshold or removing depth edges can hide the regression by losing useful contours.
