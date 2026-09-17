/** Sample absolute animation time. Keep camera controls and rendering at display refresh rate. */
export function steppedTime(seconds: number, fps = 12): number {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error("seconds must be finite and non-negative");
  if (!Number.isFinite(fps) || fps < 0)
    throw new Error("fps must be finite and non-negative");
  return fps === 0 ? seconds : Math.floor(seconds * fps + 1e-8) / fps;
}
