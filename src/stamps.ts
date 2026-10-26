import { type Stamp, type StampPlacement } from "./model";
import { drawStrokes } from "./renderInk";

export function drawStamp(
  ctx: CanvasRenderingContext2D,
  stamp: Stamp,
  x = 0,
  y = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, 200, 200);
  ctx.clip();
  drawStrokes(ctx, stamp.strokes);
  ctx.restore();
}
export function drawStamps(
  ctx: CanvasRenderingContext2D,
  library: Stamp[],
  placements: StampPlacement[],
) {
  const stamps = new Map(library.map((s) => [s.id, s]));
  for (const p of placements) {
    const stamp = stamps.get(p.stampId);
    if (stamp) drawStamp(ctx, stamp, p.x, p.y);
  }
}
