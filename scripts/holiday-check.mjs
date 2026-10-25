import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { openDock, downloadBackup } from "./dock-helpers.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1024 },
  });
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4175");
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  assert.ok(
    await page
      .locator(".holiday-label")
      .filter({ hasText: "New Year's Day" })
      .count(),
  );
  await openDock(page, "Navigate");
  await page.getByLabel("Show holidays").uncheck();
  assert.equal(await page.locator(".holiday-label").count(), 0);
  assert.equal((await downloadBackup(page)).settings.showHolidays, false);
  await page.reload();
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  assert.equal(await page.locator(".holiday-label").count(), 0);
  await openDock(page, "Navigate");
  await page.getByLabel("Show holidays").check();
  await page.getByLabel("Jump to date").fill("2027-12-24");
  await page
    .getByRole("button", { name: "Close Navigate", exact: true })
    .click();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/holidays-month.png" });
  await openDock(page, "Navigate");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page
    .getByRole("button", { name: "Close Navigate", exact: true })
    .click();
  assert.ok(
    await page
      .locator(".weekly-day .holiday-label")
      .filter({ hasText: "Christmas Eve" })
      .count(),
  );
  await page.screenshot({ path: "test-results/holidays-week.png" });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: "test-results/holidays-tablet.png" });
  const backup = await downloadBackup(page);
  const pdfResults = await page.evaluate(async (data) => {
    const { createPdf } = await import("/src/pdf.tsx");
    const results = [];
    for (const visible of [true, false]) {
      let sawHoliday = false;
      const observer = new MutationObserver(() => {
        if (
          Array.from(
            document.querySelectorAll(".pdf-paper .holiday-label"),
          ).some((node) => node.textContent)
        )
          sawHoliday = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const blob = await createPdf(
        { ...data, settings: { ...data.settings, showHolidays: visible } },
        "current",
        new AbortController().signal,
        () => {},
      );
      observer.disconnect();
      results.push({ sawHoliday, size: blob.size });
    }
    return results;
  }, backup);
  assert.equal(pdfResults[0].sawHoliday, true);
  assert.equal(pdfResults[1].sawHoliday, false);
  assert.ok(pdfResults.every((result) => result.size > 1000));
  console.log(
    "Holiday browser checks passed: month/week labels, toggle, reload, backup, PDF visibility, desktop/tablet screenshots.",
  );
} finally {
  await browser.close();
}
