import { downloadBackup, openDock } from "./dock-helpers.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
  acceptDownloads: true,
});
await context.addInitScript(() => {
  const request = window.requestAnimationFrame.bind(window),
    cancel = window.cancelAnimationFrame.bind(window);
  window.pendingFrames = new Set();
  window.requestAnimationFrame = (callback) => {
    const id = request((time) => {
      window.pendingFrames.delete(id);
      callback(time);
    });
    window.pendingFrames.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    window.pendingFrames.delete(id);
    cancel(id);
  };
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const next = () =>
  page.getByRole("button", { name: "Next spread", exact: true });
const previous = () =>
  page.getByRole("button", { name: "Previous spread", exact: true });
async function settled() {
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
}
async function watchLayout() {
  await page.evaluate(() => {
    const measure = () => {
      const doc = document.documentElement;
      const book = document.querySelector(".book").getBoundingClientRect();
      const rings = document.querySelector(".rings").getBoundingClientRect();
      return [
        doc.clientWidth,
        doc.scrollWidth,
        doc.scrollHeight,
        book.x,
        book.y,
        book.width,
        rings.x,
        scrollX,
        scrollY,
      ];
    };
    window.turnLayout = { baseline: measure(), samples: [], done: false };
    let seen = false;
    const deadline = performance.now() + 3000;
    const sample = () => {
      const active = !!document.querySelector(".page-turn");
      seen ||= active;
      window.turnLayout.samples.push(measure());
      if ((seen && !active) || performance.now() > deadline) {
        window.turnLayout.done = true;
      } else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
async function assertStableLayout() {
  await page.waitForFunction(() => window.turnLayout.done);
  const { baseline, samples } = await page.evaluate(() => window.turnLayout);
  assert.ok(samples.length > 2, "Sample multiple animation frames");
  for (const sample of samples)
    assert.deepEqual(
      sample,
      baseline,
      "Page turns must preserve document size, binder/ring position and scroll offset",
    );
}
async function backup() {
  const data = await downloadBackup(page);
  return data;
}
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await next().waitFor();
  const ink = page.locator(".book > .page canvas").first();
  const r = await ink.boundingBox();
  await page.mouse.move(r.x + 100, r.y + 100);
  await page.mouse.down();
  await page.mouse.move(r.x + 170, r.y + 160, { steps: 10 });
  assert.equal(await next().isDisabled(), true);
  await page.mouse.up();
  const original = await backup();
  const pixels = await ink.evaluate((canvas) => canvas.toDataURL());
  await watchLayout();
  await next().click();
  await page.locator(".page-turn").waitFor();
  assert.equal(await next().isDisabled(), true);
  assert.equal(
    await page
      .locator(".page-turn canvas")
      .first()
      .evaluate((c) => c.toDataURL()),
    pixels,
  );
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".page-turn").count(), 1);
  const screenshotSession = await context.newCDPSession(page);
  const { data } = await screenshotSession.send("Page.captureScreenshot");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    "test-results/page-turn-mid.png",
    Buffer.from(data, "base64"),
  );
  await settled();
  await assertStableLayout();
  await page.getByRole("heading", { name: "February 2027" }).first().waitFor();
  await watchLayout();
  await previous().click();
  await settled();
  await assertStableLayout();
  assert.equal(await ink.evaluate((canvas) => canvas.toDataURL()), pixels);
  assert.deepEqual((await backup()).pages, original.pages);
  // Real touch events exercise browser dispatch and the native pointer pathway.
  const cdp = await context.newCDPSession(page);
  async function touch(type, points) {
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([x, y, id = 1]) => ({ x, y, id })),
    });
  }
  async function swipe() {
    const y = r.y + r.height / 2;
    await touch("touchStart", [[r.x + 260, y]]);
    await touch("touchMove", [[r.x + 190, y]]);
    await touch("touchMove", [[r.x + 110, y]]);
    await touch("touchEnd", []);
  }
  await swipe();
  await settled();
  await page.getByRole("heading", { name: "February 2027" }).first().waitFor();
  // Outer left edge returns one spread.
  await touch("touchStart", [[r.x + 8, r.y + 220]]);
  await touch("touchEnd", []);
  await settled();
  await page.getByRole("heading", { name: "January 2027" }).first().waitFor();
  await openDock(page, "Tool settings");
  await page
    .getByRole("button", { name: "Finger writing", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await swipe();
  assert.equal(await page.locator(".page-turn").count(), 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await openDock(page, "Tool settings");
  await page
    .getByRole("button", { name: "Finger writing", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(750);
  // Multitouch must never navigate.
  await touch("touchStart", [[r.x + 260, r.y + 250]]);
  await touch("touchStart", [
    [r.x + 260, r.y + 250],
    [r.x + 300, r.y + 300, 2],
  ]);
  await touch("touchMove", [
    [r.x + 90, r.y + 250],
    [r.x + 120, r.y + 300, 2],
  ]);
  await touch("touchEnd", []);
  assert.equal(await page.locator(".page-turn").count(), 0);
  await page.getByRole("button", { name: "Feb", exact: true }).click();
  assert.equal(await page.locator(".page-turn").count(), 0);
  for (let i = 0; i < 5; i++) {
    await next().click();
    await settled();
    await previous().click();
    await settled();
  }
  await page.setViewportSize({ width: 1024, height: 1366 });
  await watchLayout();
  await next().click();
  await settled();
  await assertStableLayout();
  await page.screenshot({
    path: "test-results/page-turn-portrait.png",
    fullPage: true,
  });
  await page.waitForFunction(() => window.pendingFrames.size === 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await previous().click();
  assert.equal(await page.locator(".page-turn").count(), 0);
  assert.deepEqual((await backup()).pages, original.pages);
  await page.reload();
  await next().waitFor();
  assert.deepEqual((await backup()).pages, original.pages);
  assert.deepEqual(errors, []);
  console.log(
    "Page turns passed: stable document/binder layout, canvas copies, ink preservation, swipe/edge input, multitouch rejection, instant tabs, repeated turns, portrait, reduced motion, reload, animation cleanup.",
  );
} finally {
  await browser.close();
}
