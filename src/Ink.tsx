import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  WIDTH,
  HEIGHT,
  hitsStroke,
  translateStrokes,
  type Stroke,
  type Point,
} from "./model";

export function Ink({
  strokes,
  color,
  width,
  eraser,
  tool = "pen",
  enabled,
  fingerWriting,
  onChange,
  onBusy,
}: {
  strokes: Stroke[];
  color: string;
  width: number;
  tool?: "pen" | "pencil" | "highlighter" | "select" | "eraser" | "browse";
  eraser: boolean;
  enabled: boolean;
  fingerWriting: boolean;
  onChange: (s: Stroke[]) => void;
  onBusy: (b: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const highlights = useRef<HTMLCanvasElement>(null);
  const active = useRef<{
    id: number;
    type: string;
    eraser: boolean;
    stroke: Stroke;
    original: Stroke[];
    remaining: Stroke[];
    selecting: boolean;
    moving: boolean;
    start: Point;
    end: Point;
  } | null>(null);
  const selected = useRef(new Set<string>());
  const latest = useRef(strokes);
  latest.current = strokes;
  const callbacks = useRef({ onChange, onBusy });
  callbacks.current = { onChange, onBusy };

  function context(c = canvas.current) {
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
  function render() {
    const ctx = context();
    const highlightCtx = context(highlights.current);
    if (!ctx || !highlightCtx) return;
    const a = active.current;
    const list = a
      ? a.selecting
        ? a.remaining
        : a.eraser
          ? a.remaining
          : [...a.original, a.stroke]
      : latest.current;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    highlightCtx.clearRect(0, 0, WIDTH, HEIGHT);
    highlightCtx.globalAlpha = 0.65;
    highlightCtx.globalCompositeOperation = "multiply";
    for (const s of list) {
      if (s.tool === "highlighter") {
        highlightCtx.strokeStyle = highlightCtx.fillStyle = s.color;
        highlightCtx.lineWidth = s.width;
        highlightCtx.beginPath();
        if (s.points.length === 1) {
          highlightCtx.arc(
            s.points[0].x,
            s.points[0].y,
            s.width / 2,
            0,
            Math.PI * 2,
          );
          highlightCtx.fill();
        } else {
          highlightCtx.moveTo(s.points[0].x, s.points[0].y);
          for (const p of s.points.slice(1)) highlightCtx.lineTo(p.x, p.y);
          highlightCtx.stroke();
        }
      } else {
        segment(ctx, s, s.points[0]);
        for (let i = 1; i < s.points.length; i++)
          segment(ctx, s, s.points[i - 1], s.points[i]);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#6c628d";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    for (const s of list)
      if (selected.current.has(s.id)) {
        let x1 = WIDTH,
          y1 = HEIGHT,
          x2 = 0,
          y2 = 0;
        for (const p of s.points) {
          x1 = Math.min(x1, p.x);
          y1 = Math.min(y1, p.y);
          x2 = Math.max(x2, p.x);
          y2 = Math.max(y2, p.y);
        }
        ctx.strokeRect(x1 - 4, y1 - 4, x2 - x1 + 8, y2 - y1 + 8);
      }
    if (a?.selecting && !a.moving)
      ctx.strokeRect(
        a.start.x,
        a.start.y,
        a.end.x - a.start.x,
        a.end.y - a.start.y,
      );
    ctx.setLineDash([]);
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
  function finish(id?: number, releaseCapture = true) {
    const a = active.current;
    if (!a || (id !== undefined && a.id !== id)) return;
    // Clear before releasing capture, which may dispatch lostpointercapture.
    active.current = null;
    const c = canvas.current;
    if (releaseCapture && c?.hasPointerCapture(a.id))
      c.releasePointerCapture(a.id);
    if (a.selecting && !a.moving) {
      const x1 = Math.min(a.start.x, a.end.x),
        x2 = Math.max(a.start.x, a.end.x),
        y1 = Math.min(a.start.y, a.end.y),
        y2 = Math.max(a.start.y, a.end.y);
      selected.current = new Set(
        a.original
          .filter((s) =>
            s.points.some((p, i) => {
              const q = s.points[Math.max(0, i - 1)];
              let lo = 0,
                hi = 1;
              for (const [d, dist] of [
                [-(p.x - q.x), q.x - x1],
                [p.x - q.x, x2 - q.x],
                [-(p.y - q.y), q.y - y1],
                [p.y - q.y, y2 - q.y],
              ]) {
                if (!d) {
                  if (dist < 0) return false;
                } else if (d < 0) lo = Math.max(lo, dist / d);
                else hi = Math.min(hi, dist / d);
              }
              return lo <= hi;
            }),
          )
          .map((s) => s.id),
      );
    }
    const next =
      a.selecting || a.eraser ? a.remaining : [...a.original, a.stroke];
    latest.current = next;
    callbacks.current.onBusy(false);
    render();
    if (!a.selecting || a.moving) callbacks.current.onChange(next);
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
      if (a.selecting) {
        a.end = p;
        if (a.moving)
          a.remaining = translateStrokes(
            a.original,
            selected.current,
            p.x - a.start.x,
            p.y - a.start.y,
          );
        render();
      } else if (a.eraser) {
        const remaining = a.remaining.filter((s) => !hitsStroke(p, s));
        erased ||= remaining.length !== a.remaining.length;
        a.remaining = remaining;
      } else {
        const previous = a.stroke.points[a.stroke.points.length - 1];
        a.stroke.points.push(p);
        if (a.stroke.tool === "highlighter") render();
        else if (ctx) segment(ctx, a.stroke, previous, p);
      }
    }
    if (erased) render();
  }
  function up(e: PointerEvent) {
    const a = active.current;
    if (!a || a.id !== e.pointerId || a.type !== e.pointerType) return;
    if (e.type === "pointerup") {
      const p = point(e);
      if (a.selecting) {
        a.end = p;
        if (a.moving)
          a.remaining = translateStrokes(
            a.original,
            selected.current,
            p.x - a.start.x,
            p.y - a.start.y,
          );
      } else if (a.eraser)
        a.remaining = a.remaining.filter((s) => !hitsStroke(p, s));
      else {
        const previous = a.stroke.points[a.stroke.points.length - 1];
        if (p.x !== previous.x || p.y !== previous.y) {
          p.pressure = previous.pressure;
          a.stroke.points.push(p);
        }
      }
    }
    // Up/cancel release capture automatically; avoid an extra release request.
    finish(e.pointerId, false);
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
      const highlightCanvas = highlights.current!;
      if (highlightCanvas.width !== w || highlightCanvas.height !== h) {
        highlightCanvas.width = w;
        highlightCanvas.height = h;
      }
      render();
    };
    const interrupted = () => finish();
    const freshContact = (e: PointerEvent) => {
      if (e.pointerType === "touch" && !e.isPrimary) return;
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
    selected.current.clear();
    render();
  }, [tool]);
  useLayoutEffect(() => {
    if (!enabled) finish();
  }, [enabled]);
  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    const accepted =
      ["pen", "mouse"].includes(e.pointerType) ||
      (fingerWriting && e.pointerType === "touch" && e.isPrimary);
    if (!enabled || !accepted || e.button !== 0) return;
    const previous = active.current;
    // Fresh contact recovers missed endings. Other device types cannot steal ink.
    if (previous && previous.type !== e.pointerType) return;
    if (previous) finish();
    e.preventDefault();
    const p = point(e);
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      color,
      width: tool === "highlighter" ? Math.min(20, width * 3) : width,
      tool: tool === "pencil" || tool === "highlighter" ? tool : "pen",
      points: [p],
    };
    const moving =
      tool === "select" &&
      latest.current.some(
        (s) => selected.current.has(s.id) && hitsStroke(p, s),
      );
    if (tool === "select" && !moving) selected.current.clear();
    active.current = {
      id: e.pointerId,
      type: e.pointerType,
      eraser,
      stroke,
      selecting: tool === "select",
      moving,
      start: p,
      end: p,
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
    if (eraser || tool === "select" || tool === "highlighter") render();
    else {
      const ctx = context();
      if (ctx) segment(ctx, stroke, p);
    }
  }
  return (
    <>
      <canvas
        ref={canvas}
        className={"ink " + (!enabled ? "browse" : "")}
        aria-label={
          fingerWriting
            ? "Handwriting surface: use a pen, mouse, or one finger"
            : "Handwriting surface: use a pen or mouse; enable Finger writing for touch"
        }
        onPointerDown={down}
        onLostPointerCapture={(e) => {
          // Ignore delayed loss notifications if this pointer has already been recaptured.
          if (
            !e.currentTarget.hasPointerCapture(e.pointerId) &&
            active.current?.type === e.pointerType
          )
            finish(e.pointerId, false);
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <canvas
        ref={highlights}
        className="ink highlighter-layer"
        aria-hidden="true"
      />
    </>
  );
}
