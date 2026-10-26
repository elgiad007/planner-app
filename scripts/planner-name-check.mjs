import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDock } from "./dock-helpers.mjs";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
  ],
  { windowsHide: true, stdio: "ignore" },
);
await new Promise((resolve) => setTimeout(resolve, 2000));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1366, height: 900 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4175/");
  await page.locator(".book").waitFor();
  const help = page.getByRole("button", {
    name: "Back to my planner",
    exact: true,
  });
  if (await help.isVisible()) await help.click();
  page.once("dialog", (d) => {
    assert.equal(d.defaultValue(), "My Pastel Planner");
    return d.accept("Work Planner");
  });
  await page
    .getByRole("button", { name: "Edit planner name", exact: true })
    .click();
  await page.waitForFunction(() => document.title === "Work Planner");
  await page
    .getByRole("status")
    .filter({ hasText: "Changes saved on this device" })
    .waitFor();
  await page.reload();
  await page.locator(".book").waitFor();
  assert.equal(await page.title(), "Work Planner");
  assert.deepEqual(
    await page.locator(".book .planner-page-title").allTextContents(),
    ["Work Planner", "Work Planner"],
  );
  await page.screenshot({ path: "test-results/custom-month-title.png" });
  await openDock(page, "Files");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save planner…", exact: true })
    .click();
  const download = await downloading;
  assert.ok(download.suggestedFilename().startsWith("Work Planner-"));
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(data.settings.plannerName, "Work Planner");
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    return d.accept();
  });
  data.settings.plannerName = "Personal Planner";
  await page.locator("input[type=file]").setInputFiles({
    name: "personal.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.waitForFunction(() => document.title === "Personal Planner");
  assert.ok(
    dialogs[0].includes("Personal Planner") &&
      dialogs[0].includes("Work Planner"),
  );
  assert.deepEqual(
    await page.locator(".book .planner-page-title").allTextContents(),
    ["Personal Planner", "Personal Planner"],
  );
  // Verify the isolated PDF renderer receives the same name as the live pages.
  await page.evaluate(() => {
    window.pdfPlannerNames = [];
    window.pdfObserver = new MutationObserver(() => {
      const names = [
        ...document.querySelectorAll(".pdf-paper .planner-page-title"),
      ].map((el) => el.textContent);
      window.pdfPlannerNames.push(...names);
    });
    window.pdfObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await page.getByRole("link", { name: "Download PDF", exact: true }).waitFor();
  assert.ok(
    await page.evaluate(() =>
      window.pdfPlannerNames.includes("Personal Planner"),
    ),
  );
  await page.evaluate(() => window.pdfObserver.disconnect());
  delete data.settings.plannerName;
  await page.locator("input[type=file]").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.waitForFunction(() => document.title === "My Pastel Planner");
  await page.getByRole("button", { name: "Close Files", exact: true }).click();
  for (const [w, h] of [
    [1366, 900],
    [390, 844],
    [320, 700],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    const title = await page.locator(".planner-identity").boundingBox();
    assert.ok(title.x >= 0 && title.x + title.width <= w);
    const date = await page.locator(".spread-navigation > span").boundingBox();
    assert.ok(
      date.x >= title.x + title.width || date.x + date.width <= title.x,
      "Date must not overlap planner identity",
    );
    assert.equal(
      await page
        .locator(".workspace")
        .evaluate((el) => getComputedStyle(el).top),
      "0px",
    );
    await page.screenshot({ path: `test-results/planner-title-${w}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: rename, reload, named download, safe switching, legacy files, desktop/mobile layout",
  );
} finally {
  await browser.close();
  server.kill();
}
