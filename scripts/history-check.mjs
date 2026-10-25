import { downloadBackup } from "./dock-helpers.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 1024 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.locator("canvas").first().waitFor();
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const next = page.getByRole("button", { name: "Next spread" });
  const previous = page.getByRole("button", { name: "Previous spread" });
  async function draw(panel) {
    const canvas = page.locator("canvas:not(.highlighter-layer)").nth(panel);
    const rect = await canvas.boundingBox();
    for (const type of ["pointerdown", "pointerup"]) {
      await canvas.dispatchEvent(type, {
        pointerId: 51,
        pointerType: "pen",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: rect.x + 60,
        clientY: rect.y + 80,
        pressure: 0.6,
        bubbles: true,
      });
    }
  }
  async function savedPages() {
    const data = await downloadBackup(page);
    return data.pages
      .filter((entry) => entry.strokes.length)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  await draw(0);
  const first = await savedPages();
  await draw(1);
  const both = await savedPages();
  assert.equal(both.length, 2);
  await draw(0);
  const three = await savedPages();
  await next.click();
  await page.waitForFunction(
    () =>
      !document.querySelector(".page-turn") &&
      !document.querySelector('button[aria-label="Next spread"]').disabled,
  );
  const heading = await page.locator(".template h1").first().textContent();
  await undo.click();
  assert.deepEqual(await savedPages(), both);
  await undo.click();
  assert.deepEqual(await savedPages(), first);
  await undo.click();
  assert.deepEqual(await savedPages(), []);
  assert.equal(await undo.isDisabled(), true);
  for (const expected of [first, both, three]) {
    await redo.click();
    assert.deepEqual(await savedPages(), expected);
  }
  assert.equal(await redo.isDisabled(), true);
  assert.equal(
    await page.locator(".template h1").first().textContent(),
    heading,
  );
  await undo.click();
  await draw(1);
  assert.equal(
    await redo.isDisabled(),
    true,
    "a new edit anywhere clears redo",
  );
  const branched = await savedPages();
  await undo.click();
  assert.deepEqual(await savedPages(), both);
  await redo.click();
  assert.deepEqual(await savedPages(), branched);
  await previous.click();
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await draw(0);
  const erased = await savedPages();
  assert.equal(erased.flatMap((entry) => entry.strokes).length, 2);
  await undo.click();
  assert.deepEqual(await savedPages(), branched);
  await redo.click();
  assert.deepEqual(await savedPages(), erased);
  await page.reload();
  await page.locator("canvas").first().waitFor();
  assert.deepEqual(await savedPages(), erased);
  assert.equal(await undo.isDisabled(), true);
  assert.equal(await redo.isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log(
    "History checks passed: cross-panel order, hidden pages, redo, branching, erasing, and persistence.",
  );
} finally {
  await browser.close();
}
