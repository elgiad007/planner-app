import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function SpreadViewport({
  children,
  locked,
  hand,
  zoom,
}: {
  children: ReactNode;
  locked: boolean;
  hand: boolean;
  zoom: number;
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
  const [fitWidth, setFitWidth] = useState(0);
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
        onPointerDownCapture={(e) => {
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
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || start.id !== e.pointerId) return;
          e.currentTarget.scrollLeft = start.left + start.x - e.clientX;
          e.currentTarget.scrollTop = start.top + start.y - e.clientY;
        }}
        onPointerUp={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
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
