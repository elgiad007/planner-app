import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function SpreadViewport({
  children,
  locked,
  hand,
  zoom,
  pinchDisabled,
  onZoom,
  onPinch,
}: {
  children: ReactNode;
  locked: boolean;
  hand: boolean;
  zoom: number;
  pinchDisabled: boolean;
  onZoom: (zoom: number) => void;
  onPinch: (active: boolean) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const previousZoom = useRef(zoom);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    zoom: number;
    x: number;
    y: number;
  } | null>(null);
  const pinchSession = useRef(false);
  const pen = useRef<number | null>(null);
  const penUntil = useRef(0);
  const clickUntil = useRef(0);
  const anchor = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const callbacks = useRef({ onPinch });
  callbacks.current = { onPinch };
  const [fitWidth, setFitWidth] = useState(0);
  // React portals (such as the text editor) share event ancestry but are not
  // part of the spread. Their touches and clicks must keep working normally.
  function onSurface(target: EventTarget | null) {
    return target instanceof Node && !!viewport.current?.contains(target);
  }
  function applyAnchor() {
    const element = viewport.current!;
    const point = anchor.current;
    if (!point) return;
    const bounds = element
      .querySelector(".zoom-book-size")!
      .getBoundingClientRect();
    element.scrollLeft += bounds.left + point.x * bounds.width - point.clientX;
    element.scrollTop += bounds.top + point.y * bounds.height - point.clientY;
    anchor.current = null;
  }
  useLayoutEffect(() => {
    const element = viewport.current!;
    const reset = () => {
      const ids = [...touches.current.keys()];
      touches.current.clear();
      pinch.current = null;
      anchor.current = null;
      drag.current = null;
      pen.current = null;
      if (pinchSession.current) {
        pinchSession.current = false;
        clickUntil.current = performance.now() + 400;
        callbacks.current.onPinch(false);
      }
      for (const id of ids)
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    };
    const hidden = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("blur", reset);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current!;
    const resize = () => {
      const compact = window.innerWidth <= 700;
      const padding = compact ? 12 : 24;
      const gap = compact ? 12 : 28;
      setFitWidth(
        Math.max(
          1,
          Math.min(
            element.clientWidth - 60,
            (element.clientHeight - 20 - padding) * 1.5 + padding + gap,
          ),
        ),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current!;
    const ratio = zoom / previousZoom.current;
    previousZoom.current = zoom;
    if (anchor.current) {
      applyAnchor();
      return;
    }
    if (ratio === 1) return;
    const left =
      (element.scrollLeft + element.clientWidth / 2) * ratio -
      element.clientWidth / 2;
    const top =
      (element.scrollTop + element.clientHeight / 2) * ratio -
      element.clientHeight / 2;
    element.scrollLeft = zoom === 100 ? 0 : left;
    element.scrollTop = zoom === 100 ? 0 : top;
  }, [zoom]);
  return (
    <>
      <div
        ref={viewport}
        className={`book-wrap zoom-viewport${hand ? " hand-mode" : ""}`}
        tabIndex={0}
        role="region"
        aria-label="Scrollable planner spread"
        onClickCapture={(e) => {
          if (!onSurface(e.target)) return;
          if (pinchSession.current || performance.now() < clickUntil.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onPointerDownCapture={(e) => {
          if (!onSurface(e.target)) return;
          if (e.pointerType === "pen") {
            if (pinchSession.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            pen.current = e.pointerId;
            penUntil.current = performance.now() + 700;
          }
          if (e.pointerType === "touch") {
            // Palm contacts must not start finger ink on either page while
            // a pen is writing, including when finger writing is enabled.
            if (pen.current !== null || performance.now() < penUntil.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (
              !pinchDisabled &&
              pen.current === null &&
              performance.now() >= penUntil.current &&
              touches.current.size === 2
            ) {
              const [a, b] = [...touches.current.values()];
              const distance = Math.hypot(b.x - a.x, b.y - a.y);
              if (distance > 0) {
                const bounds = e.currentTarget
                  .querySelector(".zoom-book-size")!
                  .getBoundingClientRect();
                pinch.current = {
                  distance,
                  zoom,
                  x: ((a.x + b.x) / 2 - bounds.left) / bounds.width,
                  y: ((a.y + b.y) / 2 - bounds.top) / bounds.height,
                };
                pinchSession.current = true;
                drag.current = null;
                // Roll back provisional finger ink before transferring capture.
                e.currentTarget.dispatchEvent(new Event("planner-pinch-start"));
                onPinch(true);
                for (const id of touches.current.keys())
                  e.currentTarget.setPointerCapture(id);
              }
            }
            if (pinchSession.current) {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
          }
          if (!hand || locked || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const element = e.currentTarget;
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
          };
          element.setPointerCapture(e.pointerId);
        }}
        onPointerMoveCapture={(e) => {
          if (!onSurface(e.target)) return;
          if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
            touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinchSession.current) {
              e.preventDefault();
              e.stopPropagation();
              const start = pinch.current;
              if (start && touches.current.size === 2 && !pinchDisabled) {
                const [a, b] = [...touches.current.values()];
                const next = Math.max(
                  100,
                  Math.min(
                    250,
                    Math.round(
                      (start.zoom * Math.hypot(b.x - a.x, b.y - a.y)) /
                        start.distance,
                    ),
                  ),
                );
                anchor.current = {
                  x: start.x,
                  y: start.y,
                  clientX: (a.x + b.x) / 2,
                  clientY: (a.y + b.y) / 2,
                };
                if (next === zoom) applyAnchor();
                else onZoom(next);
              }
              return;
            }
          }
          const start = drag.current;
          if (!start || start.id !== e.pointerId) return;
          e.currentTarget.scrollLeft = start.left + start.x - e.clientX;
          e.currentTarget.scrollTop = start.top + start.y - e.clientY;
        }}
        onPointerUpCapture={(e) => {
          if (!onSurface(e.target)) return;
          if (pen.current === e.pointerId) {
            pen.current = null;
            penUntil.current = performance.now() + 700;
          }
          touches.current.delete(e.pointerId);
          if (pinchSession.current && e.pointerType === "touch") {
            e.preventDefault();
            e.stopPropagation();
            pinch.current = null;
            if (touches.current.size === 0) {
              pinchSession.current = false;
              clickUntil.current = performance.now() + 400;
              onPinch(false);
            }
          }
          if (drag.current?.id !== e.pointerId) return;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancelCapture={(e) => {
          if (!onSurface(e.target)) return;
          touches.current.delete(e.pointerId);
          if (pen.current === e.pointerId) pen.current = null;
          if (pinchSession.current) {
            e.stopPropagation();
            pinch.current = null;
            if (touches.current.size === 0) {
              pinchSession.current = false;
              clickUntil.current = performance.now() + 400;
              onPinch(false);
            }
          }
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <div
          className="zoom-stage"
          style={{ width: fitWidth ? (fitWidth * zoom) / 100 + 60 : "100%" }}
        >
          <div
            className="zoom-book-size"
            style={{ width: fitWidth ? (fitWidth * zoom) / 100 : "100%" }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
