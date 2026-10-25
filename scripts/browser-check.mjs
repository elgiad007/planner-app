import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (dialog) => dialog.accept());
try {
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:4173/");
  await second.getByRole("alert").filter({ hasText: "already open" }).waitFor();
  await second.close();
  const ink = page.locator("canvas").first(),
    rect = await ink.boundingBox();
  await page.mouse.move(rect.x + 100, rect.y + 130);
  await page.mouse.down();
  assert.equal(
    await page.getByRole("button", { name: "Next spread" }).isDisabled(),
    true,
  );
  await page.mouse.move(rect.x + 160, rect.y + 180, { steps: 12 });
  await page.mouse.up();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved on this iPad" })
    .waitFor();
  async function backup() {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup" }).click();
    return JSON.parse(await readFile(await (await event).path(), "utf8"));
  }
  const written = await backup();
  assert.equal(written.pages[0].strokes.length, 1);
  assert.ok(written.pages[0].strokes[0].points.length > 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await backup()).pages[0].strokes.length, 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal((await backup()).pages[0].strokes.length, 1);
  await page.reload();
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  assert.deepEqual((await backup()).pages, written.pages);
  // Simulate a disk/quota failure and prove in-memory ink can be recovered by retry.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = original;
      throw new DOMException("Simulated storage full", "QuotaExceededError");
    };
  });
  await page.mouse.move(rect.x + 200, rect.y + 230);
  await page.mouse.down();
  await page.mouse.move(rect.x + 230, rect.y + 250, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("alert").filter({ hasText: "Could not save" }).waitFor();
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved on this iPad" })
    .waitFor();
  assert.equal((await backup()).pages[0].strokes.length, 2);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.mouse.click(rect.x + 215, rect.y + 240);
  assert.deepEqual((await backup()).pages, written.pages);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  // Touch pointers must not become ink.
  await ink.dispatchEvent("pointerdown", {
    pointerId: 42,
    pointerType: "touch",
    clientX: rect.x + 30,
    clientY: rect.y + 100,
    button: 0,
  });
  await ink.dispatchEvent("pointerup", {
    pointerId: 42,
    pointerType: "touch",
    clientX: rect.x + 40,
    clientY: rect.y + 110,
    button: 0,
  });
  assert.equal((await backup()).pages[0].strokes.length, 1);
  await page.getByRole("button", { name: "Browse dates", exact: true }).click();
  await page
    .getByRole("button", { name: "Open week of 2027-01-01", exact: true })
    .click();
  await page.getByRole("heading", { name: "Dec 27 — Jan 2" }).first().waitFor();
  await page.getByRole("button", { name: "Feb", exact: true }).click();
  await page.getByRole("heading", { name: "February 2027" }).first().waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "February 2027" }).first().waitFor();
  const saved = await backup();
  await page.locator("input[type=file]").setInputFiles({
    name: "planner.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(written)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Backup restored and saved" })
    .waitFor();
  assert.deepEqual((await backup()).pages, written.pages);
  // Reject a malformed import without replacing current content.
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "not a supported planner backup" })
    .waitFor();
  assert.deepEqual((await backup()).pages, written.pages);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  assert.deepEqual((await backup()).pages, written.pages);
  await page.screenshot({
    path: "test-results/planner-landscape.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.screenshot({
    path: "test-results/planner-week.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: "test-results/planner-small-landscape.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: drawing, touch exclusion, undo/redo, persistence, dates, restore validation, offline reload.",
  );
  console.log(
    `Saved ${saved.pages.length} page record(s); screenshots in test-results/.`,
  );
} finally {
  await browser.close();
}
