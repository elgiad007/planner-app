export const SHORTCUTS = [
  ["← / →", "Previous / next spread"],
  ["T", "Text tool"],
  ["Home", "Open the planner’s home view"],
  ["M / W", "Month / week view"],
  ["G", "Jump to date"],
  ["P / N / H", "Pen / pencil / highlighter"],
  ["E / S / B", "Eraser / select and move / browse dates"],
  ["Hold Space", "Temporarily pan the spread"],
  ["[ / ]", "Decrease / increase writing-tool width"],
  ["Ctrl+Z", "Undo"],
  ["Ctrl+Shift+Z / Ctrl+Y", "Redo"],
  ["+ / −", "Zoom in / out"],
  ["0", "Reset zoom to 100%"],
  ["Esc", "Close a menu or help; otherwise clear ink selection"],
  ["?", "Open shortcut help"],
  ["Tab / Shift+Tab", "Next / previous control"],
  ["Enter / Space", "Activate a focused button"],
  ["↑ / ↓", "Previous / next control in an open menu"],
] as const;

export const TOOL_KEYS: Record<
  string,
  "pen" | "pencil" | "highlighter" | "eraser" | "select" | "browse" | "text"
> = {
  t: "text",
  p: "pen",
  n: "pencil",
  h: "highlighter",
  e: "eraser",
  s: "select",
  b: "browse",
};

export const TOOL_HINTS: Record<string, string> = {
  Text: "T",
  Pen: "P",
  Pencil: "N",
  Highlighter: "H",
  Eraser: "E",
  "Select / move": "S",
  "Browse dates": "B",
  Undo: "Ctrl+Z",
  Redo: "Ctrl+Shift+Z / Ctrl+Y",
};
