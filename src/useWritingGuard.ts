import { useLayoutEffect, useRef } from "react";

// Safari can select the template beneath the canvas on repeated Pencil taps.
// Keep gesture suppression scoped to the paper, leaving toolbar controls usable.
export function useWritingGuard(writing: boolean) {
  const book = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = book.current;
    if (!root || !writing) return;
    const onPaper = (target: EventTarget | null) => {
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return !!element?.closest(".page");
    };
    const clearPaperSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        if (
          Array.from(root.querySelectorAll(".page")).some((p) =>
            range.intersectsNode(p),
          )
        ) {
          selection.removeAllRanges();
          return;
        }
      }
    };
    const suppress = (e: Event) => {
      if (onPaper(e.target) && e.cancelable) e.preventDefault();
    };
    const contact = (e: PointerEvent) => {
      if (onPaper(e.target)) clearPaperSelection();
    };
    root.addEventListener("selectstart", suppress, true);
    root.addEventListener("contextmenu", suppress, true);
    root.addEventListener("dblclick", suppress, true);
    // Native non-passive listener: React's delegated touch listeners may be passive.
    root.addEventListener("touchstart", suppress, {
      capture: true,
      passive: false,
    });
    root.addEventListener("pointerdown", contact, true);
    document.addEventListener("selectionchange", clearPaperSelection);
    clearPaperSelection();
    return () => {
      root.removeEventListener("selectstart", suppress, true);
      root.removeEventListener("contextmenu", suppress, true);
      root.removeEventListener("dblclick", suppress, true);
      root.removeEventListener("touchstart", suppress, true);
      root.removeEventListener("pointerdown", contact, true);
      document.removeEventListener("selectionchange", clearPaperSelection);
    };
  }, [writing]);
  return book;
}
