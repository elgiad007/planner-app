import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { openDock, downloadBackup } from "./dock-helpers.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1024 },
  });
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4180/");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await openDock(page, "Tool settings");
  await page
    .getByRole("spinbutton", { name: "Default text font size", exact: true })
    .fill("36");
  await page
    .getByRole("button", { name: "Close Tool settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Ink #557961", exact: true }).click();
  const data = await downloadBackup(page);
  assert.equal(data.settings.preferences.textFontSize, 36);
  assert.equal(data.settings.preferences.tool, "text");
  assert.equal(data.settings.preferences.inkColor, "#557961");
  await page.reload();
  await page.getByRole("button", { name: "Text", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Text", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page
    .locator(".text-layer")
    .first()
    .click({ position: { x: 100, y: 200 } });
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Font size", exact: true })
      .inputValue(),
    "36",
  );
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Box width", exact: true })
      .inputValue(),
    "220",
  );
  console.log(
    "Preferences browser check passed: backup, reload, new text font size, unchanged box width.",
  );
} finally {
  await browser.close();
}
