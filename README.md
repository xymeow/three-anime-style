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

Open the Vite URL for the unified playground. Development requires Node 20.19+. Imported GLBs stay in the browser; the playground accepts embedded assets and blocks external asset URLs.

## Add it to your app

Install the tagged Git package; it is not published to npm yet:

```sh
npm install three@0.186.0 github:xymeow/three-anime-style#v0.4.1
```

The Git install builds the library and TypeScript declarations. Start with the material effect:

```ts
import { applyInk } from "@xymeow/three-anime-style";

// model is an Object3D or loaded glTF scene in your existing lit scene.
const style = applyInk(model);

style.setEnabled(false); // compare with the original materials
style.setEnabled(true); // restore the anime shading
// When removing the effect: style.dispose();
```

For outlines and texture, insert `InkPass` after your scene render and before the final `OutputPass`. Use your existing composer and animation loop.

**[Full integration example →](docs/integration.md)** includes the composer, animation timing, resizing and cleanup. **[API reference →](docs/api.md)** covers painted backgrounds, shadow controls, defaults and resource ownership.

### Will my model work?

Common opaque and alpha-cutout materials, skeletal animation, morph targets and instanced meshes are supported. PBR materials become toon lighting; source textures and geometry remain owned by your app.

Glass, blended transparency and custom shaders keep their original materials and appear in `style.skipped`. The current renderer uses WebGL shader chunks and standard depth. See the [compatibility table](docs/api.md#compatibility) before integrating WebGPU, custom rendering pipelines or glass-heavy scenes.

## Use with an AI coding agent

Copy the portable skill from this repository into your consuming project's skill directory:

```sh
mkdir -p .agents/skills
cp -R /path/to/three-anime-style/skills/three-anime-style .agents/skills/
```

Then ask:

> Use $three-anime-style to add anime shading to this Three.js scene. Preserve its models and animation, reuse its render loop, and add an original/effect toggle. Start with clean cel shading; make brushwork, shadows and film texture adjustable.

The [skill](skills/three-anime-style/SKILL.md) gives agents the integration sequence, compatibility checks and teardown rules. It works with agents that support `SKILL.md`; other agents can read the file directly. Contributors to this library should start with [AGENTS.md](AGENTS.md).

## Upgrading from Three Ink

The project was previously named **Three Ink**. Starting with v0.4.0, install `github:xymeow/three-anime-style#v0.4.1` and change imports from `@xymeow/three-ink` to `@xymeow/three-anime-style`. Remove the old dependency once imports are migrated. The exported names (`applyInk`, `InkPass`, `createBrushTexture`, `steppedTime`) and rendering behavior are unchanged. Replace the old skill folder with `skills/three-anime-style` to use the new invocation name.

## Development and credits

```sh
npm run check
npm test
npm run build:demo
npm run format:check
```

The library builds to `dist/`; the unified viewer builds to `site-dist/`. For changes to outlines or shadow masks, also open `/tests/gpu.html` through Vite for real WebGL regression checks. Regenerate the original animated test model with `node scripts/create-fixture.mjs`.

Inspired by [our Orbitals rendering study](https://xymeow.github.io/post/orbitals-cel-shading-experiment/). Code and original scenes are MIT licensed. Included third-party models retain their own licenses: [playground credits](public/ATTRIBUTION.md) · [lab credits](public/lab-models/CREDITS.md).
