export const SHORTCUTS = [
  ["← / →", "Previous / next spread"],
  ["T", "Go to today"],
  ["Home", "Open the planner’s home view"],
  ["M / W", "Month / week view"],
  ["G", "Jump to date"],
  ["P / N / H", "Pen / pencil / highlighter"],
  ["E / V / B", "Eraser / select and move / browse dates"],
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
  "pen" | "pencil" | "highlighter" | "eraser" | "select" | "browse"
> = {
  p: "pen",
  n: "pencil",
  h: "highlighter",
  e: "eraser",
  v: "select",
  b: "browse",
};

export const TOOL_HINTS: Record<string, string> = {
  Pen: "P",
  Pencil: "N",
  Highlighter: "H",
  Eraser: "E",
  "Select / move": "V",
  "Browse dates": "B",
  Undo: "Ctrl+Z",
  Redo: "Ctrl+Shift+Z / Ctrl+Y",
};
