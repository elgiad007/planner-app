import { drawStamps } from "./stamps";
import { drawTextBlocks } from "./renderText";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Template } from "./Template";
import { drawStrokes } from "./renderInk";
import { exportViews } from "./exportModel";
import { WIDTH, HEIGHT, pageIds, type Backup } from "./model";

// Two logical pages per PDF sheet; only one paper canvas exists at a time.
export async function createPdf(
  data: Backup,
  scope: "current" | "binder",
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<Blob> {
  const views = exportViews(data, scope);
  const pages = new Map(data.pages.map((p) => [p.id, p]));
  const inserts = new Map(data.settings.inserts?.map((i) => [i.id, i]));
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: [1200, 800],
    compress: true,
  });
  pdf.setProperties({
    title: data.settings.plannerName || "My Pastel Planner",
    creator: "My Pastel Planner 0.4.0",
  });
  const host = document.createElement("div");
  host.className = "pdf-paper";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  document.body.append(host);
  const root = createRoot(host);
  try {
    await document.fonts.ready;
    for (let i = 0; i < views.length; i++) {
      if (i) pdf.addPage([1200, 800], "landscape");
      for (let side = 0; side < 2; side++) {
        signal.throwIfAborted();
        const view = views[i];
        host.className = `pdf-paper page-${side}`;
        host.style.background = "#fffdf8";
        flushSync(() =>
          root.render(
            <div className="page-content">
              <Template
                plannerName={data.settings.plannerName}
                showHolidays={data.settings.showHolidays !== false}
                view={view}
                side={side}
                insert={inserts.get(view.insert ?? "")}
                onWeek={() => {}}
              />
            </div>,
          ),
        );
        // Freeze computed lengths: html2canvas doesn't resolve container units.
        const nodes = [
          host,
          ...host.querySelectorAll<HTMLElement | SVGElement>("*"),
        ];
        const paper = host.querySelector<SVGSVGElement>("svg.insert-paper");
        const paperBounds = paper?.getBoundingClientRect();
        const styles = nodes.map((node) => {
          const css = getComputedStyle(node);
          // One bulk assignment avoids hundreds of CSSOM mutations per node.
          // Snapshot every node before writing so inheritance/layout stays stable.
          return Array.from(
            css,
            (key) => `${key}:${css.getPropertyValue(key)};`,
          ).join("");
        });
        nodes.forEach((node, index) => {
          node.style.cssText = styles[index];
        });
        // The isolated renderer must work offline even if its cloned iframe
        // can't load a stylesheet. Keep all styles inline, but use the SVG's
        // actual flexed size rather than its intrinsic 600x650 dimensions.
        if (paper && paperBounds) {
          paper.style.width = `${paperBounds.width}px`;
          paper.style.height = `${paperBounds.height}px`;
          paper.style.flex = "none";
        }
        const canvas = await html2canvas(host, {
          scale: 2,
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: "#fffdf8",
          logging: false,
          scrollX: 0,
          scrollY: 0,
          // All paper styles are frozen above. Skip unrelated body subtrees,
          // especially the app's live ink canvases, when cloning the document.
          ignoreElements: (element) =>
            element.parentElement === document.body && element !== host,
        });
        try {
          signal.throwIfAborted();
          const ctx = canvas.getContext("2d")!;
          // html2canvas leaves its translated/scaled transform on the context.
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          // Repeating gradients aren't supported by html2canvas. Draw the same
          // writing guides explicitly, in logical page coordinates.
          const origin = host.getBoundingClientRect();
          for (const node of host.querySelectorAll<HTMLElement>(
            ".date-cell, .writing-lines",
          )) {
            const r = node.getBoundingClientRect();
            const monthly = node.classList.contains("date-cell");
            const gap = WIDTH * 0.038;
            ctx.fillStyle = monthly ? "#b4aab52a" : "#b4aab547";
            for (let y = gap; y + 1 < r.height; y += gap + 1)
              ctx.fillRect(
                r.left - origin.left + 1,
                r.top - origin.top + y,
                r.width - 2,
                1,
              );
          }
          drawStrokes(ctx, pages.get(pageIds(view)[side])?.strokes ?? []);
          drawStamps(
            ctx,
            data.settings.stamps ?? [],
            pages.get(pageIds(view)[side])?.stamps ?? [],
          );
          drawTextBlocks(ctx, pages.get(pageIds(view)[side])?.textBlocks ?? []);
          pdf.addImage(
            canvas.toDataURL("image/jpeg", 0.94),
            "JPEG",
            side * WIDTH,
            0,
            WIDTH,
            HEIGHT,
          );
        } finally {
          canvas.width = canvas.height = 1;
        }
        // Clear frozen inline styles before reusing React nodes for another template.
        flushSync(() => root.render(null));
      }
      progress(i + 1, views.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    return pdf.output("blob");
  } finally {
    root.unmount();
    host.remove();
  }
}
