import { type Point, type Stroke } from "./model";

export function drawSegment(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  a: Point,
  b?: Point,
) {
  ctx.globalAlpha = s.tool === "pencil" ? 0.35 + a.pressure * 0.5 : 1;
  ctx.strokeStyle = ctx.fillStyle = s.color;
  ctx.beginPath();
  if (b) {
    ctx.lineWidth = s.width * (0.35 + (0.65 * (a.pressure + b.pressure)) / 2);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else {
    ctx.arc(
      a.x,
      a.y,
      (s.width * (0.35 + 0.65 * a.pressure)) / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
export function drawHighlight(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.beginPath();
  if (s.points.length === 1) {
    ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++)
      ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
  }
}
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.save();
  ctx.lineCap = ctx.lineJoin = "round";
  // The app's multiply layer sits behind pen/pencil ink.
  ctx.globalAlpha = 0.65;
  ctx.globalCompositeOperation = "multiply";
  for (const s of strokes) if (s.tool === "highlighter") drawHighlight(ctx, s);
  ctx.globalCompositeOperation = "source-over";
  for (const s of strokes)
    if (s.tool !== "highlighter") {
      drawSegment(ctx, s, s.points[0]);
      for (let i = 1; i < s.points.length; i++)
        drawSegment(ctx, s, s.points[i - 1], s.points[i]);
    }
  ctx.restore();
}
