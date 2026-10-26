import type { ButtonHTMLAttributes } from "react";
import { TOOL_HINTS } from "./shortcuts";

const paths = {
  text: "M4 5h16M12 5v15M8 20h8",
  pen: "m5 19 1-5L17 3l4 4L10 18l-5 1Zm9-13 4 4M6 14l4 4",
  pencil: "m4 20 2-6L17 3l4 4L10 18l-6 2Zm3-7 4 4M14 6l4 4",
  highlighter: "m5 15 9-11 6 6-11 9-4-4Zm7-8 5 5M5 15l-2 5h6l1-2M3 22h17",
  select: "m4 3 6 16 3-6 6-3L4 3Zm9 10 6 6",
  eraser: "m3 14 9-10 9 8-8 9H9l-6-7Zm5-5 9 8M13 21h8",
  browse: "M4 5h16v16H4V5Zm0 5h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2",
  finger:
    "M9 12V5a2 2 0 0 1 4 0v7-3a2 2 0 0 1 4 0v3-1a2 2 0 0 1 4 0v5c0 4-3 6-6 6h-2c-2 0-3-1-4-3l-5-6a2 2 0 0 1 3-2l2 2",
  undo: "m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14",
  redo: "m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14",
  collapse: "M5 12h14",
  expand: "M5 12h14M12 5v14",
};

export function ToolButton({
  icon,
  label,
  hint,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: keyof typeof paths;
  label: string;
  hint?: string;
}) {
  const tooltip =
    hint ?? (TOOL_HINTS[label] ? `${label} (${TOOL_HINTS[label]})` : label);
  return (
    <button
      {...props}
      className={`tool-button ${className}`}
      aria-label={label}
      title={tooltip}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={paths[icon]} />
      </svg>
      <span className="tool-tooltip" aria-hidden="true">
        {tooltip}
      </span>
    </button>
  );
}
