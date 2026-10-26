import type { TextBlock } from "./model";

let measuring: CanvasRenderingContext2D | null;
export function textLines(block: TextBlock): string[] {
  measuring ??= document.createElement("canvas").getContext("2d");
  const ctx = measuring!;
  ctx.font = `${block.fontSize}px Arial`;
  const lines: string[] = [];
  for (const paragraph of block.text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > block.width - 8) {
        const space = line.lastIndexOf(" ");
        if (space > 0 && char !== " ") {
          lines.push(line.slice(0, space));
          line = line.slice(space + 1);
        } else {
          lines.push(line);
          line = "";
        }
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
export function drawTextBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: TextBlock[],
) {
  for (const block of blocks) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(block.x, block.y, block.width, block.height);
    ctx.clip();
    ctx.fillStyle = block.color;
    ctx.font = `${block.fontSize}px Arial`;
    ctx.textBaseline = "alphabetic";
    textLines(block).forEach((line, i) =>
      ctx.fillText(
        line,
        block.x + 4,
        block.y + 4 + block.fontSize + i * block.fontSize * 1.2,
      ),
    );
    ctx.restore();
  }
}
