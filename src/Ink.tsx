import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { WIDTH, HEIGHT, hitsStroke, type Stroke, type Point } from "./model";
export function Ink({
  strokes,
  color,
  width,
  eraser,
  enabled,
  onChange,
  onBusy,
}: {
  strokes: Stroke[];
  color: string;
  width: number;
  eraser: boolean;
  enabled: boolean;
  onChange: (s: Stroke[]) => void;
  onBusy: (b: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    active = useRef<{
      id: number;
      stroke: Stroke;
      original: Stroke[];
      remaining: Stroke[];
    } | null>(null);
  const latest = useRef(strokes);
  latest.current = strokes;
  function render(list: Stroke[], draft?: Stroke) {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(c.width / WIDTH, 0, 0, c.height / HEIGHT, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of draft ? [...list, draft] : list) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      const p = s.points[0];
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        (s.width * (0.35 + 0.65 * p.pressure)) / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1],
          b = s.points[i];
        ctx.lineWidth =
          s.width * (0.35 + (0.65 * (a.pressure + b.pressure)) / 2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
  useLayoutEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * devicePixelRatio));
      c.height = Math.max(1, Math.round(r.height * devicePixelRatio));
      render(latest.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(c);
    resize();
    return () => {
      observer.disconnect();
      onBusy(false);
    };
  }, []);
  useLayoutEffect(() => render(strokes), [strokes]);
  function point(e: {
    clientX: number;
    clientY: number;
    pressure: number;
  }): Point {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH, ((e.clientX - r.left) / r.width) * WIDTH)),
      y: Math.max(
        0,
        Math.min(HEIGHT, ((e.clientY - r.top) / r.height) * HEIGHT),
      ),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }
  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (
      !enabled ||
      active.current ||
      !["pen", "mouse"].includes(e.pointerType) ||
      e.button !== 0
    )
      return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    const stroke = { id: crypto.randomUUID(), color, width, points: [p] };
    active.current = {
      id: e.pointerId,
      stroke,
      original: strokes,
      remaining: eraser ? strokes.filter((s) => !hitsStroke(p, s)) : strokes,
    };
    onBusy(true);
    render(active.current.remaining, eraser ? undefined : stroke);
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    e.preventDefault();
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const p = point(sample);
      if (eraser) a.remaining = a.remaining.filter((s) => !hitsStroke(p, s));
      else a.stroke.points.push(p);
    }
    render(a.remaining, eraser ? undefined : a.stroke);
  }
  function finish(e: ReactPointerEvent<HTMLCanvasElement>) {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    onBusy(false);
    const next = eraser ? a.remaining : [...a.original, a.stroke];
    render(next);
    onChange(next);
  }
  return (
    <canvas
      ref={canvas}
      className={"ink " + (!enabled ? "browse" : "")}
      aria-label="Handwriting surface: use Apple Pencil, or a mouse for desktop testing"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    />
  );
}
