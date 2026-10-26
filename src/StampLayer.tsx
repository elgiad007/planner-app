import { useEffect, useId, useRef, useState } from "react";
import { WIDTH, HEIGHT, type Stamp, type StampPlacement } from "./model";
import { StampPreview } from "./StampTool";

export function StampLayer({
  library,
  placements,
  active,
  placing,
  chosen,
  reset,
  onChange,
}: {
  library: Stamp[];
  placements: StampPlacement[];
  active: boolean;
  placing: boolean;
  chosen: string | null;
  reset?: number;
  onChange: (p: StampPlacement[]) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<StampPlacement | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    item: StampPlacement;
  } | null>(null);
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  function select(id: string | null) {
    window.dispatchEvent(
      new CustomEvent("planner-text-select", { detail: uid }),
    );
    setSelected(id);
  }
  useEffect(() => {
    const clear = (event: Event) => {
      if ((event as CustomEvent).detail !== uid) setSelected(null);
    };
    window.addEventListener("planner-text-select", clear);
    return () => window.removeEventListener("planner-text-select", clear);
  }, [uid]);
  useEffect(() => {
    setSelected(null);
    setPreview(null);
    drag.current = null;
    tap.current = null;
  }, [active, reset]);
  function point(e: { clientX: number; clientY: number }) {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * WIDTH) / r.width,
      y: ((e.clientY - r.top) * HEIGHT) / r.height,
    };
  }
  function clamp(x: number, y: number) {
    return {
      x: Math.max(0, Math.min(WIDTH - 200, x)),
      y: Math.max(0, Math.min(HEIGHT - 200, y)),
    };
  }
  return (
    <>
      <svg
        ref={svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`stamp-layer${active && placing ? " stamp-placing" : ""}`}
        aria-label="Page stamps"
        onPointerDown={(e) => {
          if (!active || !placing || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const t = tap.current;
          if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10)
            tap.current = null;
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const p = point(e);
          setPreview({
            ...d.item,
            ...clamp(d.item.x + p.x - d.x, d.item.y + p.y - d.y),
          });
        }}
        onPointerUp={(e) => {
          const t = tap.current;
          tap.current = null;
          if (
            t?.id === e.pointerId &&
            active &&
            placing &&
            chosen &&
            library.some((s) => s.id === chosen && !s.hidden) &&
            placements.length < 1000
          ) {
            const p = point(e);
            onChange([
              ...placements,
              {
                id: crypto.randomUUID(),
                stampId: chosen,
                ...clamp(p.x - 100, p.y - 100),
              },
            ]);
          }
          if (drag.current?.id === e.pointerId) {
            if (preview)
              onChange(
                placements.map((p) => (p.id === preview.id ? preview : p)),
              );
            drag.current = null;
            setPreview(null);
          }
        }}
        onPointerCancel={() => {
          tap.current = null;
          drag.current = null;
          setPreview(null);
        }}
        onLostPointerCapture={() => {
          tap.current = null;
          drag.current = null;
          setPreview(null);
        }}
      >
        {placements.map((original) => {
          const p = preview?.id === original.id ? preview : original;
          const stamp = library.find((s) => s.id === p.stampId);
          if (!stamp) return null;
          return (
            <g
              key={p.id}
              role={active && !placing ? "button" : undefined}
              tabIndex={active && !placing ? 0 : undefined}
              aria-label={`Stamp: ${stamp.name}`}
              style={{ pointerEvents: active && !placing ? "all" : "none" }}
              onKeyDown={(e) => {
                if (!active || placing) return;
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  onChange(placements.filter((s) => s.id !== p.id));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  select(p.id);
                }
              }}
              onPointerDown={(e) => {
                if (!active || placing || e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                select(p.id);
                drag.current = { id: e.pointerId, ...point(e), item: p };
                svg.current!.setPointerCapture(e.pointerId);
              }}
            >
              <foreignObject
                x={p.x}
                y={p.y}
                width={200}
                height={200}
                style={{ pointerEvents: "none" }}
              >
                <StampPreview stamp={stamp} />
              </foreignObject>
              <rect
                x={p.x}
                y={p.y}
                width={200}
                height={200}
                fill="transparent"
                stroke={active && selected === p.id ? "#6c628d" : "none"}
                strokeDasharray="5 3"
              />
            </g>
          );
        })}
      </svg>
      {active && !placing && placements.some((p) => p.id === selected) && (
        <div className="text-actions stamp-actions">
          <button
            onClick={() => {
              onChange(placements.filter((p) => p.id !== selected));
              setSelected(null);
            }}
          >
            Delete stamp
          </button>
          <button onClick={() => setSelected(null)}>Done</button>
        </div>
      )}
    </>
  );
}
