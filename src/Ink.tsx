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
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<{
    id: number;
    type: string;
    eraser: boolean;
    stroke: Stroke;
    original: Stroke[];
    remaining: Stroke[];
  } | null>(null);
  const latest = useRef(strokes);
  latest.current = strokes;
  const callbacks = useRef({ onChange, onBusy });
  callbacks.current = { onChange, onBusy };

  function context() {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return null;
    ctx.setTransform(c.width / WIDTH, 0, 0, c.height / HEIGHT, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }
  function segment(
    ctx: CanvasRenderingContext2D,
    s: Stroke,
    a: Point,
    b?: Point,
  ) {
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
  function render() {
    const ctx = context();
    if (!ctx) return;
    const a = active.current;
    const list = a
      ? a.eraser
        ? a.remaining
        : [...a.original, a.stroke]
      : latest.current;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (const s of list) {
      segment(ctx, s, s.points[0]);
      for (let i = 1; i < s.points.length; i++)
        segment(ctx, s, s.points[i - 1], s.points[i]);
    }
  }
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
  function finish(id?: number) {
    const a = active.current;
    if (!a || (id !== undefined && a.id !== id)) return;
    // Clear before releasing capture, which may dispatch lostpointercapture.
    active.current = null;
    const c = canvas.current;
    if (c?.hasPointerCapture(a.id)) c.releasePointerCapture(a.id);
    const next = a.eraser ? a.remaining : [...a.original, a.stroke];
    latest.current = next;
    callbacks.current.onBusy(false);
    render();
    callbacks.current.onChange(next);
  }
  function move(e: PointerEvent) {
    const a = active.current;
    if (!a || a.id !== e.pointerId || a.type !== e.pointerType) return;
    // Hover after a missed pointerup must not keep the writer locked.
    if (e.buttons === 0) {
      finish(e.pointerId);
      return;
    }
    if (e.cancelable) e.preventDefault();
    const samples = e.getCoalescedEvents?.() ?? [];
    const ctx = context();
    let erased = false;
    for (const sample of samples.length ? samples : [e]) {
      const p = point(sample);
      if (a.eraser) {
        const remaining = a.remaining.filter((s) => !hitsStroke(p, s));
        erased ||= remaining.length !== a.remaining.length;
        a.remaining = remaining;
      } else {
        const previous = a.stroke.points[a.stroke.points.length - 1];
        a.stroke.points.push(p);
        if (ctx) segment(ctx, a.stroke, previous, p);
      }
    }
    if (erased) render();
  }
  function up(e: PointerEvent) {
    const a = active.current;
    if (!a || a.id !== e.pointerId || a.type !== e.pointerType) return;
    if (e.type === "pointerup") {
      const p = point(e);
      if (a.eraser) a.remaining = a.remaining.filter((s) => !hitsStroke(p, s));
      else {
        const previous = a.stroke.points[a.stroke.points.length - 1];
        if (p.x !== previous.x || p.y !== previous.y) {
          p.pressure = previous.pressure;
          a.stroke.points.push(p);
        }
      }
    }
    finish(e.pointerId);
  }
  useLayoutEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const r = c.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * devicePixelRatio));
      const h = Math.max(1, Math.round(r.height * devicePixelRatio));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      render();
    };
    const interrupted = () => finish();
    const freshContact = (e: PointerEvent) => {
      // Also recover when the next pen contact lands on the other page.
      if (e.button === 0 && active.current?.type === e.pointerType) finish();
    };
    const visibility = () => {
      if (document.hidden) finish();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(c);
    resize();
    // Window listeners cover capture failure and releases outside the canvas.
    window.addEventListener("pointerdown", freshContact, true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", interrupted);
    window.addEventListener("pagehide", interrupted);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", freshContact, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", interrupted);
      window.removeEventListener("pagehide", interrupted);
      document.removeEventListener("visibilitychange", visibility);
      active.current = null;
      callbacks.current.onBusy(false);
    };
  }, []);
  useLayoutEffect(() => render(), [strokes]);
  useLayoutEffect(() => {
    if (!enabled) finish();
  }, [enabled]);
  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!enabled || !["pen", "mouse"].includes(e.pointerType) || e.button !== 0)
      return;
    const previous = active.current;
    // Fresh contact recovers missed endings. Other device types cannot steal ink.
    if (previous && previous.type !== e.pointerType) return;
    if (previous) finish();
    e.preventDefault();
    const p = point(e);
    const stroke = { id: crypto.randomUUID(), color, width, points: [p] };
    active.current = {
      id: e.pointerId,
      type: e.pointerType,
      eraser,
      stroke,
      original: latest.current,
      remaining: eraser
        ? latest.current.filter((s) => !hitsStroke(p, s))
        : latest.current,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail after a browser interruption; window listeners still work.
    }
    callbacks.current.onBusy(true);
    if (eraser) render();
    else {
      const ctx = context();
      if (ctx) segment(ctx, stroke, p);
    }
  }
  return (
    <canvas
      ref={canvas}
      className={"ink " + (!enabled ? "browse" : "")}
      aria-label="Handwriting surface: use Apple Pencil, or a mouse for desktop testing"
      onPointerDown={down}
      onLostPointerCapture={(e) => finish(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
