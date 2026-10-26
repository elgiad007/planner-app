import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { downloadBackup, openDock } from "./dock-helpers.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1024 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page
    .locator(".right-dock")
    .getByRole("button", { name: "Zoom", exact: true })
    .waitFor();
  assert.equal(await page.locator(".workspace .spread-zoom").count(), 0);
  const region = page.getByRole("region", {
    name: "Scrollable planner spread",
  });
  // Check actual paper edges, not just whether scrollLeft changes.
  for (const viewport of [
    { width: 1920, height: 913 },
    { width: 1366, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openDock(page, "Zoom");
    await page.getByRole("button", { name: "Fit spread", exact: true }).click();
    for (let percent = 125; percent <= 250; percent += 25) {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      for (const end of [false, true]) {
        const edges = await region.evaluate((element, end) => {
          element.scrollLeft = end ? element.scrollWidth : 0;
          element.scrollTop = end ? element.scrollHeight : 0;
          const paper = element.querySelector(".book").getBoundingClientRect();
          const frame = element.getBoundingClientRect();
          return {
            left: paper.left - frame.left,
            top: paper.top - frame.top,
            right: paper.right - (frame.left + element.clientWidth),
            bottom: paper.bottom - (frame.top + element.clientHeight),
          };
        }, end);
        assert.ok(
          end
            ? edges.right <= 1 && edges.bottom <= 1
            : edges.left >= -1 && edges.top >= -1,
          `${viewport.width}px at ${percent}%: unreachable ${end ? "right/bottom" : "left/top"} edge: ${JSON.stringify(edges)}`,
        );
      }
    }
  }
  await page.setViewportSize({ width: 1366, height: 1024 });
  await openDock(page, "Zoom");
  await page.getByRole("button", { name: "Fit spread", exact: true }).click();
  const book = page.locator(".book");
  const initial = await book.boundingBox();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.getByLabel("Zoom level").textContent(), "200%");
  const large = await book.boundingBox();
  assert.ok(Math.abs(large.width / initial.width - 2) < 0.01);
  await region.evaluate((e) => {
    e.scrollLeft = 100;
    e.scrollTop = 100;
  });

  const before = (await downloadBackup(page)).pages;
  await page.getByRole("button", { name: "Hand", exact: true }).click();
  const r = await region.boundingBox();
  const x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 80, y - 65, { steps: 8 });
  await page.mouse.up();
  const scroll = await region.evaluate((e) => ({
    x: e.scrollLeft,
    y: e.scrollTop,
  }));
  assert.ok(scroll.x > 150 && scroll.y > 140);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + scroll.x + 20, y + scroll.y + 20, { steps: 8 });
  await page.mouse.up();
  const returned = await region.evaluate((element) => {
    const paper = element.querySelector(".book").getBoundingClientRect();
    const frame = element.getBoundingClientRect();
    return {
      left: element.scrollLeft,
      top: element.scrollTop,
      paperLeft: paper.left - frame.left,
      paperTop: paper.top - frame.top,
    };
  });
  assert.equal(returned.left + returned.top, 0);
  assert.ok(returned.paperLeft >= 0 && returned.paperTop >= 0);
  assert.deepEqual((await downloadBackup(page)).pages, before);
  await openDock(page, "Zoom");
  await page.getByRole("button", { name: "Hand", exact: true }).click();

  // Draw on a visible portion of the left page, then verify model coordinates.
  const target = page.locator(".page-0 canvas.ink").first();
  const box = await target.boundingBox();
  const px = Math.max(r.x + 30, box.x + box.width * 0.6),
    py = Math.max(r.y + 40, box.y + box.height * 0.4);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 30, py + 20, { steps: 5 });
  await page.mouse.up();
  const saved = await downloadBackup(page);
  const stroke = saved.pages.flatMap((p) => p.strokes).at(-1);
  assert.ok(stroke?.points.length > 1);
  assert.ok(
    Math.abs(stroke.points[0].x - ((px - box.x) / box.width) * 600) < 1,
  );
  assert.ok(
    Math.abs(stroke.points[0].y - ((py - box.y) / box.height) * 800) < 1,
  );
  const resolution = await target.evaluate((e) => ({
    pixels: e.width,
    display: e.getBoundingClientRect().width,
  }));
  assert.ok(Math.abs(resolution.pixels - resolution.display) <= 1);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.mouse.move(px + 15, py + 10);
  await page.mouse.down();
  await page.mouse.up();
  assert.equal(
    (await downloadBackup(page)).pages.flatMap((p) => p.strokes).length,
    0,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const normalizedPages = (pages) =>
    pages.map((p) => ({ ...p, textBlocks: p.textBlocks ?? [] }));
  assert.deepEqual(
    normalizedPages((await downloadBackup(page)).pages),
    normalizedPages(saved.pages),
  );
  await openDock(page, "Files");
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await page.getByRole("link", { name: "Download PDF", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await openDock(page, "Zoom");
  assert.equal(await page.getByLabel("Zoom level").textContent(), "200%");
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Zoom in", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Fit spread", exact: true }).click();
  assert.equal(await page.getByLabel("Zoom level").textContent(), "100%");
  assert.ok(Math.abs((await book.boundingBox()).width - initial.width) < 1);
  assert.equal(await region.evaluate((e) => e.scrollLeft + e.scrollTop), 0);
  await page.getByRole("button", { name: "Next spread", exact: true }).click();
  await page.waitForTimeout(1800);
  assert.equal(
    await page
      .getByRole("button", { name: "Next spread", exact: true })
      .isEnabled(),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const fit = await book.boundingBox(),
    area = await region.boundingBox();
  assert.ok(fit.width < area.width);
  await openDock(page, "Zoom");
  const panel = await page
    .getByRole("dialog", { name: "Zoom", exact: true })
    .boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
  assert.deepEqual(errors, []);
  console.log(
    "All spread edges reachable from 125–250% on wide, desktop, and mobile layouts; Hand return to left/top, drawing alignment, erasing/undo, PDF export, fit reset, and page turn passed.",
  );
} finally {
  await browser.close();
}
