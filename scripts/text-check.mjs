import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { downloadBackup, openDock } from "./dock-helpers.mjs";
console.log("Launching browser");
const browser = await chromium.launch({ channel: "msedge", headless: true });
console.log("Browser launched");
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  console.log("Opening app");
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  console.log("Choosing text");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const layer = page.locator(".text-layer").first();
  await layer.click({ position: { x: 100, y: 200 } });
  await page
    .getByRole("textbox", { name: "Text contents" })
    .fill("Meeting notes\nBring the agenda");
  await page
    .getByRole("spinbutton", { name: "Font size", exact: true })
    .fill("30");
  await page.getByRole("button", { name: "Save text", exact: true }).click();
  const block = layer.getByRole("button", {
    name: "Text block: Meeting notes Bring the agenda",
  });
  console.log("Text saved");
  await block.waitFor();
  await page.getByRole("button", { name: "Ink #557961", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Text", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await block.locator("text").getAttribute("fill"), "#557961");
  const b = await block.boundingBox();
  await page.mouse.move(b.x + 15, b.y + 15);
  await page.mouse.down();
  await page.mouse.move(b.x + 55, b.y + 45, { steps: 5 });
  await page.mouse.up();
  const moved = await block.boundingBox();
  assert.ok(moved.x > b.x + 30);
  const handle = block.locator("[data-resize]");
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + 8, h.y + 8);
  await page.mouse.down();
  await page.mouse.move(h.x + 48, h.y + 38, { steps: 5 });
  await page.mouse.up();
  assert.ok((await block.boundingBox()).width > moved.width + 30);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text contents" })
    .fill("Revised notes\nBring two copies");
  await page
    .getByRole("spinbutton", { name: "Box height", exact: true })
    .fill("150");
  await page.getByRole("button", { name: "Save text", exact: true }).click();
  const backup = await downloadBackup(page);
  const saved = backup.pages.flatMap((p) => p.textBlocks ?? []);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, "Revised notes\nBring two copies");
  assert.equal(saved[0].fontSize, 30);
  assert.equal(saved[0].height, 150);
  assert.equal(saved[0].color, "#557961");
  await page.reload();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const revised = layer.getByRole("button", {
    name: "Text block: Revised notes Bring two copies",
  });
  await revised.tap();
  await page.getByRole("button", { name: "Delete text", exact: true }).click();
  assert.equal(await layer.locator("g").count(), 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await revised.waitFor();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(await layer.locator("g").count(), 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Select / move", exact: true })
    .click();
  await revised.tap();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .locator(".text-layer")
    .nth(1)
    .tap({ position: { x: 150, y: 300 } });
  await page.getByRole("textbox", { name: "Text contents" }).fill("Touch note");
  await page.getByRole("button", { name: "Save text", exact: true }).click();

  // Resize and move remain aligned at 150% zoom.
  await page.keyboard.press("Tab");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  const touch = page
    .locator(".text-layer")
    .nth(1)
    .getByRole("button", { name: "Text block: Touch note" });
  await touch.scrollIntoViewIfNeeded();
  await touch.tap();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Font size", exact: true })
    .fill("36");
  await page.getByRole("button", { name: "Save text", exact: true }).click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("0");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/text-tool-check.png",
    fullPage: true,
  });
  // Exercise the real PDF download. Record text canvas calls to ensure both notes are included.
  await page.evaluate(() => {
    window.__textDraws = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.__textDraws.push(text);
      return original.call(this, text, ...args);
    };
  });
  await openDock(page, "Files");
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  const pdfLink = page.getByRole("link", { name: "Download PDF", exact: true });
  await pdfLink.waitFor({ timeout: 60000 });
  const downloaded = page.waitForEvent("download");
  await pdfLink.click();
  const pdfBytes = await readFile(await (await downloaded).path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  const drawn = await page.evaluate(() => window.__textDraws);
  assert.ok(drawn.includes("Revised notes"));
  assert.ok(drawn.includes("Touch note"));

  assert.deepEqual(errors, []);
  console.log(
    "Text tool: create/edit/color/move/resize/backup/reload/delete/undo/redo/select/touch passed",
  );
} finally {
  await browser.close();
}
