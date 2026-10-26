import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { openDock } from "./dock-helpers.mjs";

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4179",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  await page.addInitScript(() => {
    window.saveMode = "cancel";
    window.showSaveFilePicker = async (options) => {
      window.pickerActivated = navigator.userActivation.isActive;
      window.saveOptions = options;
      if (window.saveMode === "cancel")
        throw new DOMException("Cancelled", "AbortError");
      return {
        createWritable: async () => ({
          write: async (blob) => {
            window.savedPlanner = JSON.parse(await blob.text());
          },
          close: async () => {
            window.fileClosed = true;
          },
        }),
      };
    };
  });
  await page.goto("http://127.0.0.1:4179/");
  await page.locator(".book").waitFor();
  const help = page.getByRole("button", {
    name: "Back to my planner",
    exact: true,
  });
  if (await help.isVisible()) await help.click();
  await openDock(page, "Files");
  const save = page.getByRole("button", { name: "Save planner…", exact: true });
  const before = await page.getByRole("status").allTextContents();
  await save.click();
  await page.waitForFunction(() => window.pickerActivated === true);
  await save.waitFor({ state: "visible" });
  assert.deepEqual(await page.getByRole("status").allTextContents(), before);
  assert.equal(
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("my-pastel-planner", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = db
            .transaction("settings")
            .objectStore("settings")
            .get("main");
          request.onsuccess = () => resolve(request.result?.lastBackup);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    }),
    undefined,
  );
  await page.evaluate(() => {
    window.saveMode = "save";
  });
  await save.click();
  await page
    .getByRole("status")
    .filter({ hasText: "Planner file saved to your chosen location" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.fileClosed), true);
  assert.equal(
    await page.evaluate(() => window.savedPlanner.format),
    "my-pastel-planner",
  );
  assert.match(
    await page.evaluate(() => window.saveOptions.suggestedName),
    /\.json$/,
  );
  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
  });
  const downloading = page.waitForEvent("download");
  await save.click();
  assert.match((await downloading).suggestedFilename(), /\.json$/);
  console.log(
    "PASS: user activation, cancellation, file writing, and download fallback",
  );
} finally {
  await browser?.close();
  server.kill();
}
