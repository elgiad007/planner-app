import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { openDock } from "./dock-helpers.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.locator(".book").waitFor();
  const helpClose = page.getByRole("button", {
    name: "Back to my planner",
    exact: true,
  });
  if (await helpClose.isVisible()) await helpClose.click();
  const press = async (key) => {
    await page.locator(".zoom-viewport").focus();
    await page.keyboard.press(key);
  };
  await press("k");
  const notice = page.locator(".bookmark-notice");
  await page
    .getByRole("status")
    .filter({ hasText: "Bookmark added" })
    .waitFor();
  await page
    .getByRole("button", { name: "Dismiss bookmark notification" })
    .click();
  assert.equal(await notice.count(), 0, "notification can be dismissed");
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  const removeBookmark = page.getByRole("button", {
    name: "Remove bookmark",
    exact: true,
  });
  await removeBookmark.waitFor();
  await page
    .locator(".zoom-viewport")
    .dispatchEvent("keydown", { key: "k", repeat: true });
  assert.equal(
    await removeBookmark.isVisible(),
    true,
    "held K does not toggle again",
  );
  await page.keyboard.press("Escape");
  await press("g");
  await page.keyboard.press("k");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(
    await removeBookmark.isVisible(),
    true,
    "typing K does not toggle bookmarks",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator(".book").waitFor();
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await removeBookmark.waitFor();
  await page.keyboard.press("Escape");
  await press("k");
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await page
    .getByRole("button", { name: "Add bookmark", exact: true })
    .waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: "Bookmark removed" })
    .waitFor();
  await page
    .getByRole("button", { name: "Dismiss bookmark notification" })
    .click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await openDock(page, "Bookmarks");
  await page.getByRole("button", { name: "Add bookmark", exact: true }).click();
  await notice
    .getByRole("status")
    .filter({ hasText: "Bookmark added" })
    .waitFor();
  await page.clock.runFor(2999);
  assert.equal(
    await notice.isVisible(),
    true,
    "notification lasts three seconds",
  );
  await page.clock.runFor(1);
  assert.equal(
    await notice.count(),
    0,
    "notification expires after three seconds",
  );
  await removeBookmark.click();
  await notice
    .getByRole("status")
    .filter({ hasText: "Bookmark removed" })
    .waitFor();
  await page.clock.runFor(2000);
  await page.getByRole("button", { name: "Add bookmark", exact: true }).click();
  await notice
    .getByRole("status")
    .filter({ hasText: "Bookmark added" })
    .waitFor();
  await page.clock.runFor(1000);
  assert.equal(
    await notice.isVisible(),
    true,
    "new actions reset the notification timeout",
  );
  await page.clock.runFor(2000);
  assert.equal(await notice.count(), 0);
  await page
    .getByLabel("Saved bookmarks", { exact: true })
    .getByRole("button", { name: /^Remove bookmark for / })
    .click();
  await notice
    .getByRole("status")
    .filter({ hasText: "Bookmark removed" })
    .waitFor();
  await page
    .getByRole("button", { name: "Dismiss bookmark notification" })
    .click();
  assert.equal(await notice.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Bookmark shortcuts, notifications, three-second timeout, timer reset and dismissal passed",
  );
} finally {
  await browser.close();
}
