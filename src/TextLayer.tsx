import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { WIDTH, HEIGHT, type TextBlock } from "./model";
import { textLines } from "./renderText";

export function TextLayer({
  blocks,
  active,
  placing,
  color,
  reset,
  colorRevision = 0,
  onChange,
}: {
  blocks: TextBlock[];
  active: boolean;
  placing: boolean;
  color: string;
  reset?: number;
  colorRevision?: number;
  onChange: (blocks: TextBlock[]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<TextBlock | null>(null);
  const [preview, setPreview] = useState<TextBlock | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const uid = useId().replace(/:/g, "");
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    block: TextBlock;
    resize: boolean;
  } | null>(null);
  const latest = useRef({ blocks, onChange });
  latest.current = { blocks, onChange };
  const previousColor = useRef(colorRevision);
  const chosen = blocks.find((b) => b.id === selected);
  useEffect(() => {
    setSelected(null);
    setDraft(null);
    setPreview(null);
    drag.current = null;
  }, [active, reset]);
  useEffect(() => {
    if (previousColor.current !== colorRevision && active && selected) {
      onChange(blocks.map((b) => (b.id === selected ? { ...b, color } : b)));
    }
    previousColor.current = colorRevision;
  }, [color, colorRevision, active, selected, blocks, onChange]);
  useEffect(() => {
    const clear = (event: Event) => {
      if ((event as CustomEvent).detail !== uid) setSelected(null);
    };
    window.addEventListener("planner-text-select", clear);
    return () => window.removeEventListener("planner-text-select", clear);
  }, [uid]);
  useEffect(() => {
    if (!draft) return;
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [!!draft]);
  function select(id: string | null) {
    window.dispatchEvent(
      new CustomEvent("planner-text-select", { detail: uid }),
    );
    setSelected(id);
  }
  function point(e: { clientX: number; clientY: number }) {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * WIDTH) / r.width,
      y: ((e.clientY - r.top) * HEIGHT) / r.height,
    };
  }
  function commit(block: TextBlock) {
    const { blocks: current, onChange: change } = latest.current;
    change(
      current.some((b) => b.id === block.id)
        ? current.map((b) => (b.id === block.id ? block : b))
        : [...current, block],
    );
  }
  function remove() {
    onChange(blocks.filter((b) => b.id !== selected));
    select(null);
  }
  return (
    <>
      <svg
        ref={svg}
        className={`text-layer${active && placing ? " text-placing" : ""}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label="Text blocks"
        onPointerDown={(e) => {
          if (
            !active ||
            !placing ||
            e.target !== e.currentTarget ||
            e.button !== 0
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          const p = point(e);
          const block = {
            id: crypto.randomUUID(),
            text: "",
            color,
            x: Math.max(0, Math.min(WIDTH - 220, p.x)),
            y: Math.max(0, Math.min(HEIGHT - 100, p.y)),
            width: 220,
            height: 100,
            fontSize: 24,
          };
          select(block.id);
          setDraft(block);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || start.id !== e.pointerId) return;
          const p = point(e),
            b = start.block,
            dx = p.x - start.x,
            dy = p.y - start.y;
          setPreview(
            start.resize
              ? {
                  ...b,
                  width: Math.max(40, Math.min(WIDTH - b.x, b.width + dx)),
                  height: Math.max(30, Math.min(HEIGHT - b.y, b.height + dy)),
                }
              : {
                  ...b,
                  x: Math.max(0, Math.min(WIDTH - b.width, b.x + dx)),
                  y: Math.max(0, Math.min(HEIGHT - b.height, b.y + dy)),
                },
          );
        }}
        onPointerUp={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          const before = drag.current.block;
          drag.current = null;
          if (preview && JSON.stringify(before) !== JSON.stringify(preview))
            commit(preview);
          setPreview(null);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setPreview(null);
        }}
      >
        {blocks.map((original) => {
          const b = preview?.id === original.id ? preview : original;
          const clip = `${uid}-${b.id}`;
          return (
            <g
              key={b.id}
              role={active ? "button" : undefined}
              tabIndex={active ? 0 : undefined}
              aria-label={`Text block: ${b.text}`}
              style={{
                pointerEvents: active ? "all" : "none",
                cursor: active ? "move" : undefined,
              }}
              onKeyDown={(e) => {
                if (!active) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  select(b.id);
                  setDraft(b);
                }
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  onChange(blocks.filter((t) => t.id !== b.id));
                }
              }}
              onPointerDown={(e) => {
                if (!active || e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                select(b.id);
                const p = point(e);
                drag.current = {
                  id: e.pointerId,
                  ...p,
                  block: b,
                  resize:
                    (e.target as Element).getAttribute("data-resize") ===
                    "true",
                };
                svg.current!.setPointerCapture(e.pointerId);
              }}
            >
              <defs>
                <clipPath id={clip}>
                  <rect x={b.x} y={b.y} width={b.width} height={b.height} />
                </clipPath>
              </defs>
              <rect
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                fill="transparent"
                stroke={active && selected === b.id ? "#6c628d" : "none"}
                strokeWidth="1.5"
                strokeDasharray="5 3"
              />
              <text
                clipPath={`url(#${clip})`}
                fill={b.color}
                fontFamily="Arial"
                fontSize={b.fontSize}
                style={{ pointerEvents: "none" }}
              >
                {textLines(b).map((line, i) => (
                  <tspan
                    key={i}
                    x={b.x + 4}
                    y={b.y + 4 + b.fontSize + i * b.fontSize * 1.2}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
              {active && selected === b.id && (
                <rect
                  data-resize="true"
                  x={b.x + b.width - 16}
                  y={b.y + b.height - 16}
                  width="16"
                  height="16"
                  fill="#6c628d"
                  style={{ cursor: "nwse-resize" }}
                />
              )}
            </g>
          );
        })}
      </svg>
      {active && chosen && (
        <div
          className="text-actions"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={() => setDraft(chosen)}>Edit text</button>
          <button onClick={remove}>Delete text</button>
          <button onClick={() => select(null)}>Done</button>
        </div>
      )}
      {draft &&
        createPortal(
          <dialog
            className="text-editor"
            ref={dialog}
            aria-label="Edit text block"
            onCancel={() => {
              setDraft(null);
              if (!chosen) select(null);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commit(draft);
                setDraft(null);
              }}
            >
              <h2>Edit text block</h2>
              <label>
                Text
                <textarea
                  aria-label="Text contents"
                  autoFocus
                  maxLength={10000}
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                />
              </label>
              {(
                [
                  ["fontSize", "Font size", 8, 96],
                  ["width", "Box width", 40, WIDTH - draft.x],
                  ["height", "Box height", 30, HEIGHT - draft.y],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    type="number"
                    required
                    min={min}
                    max={max}
                    step="any"
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              <p>
                Drag the block to move it. Drag its corner to resize. Text
                outside the box is clipped. Use the writing toolbar palette to
                change its color.
              </p>
              <div>
                <button type="submit">Save text</button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    if (!chosen) select(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
