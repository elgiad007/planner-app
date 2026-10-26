import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { openDock } from "./dock-helpers.mjs";

// Run against a production preview. An optional label preserves before/after PDFs.
const label = process.argv[2] ?? "optimized";
assert.match(label, /^[a-z0-9-]+$/);
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const data = {
    format: "my-pastel-planner",
    schemaVersion: 2,
    layoutVersion: 1,
    appVersion: "0.4.5",
    exportedAt: new Date().toISOString(),
    settings: { view: { mode: "month", date: "2027-01-01" } },
    pages: [
      {
        id: "month:2027-01-01:left",
        strokes: [
          {
            id: "pdf-ink",
            tool: "highlighter",
            color: "#ffff00",
            width: 24,
            points: [
              { x: 100, y: 250, pressure: 0.5 },
              { x: 400, y: 250, pressure: 0.5 },
            ],
          },
        ],
      },
    ],
  };
  await page.locator("input[type=file]").setInputFiles({
    name: "pdf-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Planner opened · changes saved on this device" })
    .waitFor();
  async function savedPages() {
    return page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("my-pastel-planner", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction("pages").objectStore("pages").getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    });
  }
  const originalPages = await savedPages();
  await context.setOffline(true);
  await openDock(page, "Files");
  await page
    .getByRole("combobox", { name: "PDF pages" })
    .selectOption("binder");
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await page.getByRole("button", { name: "Cancel PDF", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "PDF export cancelled" })
    .waitFor();
  assert.equal(await page.locator(".pdf-paper").count(), 0);
  const start = performance.now();
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  const link = page.getByRole("link", { name: "Download PDF", exact: true });
  await link.waitFor({ timeout: 120000 });
  const elapsed = Math.round(performance.now() - start);
  assert.equal(await page.locator(".pdf-paper").count(), 0);
  const downloading = page.waitForEvent("download");
  await link.click();
  const bytes = await readFile(await (await downloading).path());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(
    (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
    65,
  );
  await writeFile(`test-results/pdf-${label}.pdf`, bytes);
  assert.deepEqual(await savedPages(), originalPages);
  // Optional baseline path: compare embedded JPEGs rather than PDF timestamps/IDs.
  if (process.argv[3]) {
    const images = (buffer) =>
      [
        ...buffer
          .toString("latin1")
          .matchAll(/stream\r?\n(\xff\xd8[\s\S]*?)\r?\nendstream/g),
      ].map((match) => Buffer.from(match[1], "latin1"));
    const expected = images(await readFile(process.argv[3]));
    assert.equal(expected.length, 130);
    assert.deepEqual(images(bytes), expected);
    console.log("All 130 page JPEGs match the baseline byte for byte.");
  }
  assert.deepEqual(errors, []);
  console.log(
    `Full binder (${label}): ${elapsed} ms, ${bytes.length} bytes, 65 spreads; offline export and cancellation passed.`,
  );
} finally {
  await browser.close();
}
