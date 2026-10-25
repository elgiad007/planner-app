import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const url = process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/";
try {
  await page.goto(url);
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const stroke = (id, tool, color, y) => ({
    id,
    tool,
    color,
    width: tool === "highlighter" ? 24 : 5,
    points: Array.from({ length: 80 }, (_, i) => ({
      x: 100 + i * 4,
      y: y + Math.sin(i / 8) * 15,
      pressure: 0.2 + i / 100,
    })),
  });
  const view = { mode: "month", date: "2027-01-01" };
  const data = {
    format: "my-pastel-planner",
    schemaVersion: 2,
    layoutVersion: 1,
    appVersion: "0.4.0",
    exportedAt: new Date().toISOString(),
    settings: { view, order: [view], inserts: [], bookmarks: [] },
    pages: [
      {
        id: "month:2027-01-01:left",
        strokes: [
          stroke("pen", "pen", "#4b4659", 250),
          stroke("pencil", "pencil", "#6c628d", 350),
          stroke("highlight", "highlighter", "#ffff00", 250),
        ],
      },
      {
        id: "month:2027-01-01:right",
        strokes: [stroke("right", "pen", "#986077", 450)],
      },
    ],
  };
  // A sizeable device-local fixture: 250 inserts, 200,000 points, all templates.
  const papers = ["blank", "lined", "dot-grid", "checklist", "sketchbook"];
  for (let i = 0; i < 250; i++) {
    const v = { ...view, insert: `load-${i}` };
    data.settings.order.push(v);
    data.settings.inserts.push({
      id: v.insert,
      title: `Notes ${i}`,
      template: papers[i % 5],
    });
    for (const side of ["left", "right"])
      data.pages.push({
        id: `custom:${v.insert}:${side}`,
        strokes: Array.from({ length: 5 }, (_, j) =>
          stroke(
            `ink-${j}`,
            j === 0 ? "highlighter" : "pen",
            j === 0 ? "#ffff00" : "#4b4659",
            200 + j * 80,
          ),
        ),
      });
  }
  async function restore(value) {
    await page.locator("input[type=file]").setInputFiles({
      name: "planner.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "Backup restored and saved" })
      .waitFor();
  }
  const start = performance.now();
  await restore(data);
  await page.reload();
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  console.log(
    `Large planner restore + reload: ${Math.round(performance.now() - start)} ms`,
  );
  await context.setOffline(true);
  await page.evaluate(() => {
    window.pdfInkPixels = [];
    window.pdfTemplatePixels = [];
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (this.width === 1200 && this.height === 1600) {
        window.pdfInkPixels.push(
          Array.from(this.getContext("2d").getImageData(200, 516, 1, 1).data),
        );
        const ctx = this.getContext("2d");
        function count(y, height, color) {
          const bytes = ctx.getImageData(0, y, 1200, height).data;
          let found = 0;
          for (let i = 0; i < bytes.length; i += 4)
            if (color.every((v, n) => Math.abs(bytes[i + n] - v) < 3)) found++;
          return found;
        }
        window.pdfTemplatePixels.push({
          title: count(0, 240, [148, 123, 159]),
          footer: count(1520, 80, [166, 154, 155]),
        });
      }
      return original.apply(this, args);
    };
  });
  // Lazy PDF dependencies must already be in the offline precache.
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  async function pdf(name) {
    await page.getByRole("button", { name: "Create PDF", exact: true }).click();
    const link = page.getByRole("link", { name: "Download PDF", exact: true });
    await link.waitFor({ timeout: 60000 });
    const downloading = page.waitForEvent("download");
    await link.click();
    const bytes = await readFile(await (await downloading).path());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bytes.length > 30000);
    await writeFile(`test-results/${name}.pdf`, bytes);
    return bytes;
  }
  await pdf("phase4-month");
  const pixel = await page.evaluate(() => window.pdfInkPixels[0]);
  assert.ok(
    pixel[1] - pixel[2] > 30,
    `Missing highlighter over ink in exported canvas: ${pixel}`,
  );
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await pdf("phase4-week");
  await page
    .getByRole("button", { name: "Pages & bookmarks", exact: true })
    .click();
  await page
    .getByLabel("Open spread", { exact: true })
    .selectOption("custom:load-2");
  await pdf("phase4-dots");
  await page
    .getByLabel("Open spread", { exact: true })
    .selectOption("custom:load-3");
  await pdf("phase4-checklist");
  const templatePixels = await page.evaluate(() => window.pdfTemplatePixels);
  assert.ok(
    templatePixels.every((p) => p.title > 20 && p.footer > 3),
    `Missing styled template header/footer: ${JSON.stringify(templatePixels)}`,
  );
  // Entire binder generation is cancellable and releases the writing lock.
  await page
    .getByRole("combobox", { name: "PDF pages" })
    .selectOption("binder");
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await page.getByRole("button", { name: "Cancel PDF" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "PDF export cancelled" })
    .waitFor();
  assert.equal(await page.locator(".pdf-paper").count(), 0);
  // Reload has the same content; PDF work must not modify persisted ink.
  await page.reload();
  await page
    .getByRole("heading", { name: "Notes 3", exact: true })
    .first()
    .waitFor();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const backedUp = JSON.parse(
    await readFile(await (await event).path(), "utf8"),
  );
  assert.deepEqual(
    backedUp.pages.sort((a, b) => a.id.localeCompare(b.id)),
    data.pages.sort((a, b) => a.id.localeCompare(b.id)),
  );
  // Unsupported local versions must expose recovery without touching records.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("my-pastel-planner", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite");
      const store = tx.objectStore("settings"),
        request = store.get("main");
      request.onsuccess = () =>
        store.put({ ...request.result, dataSchemaVersion: 99 }, "main");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "different app version" })
    .waitFor();
  const recoveryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recovery data" }).click();
  const recovery = JSON.parse(
    await readFile(await (await recoveryDownload).path(), "utf8"),
  );
  assert.equal(recovery.settings.dataSchemaVersion, 99);
  assert.deepEqual(
    recovery.pages.sort((a, b) => a.id.localeCompare(b.id)),
    data.pages,
  );
  const small = {
    ...data,
    pages: data.pages.filter((p) => p.id.startsWith("month:")),
    settings: { view },
  };
  await page.getByLabel("Recovery backup").setInputFiles({
    name: "good.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(small)),
  });
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await page
    .getByRole("combobox", { name: "PDF pages" })
    .selectOption("binder");
  const binderStart = performance.now();
  const binder = await pdf("phase4-binder");
  assert.equal(
    (binder.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
    65,
  );
  console.log(
    `Entire 2027 binder PDF: ${Math.round(performance.now() - binderStart)} ms, ${binder.length} bytes, 65 sheets`,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  await page.screenshot({
    path: "test-results/phase4-desktop.png",
    fullPage: true,
  });
  console.log(
    "Phase 4 browser checks passed: large restore/reload, offline PDF templates/ink, cancel and unchanged editable content.",
  );
} finally {
  await browser.close();
}
