import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.locator(".book").waitFor();
  if (
    await page
      .getByRole("button", { name: "Back to my planner", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Back to my planner", exact: true })
      .click();
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => {
      const r = document.querySelector(".book").getBoundingClientRect();
      const p = document.querySelector(".page").getBoundingClientRect();
      const doc = document.documentElement;
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        pw: p.width,
        ph: p.height,
        sw: doc.scrollWidth,
        sh: doc.scrollHeight,
      };
    });
    console.log(width, height, layout);
    assert.ok(
      layout.x >= 0 &&
        layout.y >= 0 &&
        layout.x + layout.w <= width &&
        layout.y + layout.h <= height + 1,
      "book within viewport",
    );
    assert.ok(
      Math.abs(layout.pw / layout.ph - 0.75) < 0.005,
      "paper aspect ratio",
    );
    assert.ok(layout.sw <= width && layout.sh <= height, "no document scroll");
    if (width === 1440)
      assert.ok(layout.h > height * 0.9, "spread uses available height");
    await page.screenshot({
      path: `test-results/docks-${width}x${height}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Navigate", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Navigate", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByLabel("Insert title", { exact: true }).fill("Dock test");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  assert.equal(
    await page.getByRole("dialog", { name: "Pages", exact: true }).isVisible(),
    false,
  );
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .waitFor();
  await page.screenshot({ path: "test-results/docks-files.png" });
  await page.mouse.click(600, 20);
  assert.equal(
    await page.getByRole("dialog", { name: "Files", exact: true }).isVisible(),
    false,
  );
  await page
    .getByRole("button", { name: "Tool settings", exact: true })
    .click();
  await page.getByRole("slider").fill("4");
  await page
    .getByRole("button", { name: "Finger writing", exact: true })
    .click();
  await page.screenshot({ path: "test-results/docks-settings.png" });
  await page.keyboard.press("Escape");
  const r = await page.locator(".page-0 .ink").last().boundingBox();
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5, {
    steps: 12,
  });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Undo", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isEnabled(),
    true,
  );
  await page.getByRole("button", { name: "Next spread", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page
    .getByRole("button", { name: "Previous spread", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
  assert.deepEqual(errors, []);
  console.log(
    "Dock layout, popovers, keyboard focus, writing and page turns passed",
  );
} finally {
  await browser.close();
}
