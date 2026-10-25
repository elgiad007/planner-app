import { downloadBackup } from "./dock-helpers.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  // Supply a waiting worker without depending on two deployed releases.
  await context.addInitScript(() => {
    window.activations = 0;
    navigator.serviceWorker.register = async () => ({
      waiting: {
        postMessage(message) {
          if (message === "ACTIVATE") window.activations++;
        },
      },
      addEventListener() {},
    });
  });
  const page = await context.newPage();
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  const button = page.getByRole("button", { name: "Back up and update" });
  await button.waitFor();
  const canvas = page.locator("canvas").first();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + 100, rect.y + 130);
  await page.mouse.down();
  await page.mouse.move(rect.x + 160, rect.y + 180, { steps: 5 });
  await page.mouse.up();

  async function attempt(accept) {
    const downloaded = page.waitForEvent("download");
    page.once("dialog", (dialog) => {
      assert.match(dialog.message(), /Has the backup been saved/);
      return accept ? dialog.accept() : dialog.dismiss();
    });
    await button.click();
    return JSON.parse(await readFile(await (await downloaded).path(), "utf8"));
  }
  const backup = await attempt(false);
  assert.equal(backup.pages[0].strokes.length, 1);
  assert.equal(await page.evaluate(() => window.activations), 0);
  await page.getByRole("status").filter({ hasText: "Update paused" }).waitFor();
  const confirmed = await attempt(true);
  assert.deepEqual(confirmed.pages, backup.pages);
  assert.equal(await page.evaluate(() => window.activations), 1);

  // The downloaded update backup can be restored through the normal importer.
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "update-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Backup restored and saved" })
    .waitFor();
  const restored = await downloadBackup(page);
  assert.deepEqual(restored.pages, backup.pages);

  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw Error("Backup preparation failed");
    };
  });
  await button.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Backup preparation failed" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.activations), 1);
  console.log(
    "Update checks passed: backup contents, cancel, confirmation, restore, and backup failure preventing activation.",
  );
} finally {
  await browser.close();
}
