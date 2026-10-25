import { useId, useRef, useState, type ReactNode } from "react";

/** Native auto popovers provide outside-click, Escape and focus-return behavior. */
export function DockMenu({
  label,
  icon,
  side = "right",
  disabled,
  children,
}: {
  label: string;
  icon: string;
  side?: "left" | "right";
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="dock-launcher"
        disabled={disabled}
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
      >
        <span aria-hidden="true">{icon}</span>
        <small>{label}</small>
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className={`dock-panel dock-panel-${side}`}
        role="dialog"
        aria-label={label}
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <header className="dock-panel-heading">
          <strong>{label}</strong>
          <button
            aria-label={`Close ${label}`}
            onClick={() => panel.current?.hidePopover()}
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </>
  );
}
