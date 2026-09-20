# Anime Style for Three.js

**An open-source rendering library that gives existing Three.js scenes an anime look.**

Use three-tone lighting for characters, broad painted shading for scenery, and optional pen outlines, anime shadows and film texture. Keep your models, textures and animations; choose the effects that suit your scene.

[**Try a model**](https://xymeow.github.io/three-anime-style/) · [**Compare effects**](https://xymeow.github.io/three-anime-style/?scene=robot&palette=neutral&compare=source) · [中文](README.zh-CN.md)

![Original Three.js materials on the left; the complete anime rendering on the right](docs/rendering-comparison.png)

_Same model, camera and pose. Left: original materials. Right: three-tone shading, pen outlines, background brushwork, anime shadows, 50% film grain and 50% acrylic frost._

## What is this?

A TypeScript library for **Three.js r186 + WebGLRenderer**, with browser demos and a portable AI-agent integration skill. Add it to a Three.js app, or drop an embedded GLB into the playground to see what it does.

| Part                       | What it changes                                                         |
| -------------------------- | ----------------------------------------------------------------------- |
| Character shading          | Three light/shadow bands, with optional highlights inside the dark band |
| Painted scenery            | Broad, fixed brush marks shape the lighting on walls, rocks and ground  |
| Outlines and anime shadows | Pen-like contours and a subtle offset shadow behind selected characters |
| Image finish               | Independently adjustable film grain and frosted acrylic texture         |
| Animation timing           | Optional 12 fps poses while the camera and rendering stay smooth        |

The material adapter and post-processing pass work independently. The flat contact shadow shown in the lab is an application example, ready to adapt to your stage.

## Try it first

**[One playground](https://xymeow.github.io/three-anime-style/)** includes all 13 examples: architecture, terrain, props, animated characters and the skinning/morph fixture. Import an embedded GLB, try six palettes, compare source materials, brushwork or shadows, then export a PNG or settings JSON. Every model uses the same rendering and anime-shadow controls.

Old `?example=fixture` links still open the original model. `lab.html` redirects to this viewer with its scene, palette and comparison settings intact.

Run locally:

```sh
git clone https://github.com/xymeow/three-anime-style.git
cd three-anime-style
npm ci
npm run dev
```

Open the Vite URL for the unified playground. Development requires Node 20.19+. The local and hosted versions use the same code. No deployment to the author's website, account, backend or API key is required. After installing dependencies, the bundled examples and embedded GLBs work offline.

Imported GLBs stay in the browser and are not uploaded; the playground accepts embedded assets and blocks external asset URLs. You can also self-host the `site-dist/` output from `npm run build:demo`.

## Quick start: add anime rendering to your Three.js app

The rendering implementation lives in the library's [`src/`](src/index.ts). The optional [skill](skills/three-anime-style/SKILL.md) is an integration guide for coding agents. You can use the library directly with ordinary TypeScript or JavaScript.

### 1. Install

Requires **Three.js r186 + WebGLRenderer**. Check your app's Three.js version before installing. The package is currently installed from a Git tag:

```sh
npm install three@0.186.0 github:xymeow/three-anime-style#v0.4.3
```

### 2. Apply three-tone shading to your model

Call this after your model has loaded. `model` can be a glTF's `gltf.scene`, a mesh, a group, or your whole scene:

```ts
import { applyInk } from "@xymeow/three-anime-style";

const style = applyInk(model);
```

Keep your existing renderer, camera, lights and animation loop. This converts supported materials to three-tone lighting while retaining the model's textures and animation. With only this step, keep calling `renderer.render(scene, camera)` as usual.

### 3. Add pen outlines and optional texture

For an app without a composer, create one using your existing renderer:

```ts
import { InkPass } from "@xymeow/three-anime-style";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

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

// In your existing animation loop, replace renderer.render(scene, camera):
composer.render();
```

If you already have a composer, insert only `InkPass` after the scene render and before the final `OutputPass`. Keep your existing controls and animation updates in the same loop.

Start with the clean look above, then add a subtle finish live:

```ts
ink.configure({ grain: 0.15, acrylic: 0.2 });
```

Compare with the original materials without reloading the model:

```ts
style.setEnabled(false);
ink.enabled = false;
// Restore the effect:
style.setEnabled(true);
ink.enabled = true;
```

In your resize handler, resize both renderer and composer and update the camera. If DPR changes, update both pixel ratios and `ink.configure({ pixelRatio })`. On removal, call `style.dispose()`, remove `ink` from the composer, and call `ink.dispose()`. When tearing down a composer you created, also dispose its passes and the composer itself.

**[Full integration example →](docs/integration.md)** has resize/DPR code and optional 12 fps animation. **[API reference →](docs/api.md)** covers painted scenery and anime shadows. Use the [local playground](#try-it-first) to explore the look, then use its parameter values in your app. A tuning panel in your own app is optional.

Keep the original scene lighting for your first comparison. For dark interiors or unstable contours, follow the [tuning and troubleshooting guide](docs/integration.md#tune-in-layers).

### Will my model work?

Common opaque and alpha-cutout materials, skeletal animation, morph targets and instanced meshes are supported. PBR materials become toon lighting; source textures and geometry remain owned by your app.

Glass, blended transparency and custom shaders keep their original materials and appear in `style.skipped`. The current renderer uses WebGL shader chunks and standard depth. See the [compatibility table](docs/api.md#compatibility) before integrating WebGPU, custom rendering pipelines or glass-heavy scenes.

## Use with an AI coding agent

After installing the library, copy its bundled skill into your project:

```sh
mkdir -p .agents/skills
cp -R node_modules/@xymeow/three-anime-style/skills/three-anime-style .agents/skills/
```

Then ask:

> Use $three-anime-style to add anime shading to this Three.js scene. Preserve its models and animation, reuse its render loop, and add an original/effect toggle. Start with clean cel shading; make brushwork, shadows and film texture adjustable.

The [skill](skills/three-anime-style/SKILL.md) gives agents the integration sequence, compatibility checks and teardown rules. It works with agents that support `SKILL.md`; other agents can read the file directly. Contributors to this library should start with [AGENTS.md](AGENTS.md).

## Development and credits

```sh
npm run check
npm test
npm run build:demo
npm run format:check
```

The library builds to `dist/`; the unified viewer builds to `site-dist/`. For changes to outlines or shadow masks, also open `/tests/gpu.html` through Vite for real WebGL regression checks. Regenerate the original animated test model with `node scripts/create-fixture.mjs`.

Inspired by [Shapefarm’s Orbitals rendering article](https://www.unrealengine.com/tech-blog/stepping-inside-a-retro-anime-inspired-game-a-look-into-the-rendering-of-orbitals). Code and original scenes are MIT licensed. Included third-party models retain their own licenses: [playground credits](public/ATTRIBUTION.md) · [lab credits](public/lab-models/CREDITS.md).
