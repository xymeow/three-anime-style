# Working on Anime Style for Three.js

- Start with [README.md](README.md) for purpose, demos and supported Three.js version.
- For application integration, use [the portable skill](skills/three-anime-style/SKILL.md) and [integration example](docs/integration.md). For exact options and limits, read [the API reference](docs/api.md).
- Source map: `src/material.ts` adapts materials; `src/pass.ts` owns outlines/post effects; `src/brush.ts` creates brush textures; `src/clock.ts` samples animation time. `demo/` is the GLB playground; `lab/` is the synchronized comparison viewer.
- `src/index.ts` is the public export surface. Keep examples, types, the skill and API documentation consistent when changing it.
- Keep the material adapter, screen-space pass and animation sampling independent.
- Never mutate or dispose caller-owned geometry, source materials or textures.
- Restore all temporary material/renderer changes with try/finally, including failure paths.
- Preserve skinning, morph targets, material arrays, instancing and alpha cutouts.
- Three shader chunks are version-sensitive. When changing the peer version, inspect the installed chunks and run a browser render, not just TypeScript.
- Keep effects in linear color space; OutputPass belongs at the end of the composer.
- Update the portable integration skill when the public API changes.
- Run npm run check, npm test, npm run build:demo and npm run format:check.
- Check Original, Cel and Ink + film in the browser and load the animation fixture when changing shaders.
- Use only original or appropriately licensed assets, with attribution where required.
