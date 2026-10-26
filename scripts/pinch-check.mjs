import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { downloadBackup, openDock } from "./dock-helpers.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
    const region = page.getByRole("region", {
      name: "Scrollable planner spread",
    });
    await region.waitFor();
    const client = await context.newCDPSession(page);
    const touch = (type, touchPoints) =>
      client.send("Input.dispatchTouchEvent", { type, touchPoints });
    const level = async () =>
      Number(
        (await page.getByLabel("Zoom level").textContent()).replace("%", ""),
      );
    const original = await downloadBackup(page);
    const frame = await region.boundingBox();
    const cx = Math.round(frame.x + frame.width * 0.45),
      cy = Math.round(frame.y + frame.height * 0.4);
    let a = { x: cx - 35, y: cy, id: 1 },
      b = { x: cx + 35, y: cy, id: 2 };
    async function start() {
      a = { x: cx - 35, y: cy, id: 1 };
      b = { x: cx + 35, y: cy, id: 2 };
      await touch("touchStart", [a]);
      await touch("touchStart", [a, b]);
    }
    async function spread(halfDistance) {
      a = { ...a, x: cx - halfDistance };
      b = { ...b, x: cx + halfDistance };
      await touch("touchMove", [a, b]);
      await page.waitForTimeout(50);
    }
    const paper = await page.locator(".zoom-book-size").boundingBox();
    const anchor = {
      x: (cx - paper.x) / paper.width,
      y: (cy - paper.y) / paper.height,
    };
    await start();
    for (const distance of [42, 49, 56, 63, 70]) await spread(distance);
    assert.ok(Math.abs((await level()) - 200) <= 2, "pinch doubles app zoom");
    const enlarged = await page.locator(".zoom-book-size").boundingBox();
    const limits = await region.evaluate((e) => ({
      left: e.scrollLeft,
      top: e.scrollTop,
      maxLeft: e.scrollWidth - e.clientWidth,
      maxTop: e.scrollHeight - e.clientHeight,
    }));
    const anchoredOrClamped = (delta, scroll, maximum) =>
      Math.abs(delta) < 3 ||
      (scroll === 0 && delta < 0) ||
      (Math.abs(scroll - maximum) < 1 && delta > 0);
    assert.ok(
      anchoredOrClamped(
        enlarged.x + anchor.x * enlarged.width - cx,
        limits.left,
        limits.maxLeft,
      ),
      "horizontal pinch anchor",
    );
    assert.ok(
      anchoredOrClamped(
        enlarged.y + anchor.y * enlarged.height - cy,
        limits.top,
        limits.maxTop,
      ),
      "vertical pinch anchor",
    );
    assert.equal(
      await page.evaluate(() => window.visualViewport.scale),
      1,
      "browser zoom unchanged",
    );
    await touch("touchEnd", [a]);
    await touch("touchMove", [{ ...a, x: a.x + 40, y: a.y + 20 }]);
    assert.equal(
      await page
        .getByRole("button", { name: "Next spread", exact: true })
        .isDisabled(),
      true,
    );
    await touch("touchEnd", []);
    assert.equal(
      await page
        .getByRole("button", { name: "Next spread", exact: true })
        .isEnabled(),
      true,
    );
    assert.deepEqual((await downloadBackup(page)).pages, original.pages);
    assert.deepEqual(
      (await downloadBackup(page)).settings.view,
      original.settings.view,
    );

    await start();
    await spread(100);
    assert.equal(await level(), 250, "upper limit");
    await spread(10);
    assert.equal(await level(), 100, "lower limit");
    await touch("touchCancel", []);
    assert.equal(
      await page
        .getByRole("button", { name: "Next spread", exact: true })
        .isEnabled(),
      true,
    );

    await openDock(page, "Tool settings");
    await page
      .getByRole("button", { name: "Finger writing", exact: true })
      .tap();
    await page.keyboard.press("Escape");
    await start();
    await spread(56);
    await touch("touchEnd", []);
    assert.ok((await level()) > 150, "pinch works with finger writing enabled");
    assert.deepEqual(
      (await downloadBackup(page)).pages,
      original.pages,
      "provisional finger ink rolled back",
    );
    await openDock(page, "Zoom");
    assert.equal(await page.getByLabel("Zoom level").isVisible(), true);
    await page.getByRole("button", { name: "Fit spread", exact: true }).tap();
    await page.keyboard.press("Escape");

    // Pen contact takes priority over palm touches; it still produces editable ink.
    const ink = page.locator(".page-0 canvas.ink").first();
    const rect = await ink.boundingBox();
    const pen = {
      pointerType: "pen",
      pointerId: 99,
      isPrimary: true,
      button: 0,
      buttons: 1,
      pressure: 0.5,
      clientX: rect.x + rect.width * 0.3,
      clientY: rect.y + rect.height * 0.3,
    };
    await ink.dispatchEvent("pointerdown", pen);
    await start();
    await spread(70);
    assert.equal(
      await level(),
      100,
      "palm touches do not pinch during pen input",
    );
    await touch("touchEnd", []);
    await ink.dispatchEvent("pointermove", {
      ...pen,
      clientX: pen.clientX + 12,
      clientY: pen.clientY + 12,
    });
    await ink.dispatchEvent("pointerup", {
      ...pen,
      buttons: 0,
      clientX: pen.clientX + 12,
      clientY: pen.clientY + 12,
    });
    const drawn = await downloadBackup(page);
    assert.equal(
      drawn.pages.flatMap((p) => p.strokes).length,
      1,
      "pen input preserved",
    );
    await page.waitForTimeout(750);
    await start();
    await spread(56);
    await touch("touchEnd", []);
    assert.ok((await level()) > 150, "pinch resumes after pen lifts");
    assert.deepEqual((await downloadBackup(page)).pages, drawn.pages);
    await openDock(page, "Zoom");
    await page.getByRole("button", { name: "Fit spread", exact: true }).tap();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Eraser", exact: true }).tap();
    const eraserBox = await ink.boundingBox();
    const eraserA = {
      x: Math.round(eraserBox.x + eraserBox.width * 0.3),
      y: Math.round(eraserBox.y + eraserBox.height * 0.3),
      id: 1,
    };
    const eraserB = { x: eraserA.x + 40, y: eraserA.y + 40, id: 2 };
    await touch("touchStart", [eraserA]);
    await touch("touchStart", [eraserA, eraserB]);
    await touch("touchMove", [
      { ...eraserA, x: eraserA.x - 10 },
      { ...eraserB, x: eraserB.x + 10 },
    ]);
    await touch("touchEnd", []);
    assert.deepEqual(
      (await downloadBackup(page)).pages,
      drawn.pages,
      "pinch rolls back provisional erasure",
    );
    await start();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await touch("touchEnd", []);
    assert.equal(
      await page
        .getByRole("button", { name: "Next spread", exact: true })
        .isEnabled(),
      true,
      "interrupted gesture releases lock",
    );
    await page.getByRole("button", { name: "Text", exact: true }).tap();
    await start();
    await spread(60);
    await touch("touchEnd", []);
    assert.equal(
      await page.getByRole("dialog", { name: "Edit text block" }).count(),
      0,
      "text tool does not open its editor during a pinch",
    );
    await touch("touchStart", [{ x: cx, y: cy, id: 1 }]);
    await touch("touchEnd", []);
    await page.getByRole("dialog", { name: "Edit text block" }).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).tap();
    assert.deepEqual((await downloadBackup(page)).pages, drawn.pages);
    assert.deepEqual(errors, []);
    console.log(
      `Pinch passed at ${viewport.width}×${viewport.height}: anchor, limits, toolbar, no ink/page turns, cancellation, and pen priority.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
