import { useLayoutEffect, useRef } from "react";
import { PageFlip } from "page-flip";

// Only disposable DOM copies enter the animation engine. Canvas pixels are copied
// explicitly because cloneNode does not copy a canvas bitmap.
export function PageTurn({
  direction,
  onDone,
}: {
  direction: number;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = host.current!;
    const root = document.createElement("div");
    container.append(root);
    const book = container.parentElement!;
    const current = Array.from(
      book.querySelectorAll<HTMLElement>(":scope > .page"),
    );
    const incoming = Array.from(
      book.querySelectorAll<HTMLElement>(".turn-destination > .page"),
    );
    const bounds = current[0].getBoundingClientRect();
    const gap = current[1].getBoundingClientRect().left - bounds.right;
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        onDone();
      }
    };
    const flip = new PageFlip(root, {
      width: bounds.width + gap / 2,
      height: bounds.height,
      size: "fixed",
      usePortrait: false,
      autoSize: false,
      startPage: direction > 0 ? 0 : 2,
      flippingTime: 650,
      useMouseEvents: false,
      showPageCorners: false,
      mobileScrollSupport: false,
      maxShadowOpacity: 0.28,
    });
    const ordered =
      direction > 0 ? [...current, ...incoming] : [...incoming, ...current];
    const sheets = ordered.map((source, i) => {
      const sheet = document.createElement("div");
      sheet.className = "turn-sheet";
      const copy = source.cloneNode(true) as HTMLElement;
      copy.style.width = `${bounds.width}px`;
      copy.style.height = `${bounds.height}px`;
      copy.style.marginLeft = i % 2 ? `${gap / 2}px` : "0";
      copy.querySelectorAll("canvas").forEach((canvas, index) => {
        const original = source.querySelectorAll("canvas")[index];
        canvas.width = original.width;
        canvas.height = original.height;
        canvas.getContext("2d")?.drawImage(original, 0, 0);
      });
      sheet.append(copy);
      root.append(sheet);
      return sheet;
    });
    flip.on("changeState", (event: { data: unknown }) => {
      if (event.data === "read") finish();
    });
    flip.loadFromHTML(sheets);
    const frame = requestAnimationFrame(() =>
      direction > 0 ? flip.flipNext("bottom") : flip.flipPrev("bottom"),
    );
    // Background tabs and resized windows must never leave navigation locked.
    const timer = window.setTimeout(finish, 1600);
    window.addEventListener("resize", finish);
    window.addEventListener("pagehide", finish);
    return () => {
      finished = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("resize", finish);
      window.removeEventListener("pagehide", finish);
      flip.destroy();
    };
  }, []);
  return <div ref={host} className="page-turn" aria-hidden="true" />;
}
