# API reference

[Overview](../README.md) · [Integration and cleanup](integration.md)

## `applyInk(root, options?)`

Recursively adapts supported mesh materials to `MeshToonMaterial`. Material arrays and shared materials are preserved; textures, geometry, skinning, morph targets and instance data remain owned by the app.

| Option            | Default         | Meaning                                                             |
| ----------------- | --------------- | ------------------------------------------------------------------- |
| `thresholds`      | `[0.51, 0.785]` | Increasing thresholds in half-Lambert space: `dot(N,L) * 0.5 + 0.5` |
| `shadow`          | `'#514f73'`     | Shadow-band light multiplier                                        |
| `mid`             | `'#c1c4c9'`     | Middle-band light multiplier                                        |
| `shadowHighlight` | `0`             | Reflected rim inside the dark band, `0..1`                          |
| `paint`           | omitted         | Optional painted scenery; see below                                 |
| `light`           | `'#fff5df'`     | Lit-band light multiplier                                           |

Returns a binding with `materials`, `skipped`, `setEnabled(boolean)`, `setPaint(settings)`, `setShadowHighlight(strength)` and `dispose()`. Inspect `skipped` to show per-object/material reasons. `setEnabled(false)` restores source material references for comparison. `dispose()` is idempotent and disposes only materials created by the binding. Later replacements made by your app are respected. Dispose before applying again to the same meshes.

The adapter snapshots material properties when called. To adopt later source-material changes, dispose and reapply. Changes to shared texture content continue to work.

## Painted scenery

Use continuous painted lighting on scenery while keeping three bands on the foreground subject. The brush atlas contains 32 sparse, wide marks. Triplanar world-space sampling varies the lighting around midtones, with no UV requirement or animated noise. It stays fixed as the camera moves. Use it for static walls, rocks, hills and ground; moving objects travel through the world-space pattern.

```ts
import { applyInk, createBrushTexture } from "@xymeow/three-anime-style";

const brush = createBrushTexture(); // browser canvas; caller owns texture
const binding = applyInk(model, {
  paint: {
    map: brush,
    strength: 0.7,
    scale: 0.24, // atlas repeats per world unit; lower = larger marks
    select: (mesh) => mesh.userData.inkPaint === true,
  },
});
binding.setPaint({ strength: 0.9, scale: 0.18 });
// On teardown: binding.dispose(); brush.dispose();
```

Omit `select` to paint every supported mesh in the binding. Omit `paint` to keep the original three-tone behavior. Strength `0` removes brush modulation while retaining smooth scenery lighting. The subject/scenery split works even when meshes share a source material. `setPaint` changes shared uniforms without recompiling shaders.

`createBrushTexture(seed = 517)` requires a browser canvas. In other environments, provide your own repeat-wrapped, linear grayscale texture with a neutral value of 128/255. Texture creation is never performed during module import. The binding does not dispose the supplied brush map.

In the playground, **干净色阶 Cel** disables brush modulation, **背景笔触 Paint** shows the brushwork without post-processing, and **自定义 / 完整效果** adds contours, grain and frost. All three keep the selected scenery on continuous shading and subjects on three-tone lighting. Brush strength and size are independent from grain and acrylic. Example links accept `?example=courtyard`, `lighthouse`, `robot`, `avocado`, `fox` or `fixture`. Fox exposes Survey, Walk and Run individually.

## `new InkPass(scene, camera, options?)`

Uses a depth/object-ID render for contours, then a full-screen pass for ink, grain and acrylic. Supports perspective and orthographic cameras. Outlines follow object/material boundaries and depth discontinuities; they do not draw every crease on a continuous surface. Separate instances in one `InstancedMesh` share an ID, with depth edges providing separation.

| Option            | Default     | Meaning                                                         |
| ----------------- | ----------- | --------------------------------------------------------------- |
| `penWidth`        | `1.1`       | Outline radius in CSS pixels; `0` disables outlines             |
| `penColor`        | `'#272333'` | Ink color                                                       |
| `grain`           | `0.5`       | Film grain strength, `0..1`; refreshed at 24 Hz                 |
| `acrylic`         | `0.5`       | Fixed screen-space grain, slight scatter and milky tint, `0..1` |
| `celShadow`       | `0`         | Offset silhouette shadow strength, `0..1`                       |
| `celShadowSelect` | omitted     | Select foreground meshes for the offset shadow                  |
| `pixelRatio`      | `1`         | Match the renderer to keep pen and grain sizes stable           |

With both `penWidth` and `celShadow` at zero, the auxiliary ID/depth render is skipped.

Use `configure(options)` to update the finish. Set `enabled = false` to bypass the pass. Call `reset()` after removing/replacing models to release cached ID materials. Call `dispose()` when removing the pass. A composer calls `setSize()` automatically.

The acrylic effect is a surface finish over the rendered image, rather than a glass material that refracts objects behind it. Grain is independent from lighting and does not perturb mesh geometry. The pass preserves the source alpha channel; its two-sided silhouette sampling is most predictable on an opaque scene background.

## `steppedTime(seconds, fps = 12)`

Quantizes absolute animation time. Pass `0` for smooth motion. Use it for object poses or `AnimationMixer.setTime()` while letting the renderer and camera controls run normally. It does not limit rendering FPS.

## Cel shadow controls

Both shadow effects are opt-in:

```ts
const binding = applyInk(model, { shadowHighlight: 0.65 });
binding.setShadowHighlight(0.4); // 0..1; default 0, cel materials only
const ink = new InkPass(scene, camera, {
  celShadow: 0.45, // 0..1; default 0
  celShadowSelect: (mesh) => mesh.userData.inkCel === true,
});
```

`shadowHighlight` adds a restrained view-dependent reflected rim inside the dark band. `celShadow` offsets the selected foreground silhouette by 2.5 CSS pixels, blends its edge, and darkens the background slightly. Depth prevents leakage through nearer surfaces. It works even with `penWidth: 0`; the same ID/depth render is reused when outlines are on. Transparent/transmissive/custom shader surfaces keep the existing contour-buffer limitations.

The lab's animation-shadow mode also disables the character's computed casting and receiving shadows and uses an abstract flat contact patch. That app-owned patch lives in `lab/contact-shadow.ts`, assumes the stage is at y=0, and follows the hips where available. For uneven terrain, the host app must place/orient/project a decal onto its receiving surface. The pass itself does not change any light or `castShadow` setting.

Contours now reject continuous projected-depth slopes while keeping object/material boundaries and same-mesh occlusions. Run the real WebGL regression at `/tests/gpu.html` after starting Vite; it compares the former depth rule with the fix on perspective and orthographic planes and checks occlusion and cel masks.

## Compatibility

| Feature                                                                   | Current release                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Standard / Physical / Phong / Lambert / Basic / Toon materials            | Converted; PBR metalness, roughness, clearcoat and environment reflections become toon lighting |
| Base color maps, vertex colors, normal/bump maps, emissive, alpha cutouts | Preserved where supported by MeshToonMaterial                                                   |
| Skinned meshes, morph targets, instanced meshes                           | Native Three.js deformation remains intact                                                      |
| Blended transparency, transmission, custom ShaderMaterial                 | Kept original and reported; omitted from the contour buffer                                     |
| Missing vertex normals                                                    | Kept original and reported                                                                      |
| Material `onBeforeCompile` customizations                                 | Not migrated; use an app-specific adapter for these                                             |
| WebGPU / TSL, logarithmic or reversed depth                               | Not supported                                                                                   |
| WebXR, stencil-mask composers, custom per-object render callbacks         | Outside the tested pipeline                                                                     |

Transparent surfaces don't occlude the contour buffer. The default pass processes the full scene. For scenes needing glass-aware contours or per-object effect masks, use a separate render layer/compositing design. Custom callbacks that mutate materials during rendering also need an application-specific integration.

The playground loads embedded GLB assets without Draco or KTX2. You can use your own fully configured GLTFLoader in an app and pass the loaded scene to `applyInk`.
