import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [390, 412]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
    const ink = page.locator("canvas").first();
    await ink.waitFor();
    const rect = await ink.boundingBox();
    const x = Math.round(rect.x + rect.width * 0.3);
    const y = Math.round(rect.y + rect.height * 0.3);
    const client = await context.newCDPSession(page);
    const touch = (type, points) =>
      client.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points,
      });
    const first = { x, y, id: 1 };
    async function draw() {
      await touch("touchStart", [first]);
      await touch("touchMove", [{ ...first, x: x + 25, y: y + 20 }]);
      await touch("touchEnd", []);
    }
    async function backup() {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download backup" }).click();
      return JSON.parse(await readFile(await (await download).path(), "utf8"));
    }
    const strokes = (data) => data.pages.flatMap((p) => p.strokes);
    await draw();
    assert.equal(strokes(await backup()).length, 0, "touch defaults to off");
    const toggle = page.getByRole("button", {
      name: "Finger writing",
      exact: true,
    });
    await toggle.tap();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await draw();
    let saved = await backup();
    assert.equal(strokes(saved).length, 1);
    assert.ok(strokes(saved)[0].points.length > 1);
    // A second native touch must not end the first stroke or draw elsewhere.
    await touch("touchStart", [first]);
    const second = {
      x: Math.round(rect.x + rect.width * 0.7),
      y: y + 30,
      id: 2,
    };
    await touch("touchStart", [first, second]);
    assert.equal(
      await page.getByRole("button", { name: "Next spread" }).isDisabled(),
      true,
    );
    await touch("touchMove", [{ ...first, x: x + 15 }, second]);
    await touch("touchEnd", []);
    assert.equal(strokes(await backup()).length, 2);
    await page.getByRole("button", { name: "Undo", exact: true }).tap();
    assert.equal(strokes(await backup()).length, 1);
    await page.getByRole("button", { name: "Redo", exact: true }).tap();
    assert.equal(strokes(await backup()).length, 2);
    await page.getByRole("button", { name: "Eraser", exact: true }).tap();
    await draw();
    assert.equal(strokes(await backup()).length, 0);
    await page.getByRole("button", { name: "Pen", exact: true }).tap();
    await draw();
    saved = await backup();
    await page.reload();
    await ink.waitFor();
    assert.deepEqual((await backup()).pages, saved.pages);
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    await toggle.tap();
    await page.getByRole("button", { name: "Browse dates", exact: true }).tap();
    await page
      .getByRole("button", { name: "Open week of 2027-01-01", exact: true })
      .tap();
    await page
      .getByRole("heading", { name: "Dec 27 — Jan 2" })
      .first()
      .waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `Touch checks passed at ${width}px: opt-in, native drawing, multi-touch exclusion, undo/redo, erasing, persistence, Browse dates.`,
    );
  }
} finally {
  await browser.close();
}
