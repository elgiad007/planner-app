import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DockMenu } from "./DockMenu";
import { hitsStroke, type Stamp, type Stroke, type Point } from "./model";
import { drawStamp } from "./stamps";
import { drawStrokes } from "./renderInk";
import { validateStamps } from "./validateStamps";

export function StampPreview({ stamp }: { stamp: Stamp }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // PageTurn copies canvas bitmaps in a layout effect. Paint incoming stamps
  // in that same phase, before its sibling snapshots the destination pages.
  useLayoutEffect(() => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.clearRect(0, 0, 200, 200);
    drawStamp(ctx, stamp);
  }, [stamp]);
  return (
    <canvas
      ref={canvas}
      width={200}
      height={200}
      className="stamp-preview"
      aria-hidden="true"
    />
  );
}

export function StampTool({
  library,
  selected,
  disabled,
  onChoose,
  onLibrary,
}: {
  library: Stamp[];
  selected: string | null;
  disabled: boolean;
  onChoose: (id: string) => void;
  onLibrary: (library: Stamp[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DockMenu
        label="Stamps"
        icon="▧"
        side="left"
        disabled={disabled}
        selected={selected !== null}
      >
        <p>Choose a stamp, then tap a page to place it.</p>
        <div className="stamp-grid">
          {library
            .filter((s) => !s.hidden)
            .map((stamp) => (
              <div key={stamp.id}>
                <button
                  disabled={disabled}
                  aria-label={`Use stamp: ${stamp.name}`}
                  aria-pressed={selected === stamp.id}
                  onClick={(e) => {
                    onChoose(stamp.id);
                    e.currentTarget
                      .closest<HTMLElement>("[popover]")
                      ?.hidePopover();
                  }}
                >
                  <StampPreview stamp={stamp} />
                  <span>{stamp.name}</span>
                </button>
                <button
                  disabled={disabled}
                  aria-label={`Remove stamp: ${stamp.name}`}
                  onClick={() =>
                    onLibrary(
                      library.map((s) =>
                        s.id === stamp.id ? { ...s, hidden: true } : s,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
        {!library.some((s) => !s.hidden) && (
          <p>No stamps yet. Draw your first stamp below.</p>
        )}
        <button
          disabled={disabled || library.length >= 500}
          onClick={(e) => {
            e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
            setCreating(true);
          }}
        >
          Create stamp
        </button>
        <p className="stamp-hint">
          Removing a stamp keeps existing page placements.
        </p>
      </DockMenu>
      {creating && (
        <StampEditor
          disabled={disabled}
          onCancel={() => setCreating(false)}
          onSave={(stamp) => {
            onLibrary([...library, stamp]);
            onChoose(stamp.id);
            setCreating(false);
          }}
          library={library}
        />
      )}
    </>
  );
}

function StampEditor({
  library,
  disabled,
  onSave,
  onCancel,
}: {
  library: Stamp[];
  disabled: boolean;
  onSave: (s: Stamp) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4b4659");
  const [width, setWidth] = useState(2.5);
  const [eraser, setEraser] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<{
    id: number;
    stroke: Stroke;
    remaining: Stroke[];
  } | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current!.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  function paint(list: Stroke[]) {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 200, 200);
    drawStrokes(ctx, list);
  }
  useEffect(() => {
    paint(strokes);
  }, [strokes]);
  function point(e: {
    clientX: number;
    clientY: number;
    pressure: number;
  }): Point {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(200, ((e.clientX - r.left) * 200) / r.width)),
      y: Math.max(0, Math.min(200, ((e.clientY - r.top) * 200) / r.height)),
      pressure: e.pressure || 0.5,
    };
  }
  function erase(list: Stroke[], p: Point) {
    return list.filter((s) => !hitsStroke(p, s));
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="text-editor stamp-editor"
      aria-label="Create stamp"
      onCancel={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (active.current || disabled) return;
          const stamp = { id: crypto.randomUUID(), name: name.trim(), strokes };
          try {
            validateStamps([...library, stamp]);
            onSave(stamp);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <h2>Create stamp</h2>
        <label>
          Stamp name
          <input
            autoFocus
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p>200 × 200 maximum. Draw with a pen, mouse, or finger.</p>
        <div className="stamp-editor-controls">
          <label>
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Pen width
            <input
              aria-label="Stamp pen width"
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            aria-pressed={eraser}
            onClick={() => setEraser(!eraser)}
          >
            Eraser
          </button>
        </div>
        <canvas
          ref={canvas}
          className="stamp-drawing"
          width={400}
          height={400}
          aria-label="Stamp drawing area"
          onPointerDown={(e) => {
            if (e.button !== 0 || active.current || disabled) return;
            e.preventDefault();
            const p = point(e);
            active.current = {
              id: e.pointerId,
              stroke: { id: crypto.randomUUID(), color, width, points: [p] },
              remaining: eraser ? erase(strokes, p) : strokes,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            paint(
              eraser
                ? active.current.remaining
                : [...strokes, active.current.stroke],
            );
          }}
          onPointerMove={(e) => {
            const a = active.current;
            if (!a || a.id !== e.pointerId) return;
            const p = point(e);
            if (eraser) a.remaining = erase(a.remaining, p);
            else if (a.stroke.points.length < 20000) a.stroke.points.push(p);
            paint(eraser ? a.remaining : [...strokes, a.stroke]);
          }}
          onPointerUp={(e) => {
            const a = active.current;
            if (!a || a.id !== e.pointerId) return;
            active.current = null;
            setStrokes(eraser ? a.remaining : [...strokes, a.stroke]);
          }}
          onPointerCancel={() => {
            active.current = null;
            paint(strokes);
          }}
          onLostPointerCapture={() => {
            if (active.current) {
              active.current = null;
              paint(strokes);
            }
          }}
        />
        <div className="stamp-editor-controls">
          <button
            type="button"
            disabled={!strokes.length}
            onClick={() => setStrokes(strokes.slice(0, -1))}
          >
            Undo stroke
          </button>
          <button
            type="button"
            disabled={!strokes.length}
            onClick={() => setStrokes([])}
          >
            Clear
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <div>
          <button
            disabled={disabled || !name.trim() || !strokes.length}
            type="submit"
          >
            Save stamp
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
