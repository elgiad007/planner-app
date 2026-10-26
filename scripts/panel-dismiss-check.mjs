import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { downloadBackup, openDock } from "./dock-helpers.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.locator(".book").waitFor();
  const welcome = page.getByRole("button", {
    name: "Back to my planner",
    exact: true,
  });
  if (await welcome.isVisible()) await welcome.click();
  await openDock(page, "Tool settings");
  await page
    .getByRole("button", { name: "Finger writing", exact: true })
    .click();
  await page.keyboard.press("Escape");

  async function press(pointerType, tool, drag = false) {
    const surface = page
      .locator(
        tool === "Text"
          ? ".page-0 .text-layer"
          : ".page-0 .ink:not(.highlighter-layer)",
      )
      .last();
    const r = await surface.boundingBox();
    const x = r.x + r.width * 0.3;
    const y = r.y + r.height * 0.3;
    if (pointerType === "mouse") {
      await page.mouse.move(x, y);
      await page.mouse.down();
      if (drag) await page.mouse.move(x + 50, y + 50, { steps: 5 });
      await page.mouse.up();
    } else {
      const event = {
        pointerId: 51,
        pointerType,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
        pressure: 0.6,
      };
      await surface.dispatchEvent("pointerdown", event);
      if (drag)
        await surface.dispatchEvent("pointermove", {
          ...event,
          clientX: x + 50,
          clientY: y + 50,
        });
      await surface.dispatchEvent("pointerup", { ...event, buttons: 0 });
      await surface.dispatchEvent("click", { ...event, buttons: 0 });
    }
  }
  const pages = async () => (await downloadBackup(page)).pages;
  for (const pointerType of ["mouse", "pen", "touch"]) {
    // Seed real ink so an accidental erasure is observable too.
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    await page.waitForTimeout(750);
    await press(pointerType, "Pen", true);
    const before = await pages();
    assert.ok(
      before.some((p) => p.strokes.length),
      "seed stroke saved",
    );
    for (const tool of [
      "Pen",
      "Pencil",
      "Highlighter",
      "Eraser",
      "Select / move",
      "Text",
    ]) {
      await page.getByRole("button", { name: tool, exact: true }).click();
      await openDock(page, "Bookmarks");
      await press(pointerType, tool, true);
      assert.equal(
        await page.locator(".dock-panel:popover-open").count(),
        0,
        `${pointerType}/${tool}: panel closed`,
      );
      assert.equal(
        await page.locator(".text-editor").count(),
        0,
        `${pointerType}/${tool}: no text editor opened`,
      );
      assert.deepEqual(
        await pages(),
        before,
        `${pointerType}/${tool}: spread unchanged`,
      );
    }
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    await openDock(page, "Bookmarks");
    await press(pointerType, "Pen");
    await page.waitForTimeout(750);
    await press(pointerType, "Pen", true);
    const after = await pages();
    const count = (data) => data.reduce((sum, p) => sum + p.strokes.length, 0);
    assert.equal(
      count(after),
      count(before) + 1,
      `${pointerType}: next press writes`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Panel dismissal preserves ink and text across tools; mouse, pen, and touch resume writing",
  );
} finally {
  await browser.close();
}
