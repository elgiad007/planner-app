import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { openDock, downloadBackup } from "./dock-helpers.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.locator(".book").waitFor();
  const close = page.getByRole("button", {
    name: "Back to my planner",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  const button = (name) => page.getByRole("button", { name, exact: true });
  await openDock(page, "Bookmarks");
  await button("Add bookmark").click();
  const rename = page
    .getByRole("button", { name: /^Rename bookmark / })
    .first();
  await rename.waitFor();
  assert.equal(await rename.getAttribute("title"), "Rename");
  await rename.click();
  const input = page.getByRole("textbox", { name: "Bookmark name" });
  await input.fill("École & Plans (2027)");
  await button("Save").click();
  await expect(input).toHaveCount(0);
  const first = await downloadBackup(page);
  assert.equal(
    Object.values(first.settings.bookmarkNames)[0],
    "École & Plans (2027)",
  );
  await page.keyboard.press("Escape");
  await button("Next spread").click();
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
  await openDock(page, "Bookmarks");
  await button("Add bookmark").click();
  await expect(page.locator(".bookmark-row")).toHaveCount(2);
  await page
    .getByRole("button", { name: /^Rename bookmark / })
    .last()
    .click();
  for (const [name, message] of [
    [" école   & plans (2027) ", "already exists"],
    ["Bad!", "Use letters"],
    [" ", "1–60"],
    ["x".repeat(61), "1–60"],
  ]) {
    await input.fill(name);
    await button("Save").click();
    await expect(page.getByRole("alert")).toContainText(message);
  }
  await button("Cancel").click();
  await page
    .getByRole("button", { name: /^Rename bookmark / })
    .last()
    .click();
  await input.fill("Weekly focus: work");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await page.reload();
  await page.locator(".book").waitFor();
  await openDock(page, "Bookmarks");
  await expect(
    page.getByRole("button", {
      name: "Rename bookmark Weekly focus: work",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", {
      name: "Rename bookmark Weekly focus: work",
      exact: true,
    })
    .click();
  const rect = await input.boundingBox();
  assert.ok(rect.x >= 0 && rect.x + rect.width <= 390);
  await button("Cancel").click();
  await page
    .getByRole("button", {
      name: "Remove bookmark for Weekly focus: work",
      exact: true,
    })
    .click();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);
  const after = await downloadBackup(page);
  assert.deepEqual(Object.values(after.settings.bookmarkNames), [
    "École & Plans (2027)",
  ]);
  assert.deepEqual(errors, []);
  console.log(
    "Bookmark rename, validation, persistence, backup, cleanup and mobile checks passed",
  );
} finally {
  await browser.close();
}
