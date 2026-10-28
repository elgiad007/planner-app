import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDock } from "./dock-helpers.mjs";
async function downloadBackup(page) {
  await page.waitForFunction(
    () => !document.querySelector(".dock-panel:popover-open"),
  );
  await openDock(page, "Files");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save planner…", exact: true })
    .click();
  const data = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  await page.getByRole("button", { name: "Close Files", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Files"].dock-launcher')
        ?.getAttribute("aria-expanded") === "false",
  );
  return data;
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 1024 } });
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await openDock(page, "Stamps");
  await page.getByRole("button", { name: "Create stamp", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Create stamp",
    exact: true,
  });
  assert.equal(
    await editor.evaluate(
      (el) =>
        el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth,
    ),
    true,
  );
  const optionsBounds = await page
    .locator(".stamp-editor-options")
    .boundingBox();
  const drawingBounds = await page
    .getByLabel("Stamp drawing area")
    .boundingBox();
  assert.ok(optionsBounds.x + optionsBounds.width < drawingBounds.x);
  await page.getByRole("textbox", { name: "Stamp name" }).fill("Flower");
  const area = await page.getByLabel("Stamp drawing area").boundingBox();
  await page.mouse.move(area.x + 40, area.y + 40);
  await page.mouse.down();
  await page.mouse.move(area.x + 140, area.y + 160, { steps: 15 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Save stamp", exact: true }).click();
  const layer = page.locator(".stamp-layer").first();
  await layer.click({ position: { x: 160, y: 220 } });
  await layer.click({ position: { x: 280, y: 340 } });
  let data = await downloadBackup(page);
  assert.equal(data.settings.stamps.length, 1);
  assert.equal(data.pages.flatMap((p) => p.stamps ?? []).length, 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await layer.locator("foreignObject").count(), 1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(await layer.locator("foreignObject").count(), 2);
  await page
    .getByRole("button", { name: "Select / move", exact: true })
    .click();
  const stamp = layer.getByRole("button", { name: "Stamp: Flower" }).first();
  const box = await stamp.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 50, { steps: 5 });
  await page.mouse.up();
  assert.ok((await stamp.boundingBox()).x > box.x + 25);
  const deleteStamp = page.getByRole("button", {
    name: "Delete stamp",
    exact: true,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await deleteStamp.click();
  assert.equal(await layer.locator("foreignObject").count(), 2);
  page.once("dialog", (dialog) => dialog.accept());
  await deleteStamp.click();
  assert.equal(await layer.locator("foreignObject").count(), 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await layer.locator("foreignObject").count(), 2);
  await openDock(page, "Stamps");
  await page
    .getByRole("button", { name: "Find spreads: Flower (1)", exact: true })
    .click();
  assert.equal(
    await page
      .locator('.stamp-card[data-finding="true"] .stamp-preview')
      .count(),
    1,
  );
  assert.equal(await page.locator(".workspace .stamp-finding").count(), 0);
  assert.equal(
    await page.locator(".dock-panel .stamp-finding").isVisible(),
    true,
  );
  await page
    .getByRole("button", { name: "Month · 2027-01-01", exact: true })
    .click();
  assert.equal(
    await page.locator('.month-tabs button[data-stamp-match="true"]').count(),
    1,
  );
  await openDock(page, "Stamps");
  assert.match(
    await page.getByRole("region", { name: "Stamp matches" }).innerText(),
    /Finding: Flower · 1 spreads/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const matchPanel = page.getByRole("region", { name: "Stamp matches" });
  await matchPanel.scrollIntoViewIfNeeded();
  assert.equal(
    await matchPanel.evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  const matchBounds = await matchPanel.boundingBox();
  assert.ok(matchBounds.x >= 0 && matchBounds.x + matchBounds.width <= 390);
  assert.ok(matchBounds.y >= 0 && matchBounds.y + matchBounds.height <= 844);
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.getByRole("button", { name: "Clear stamp filter" }).click();
  assert.equal(
    await page.locator('.month-tabs button[data-stamp-match="true"]').count(),
    0,
  );
  const removeStamp = page.getByRole("button", {
    name: "Remove stamp: Flower",
    exact: true,
  });
  page.once("dialog", async (dialog) => {
    assert.equal(dialog.type(), "confirm");
    assert.match(dialog.message(), /Existing page placements will be kept/);
    await dialog.dismiss();
  });
  await removeStamp.click();
  await removeStamp.waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await removeStamp.click();
  await page
    .getByRole("button", {
      name: "Find spreads: Flower (1) · removed from library",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Close Stamps", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Stamps"].dock-launcher')
        ?.getAttribute("aria-expanded") === "false",
  );
  data = await downloadBackup(page);
  assert.equal(data.settings.stamps[0].hidden, true);
  await page.reload();
  await page.getByRole("button", { name: "Stamps", exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".stamp-layer foreignObject").length === 2,
  );
  const nonblank = await page
    .locator(".stamp-layer canvas")
    .first()
    .evaluate((c) => {
      const a = c.getContext("2d").getImageData(0, 0, 200, 200).data;
      return a.some((n, i) => i % 4 === 3 && n > 0);
    });
  assert.equal(nonblank, true);
  await page.evaluate(() => {
    window.__stampClips = 0;
    const rect = CanvasRenderingContext2D.prototype.rect;
    CanvasRenderingContext2D.prototype.rect = function (x, y, w, h) {
      if (w === 200 && h === 200) window.__stampClips++;
      return rect.call(this, x, y, w, h);
    };
  });
  await openDock(page, "Files");
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  const pdfLink = page.getByRole("link", { name: "Download PDF", exact: true });
  await pdfLink.waitFor({ timeout: 60000 });
  const downloading = page.waitForEvent("download");
  await pdfLink.click();
  const pdf = await readFile(await (await downloading).path());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(await page.evaluate(() => window.__stampClips >= 2));
  const closeFiles = page.getByRole("button", {
    name: "Close Files",
    exact: true,
  });
  if (await closeFiles.isVisible()) await closeFiles.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openDock(page, "Stamps");
  await page.getByRole("button", { name: "Create stamp", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Create stamp",
    exact: true,
  });
  assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "Stamp browser checks passed: drawing, placement, move, delete, undo/redo, removal, reload, PDF and mobile editor layout.",
  );
} finally {
  await browser.close();
}
