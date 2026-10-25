import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  const ink = page.locator("canvas").first();
  await ink.waitFor();
  const rect = await ink.boundingBox();
  const next = page.getByRole("button", { name: "Next spread" });
  const heading = page.locator(".page .template h1").first();
  assert.equal(
    await page
      .locator(".book")
      .evaluate((root) =>
        [root, ...root.querySelectorAll("*")].every(
          (el) => getComputedStyle(el).userSelect === "none",
        ),
      ),
    true,
  );
  for (const type of ["selectstart", "contextmenu", "dblclick", "touchstart"]) {
    assert.equal(
      await heading.evaluate((el, type) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        el.dispatchEvent(e);
        return e.defaultPrevented;
      }, type),
      true,
      `${type} must be suppressed on paper in pen mode`,
    );
  }
  // Even a selection injected programmatically must be removed from the paper.
  assert.equal(
    await heading.evaluate((el) => {
      const e = new Event("selectstart", { bubbles: true, cancelable: true });
      el.firstChild.dispatchEvent(e);
      return e.defaultPrevented;
    }),
    true,
    "selection starting at a text node must also be suppressed",
  );
  await heading.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().addRange(range);
  });
  await page.waitForFunction(() => getSelection().isCollapsed);
  // Selection elsewhere in the document must remain usable.
  await page.evaluate(() => {
    const el = document.createElement("p");
    el.id = "selection-fixture";
    el.textContent = "Outside planner selection";
    document.body.append(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  assert.equal(
    await page.evaluate(() => getSelection().toString()),
    "Outside planner selection",
  );
  await page.evaluate(() => {
    getSelection().removeAllRanges();
    document.querySelector("#selection-fixture").remove();
  });
  async function event(type, id = 51, extra = {}, target = ink) {
    await target.dispatchEvent(type, {
      pointerId: id,
      pointerType: "pen",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: rect.x + 60,
      clientY: rect.y + 80,
      pressure: 0.6,
      bubbles: true,
      ...extra,
    });
  }
  async function backup() {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup" }).click();
    const data = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    return data.pages.flatMap((p) => p.strokes);
  }
  async function pixels() {
    return ink.evaluate((c) => {
      const data = c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
      return count;
    });
  }
  // Synthetic pen pointers cannot acquire native capture: exercise the fallback.
  await event("pointerdown");
  assert.equal(await next.isDisabled(), true);
  assert.ok(
    (await pixels()) > 0,
    "React's busy-state redraw must preserve the first dot",
  );
  await event("pointermove", 51, { clientX: rect.x + 160 });
  const beforeResize = await pixels();
  assert.ok(beforeResize > 10);
  await ink.evaluate((c) => {
    c.style.width = "90%";
  });
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return (
      c.width === Math.round(c.getBoundingClientRect().width * devicePixelRatio)
    );
  });
  assert.ok((await pixels()) > 10, "resize must retain the active stroke");
  // A palm cannot end or replace the pen, even with an injected matching ID.
  await event("pointerdown", 70, { pointerType: "touch" });
  await event("pointerup", 51, { pointerType: "touch" });
  assert.equal(await next.isDisabled(), true);
  await event("pointercancel");
  assert.equal(await next.isDisabled(), false);
  assert.equal((await backup()).length, 1);
  // Duplicate endings must not commit the same stroke twice.
  await event("lostpointercapture");
  await event("pointerup");
  assert.equal((await backup()).length, 1);
  for (const ending of ["lostpointercapture", "pointerup", "pointercancel"]) {
    await event("pointerdown");
    await event("pointermove", 51, { clientX: rect.x + 120 });
    await event(
      ending,
      51,
      {},
      ending === "lostpointercapture" ? ink : page.locator("body"),
    );
    assert.equal(await next.isDisabled(), false, ending);
  }
  assert.equal((await backup()).length, 4);
  // A new pen contact can recover even if the previous ending never arrived.
  await event("pointerdown");
  await event("pointermove", 51, { clientX: rect.x + 110 });
  await event("pointerdown", 52);
  await event("pointerup", 52);
  assert.equal((await backup()).length, 6);
  await event("pointerdown");
  await event("pointermove", 51, { buttons: 0 });
  assert.equal(
    await next.isDisabled(),
    false,
    "hover unlocks a missed pen lift",
  );
  assert.equal((await backup()).length, 7);
  for (const type of ["blur", "pagehide"]) {
    await event("pointerdown");
    await page.evaluate((type) => window.dispatchEvent(new Event(type)), type);
    assert.equal(await next.isDisabled(), false, type);
  }
  await event("pointerdown");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  assert.equal((await backup()).length, 10);
  // Coalesced and empty sample lists, plus rapid repeated pen lifts.
  await page.evaluate(() => {
    window.inkClears = 0;
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      window.inkClears++;
      return original.apply(this, args);
    };
  });
  await event("pointerdown");
  // Starting a stroke updates toolbar state and may redraw the other blank page.
  await page.evaluate(() => {
    window.inkClears = 0;
  });
  await ink.evaluate((c) => {
    const r = c.getBoundingClientRect();
    const e = new PointerEvent("pointermove", {
      pointerId: 51,
      pointerType: "pen",
      buttons: 1,
      bubbles: true,
      clientX: r.left + 100,
      clientY: r.top + 80,
      pressure: 0.6,
    });
    Object.defineProperty(e, "getCoalescedEvents", {
      value: () => [
        { clientX: r.left + 90, clientY: r.top + 80, pressure: 0.4 },
        { clientX: r.left + 100, clientY: r.top + 80, pressure: 0.6 },
      ],
    });
    c.dispatchEvent(e);
  });
  await event("pointermove", 51, { clientX: rect.x + 140 });
  assert.equal(
    await page.evaluate(() => window.inkClears),
    0,
    "pen movement must not clear/replay the page",
  );
  await event("pointerup");
  for (let i = 0; i < 20; i++) {
    // iPad can reuse a pen ID across successive contacts.
    await event("pointerdown", 51);
    await ink.evaluate((c) => {
      Object.defineProperty(c, "hasPointerCapture", {
        configurable: true,
        value: () => true,
      });
      c.dispatchEvent(
        new PointerEvent("lostpointercapture", {
          pointerId: 51,
          pointerType: "pen",
          bubbles: true,
        }),
      );
      delete c.hasPointerCapture;
    });
    assert.equal(
      await next.isDisabled(),
      true,
      "delayed capture loss must not end a recaptured stroke",
    );
    await event("pointermove", 51, { clientX: rect.x + 100 });
    await ink.dispatchEvent("dblclick", { bubbles: true, cancelable: true });
    await event("pointerup", 51);
  }
  await event("pointerdown");
  await event("pointerdown", 60, {}, page.locator("canvas").nth(1));
  await event("pointerup", 60);
  assert.equal(
    await next.isDisabled(),
    false,
    "a fresh contact on the other page must release stale ink",
  );
  const saved = await backup();
  assert.equal(saved.length, 33);
  assert.ok(saved[10].points.length >= 4);
  await page.reload();
  await ink.waitFor();
  assert.deepEqual(await backup(), saved);
  await page.getByRole("button", { name: "Browse dates", exact: true }).click();
  assert.equal(
    await heading.evaluate((el) => {
      const e = new Event("touchstart", { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    }),
    false,
    "Browse mode must release touch suppression",
  );
  await page
    .getByRole("button", { name: "Open week of 2027-01-01", exact: true })
    .click();
  await page.getByRole("heading", { name: "Dec 27 — Jan 2" }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Ink checks passed: recovery, cancellation, palm exclusion, resize, incremental rendering, coalesced samples, rapid lifts, persistence.",
  );
} finally {
  await browser.close();
}
