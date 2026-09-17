import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
} from "three";
/** A fixed atlas of sparse, broad brush marks. Caller owns the returned texture. Browser only. */
export function createBrushTexture(seed = 517): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("A 2D canvas is required to create the brush atlas");
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, 512, 512);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < 32; i++) {
    const x = random() * 512,
      y = random() * 512,
      length = 60 + random() * 125,
      width = 14 + random() * 30,
      angle = (random() - 0.5) * 0.55;
    const value = i % 2 ? 184 : 72,
      bend = (random() - 0.5) * width * 0.55;
    for (const sx of [-512, 0, 512])
      for (const sy of [-512, 0, 512]) {
        ctx.save();
        ctx.translate(x + sx, y + sy);
        ctx.rotate(angle);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.globalAlpha = 0.4;
        ctx.filter = "blur(3px)";
        ctx.beginPath();
        ctx.moveTo(-length * 0.48, -width * 0.25);
        ctx.bezierCurveTo(
          -length * 0.2,
          -width * 0.52 + bend,
          length * 0.24,
          -width * 0.44,
          length * 0.5,
          -width * 0.18,
        );
        ctx.lineTo(length * 0.44, width * 0.3);
        ctx.bezierCurveTo(
          length * 0.16,
          width * 0.49,
          -length * 0.2,
          width * 0.4 + bend,
          -length * 0.5,
          width * 0.22,
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
  }
  const texture = new CanvasTexture(canvas);
  texture.name = "Three Ink broad brush atlas";
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}
