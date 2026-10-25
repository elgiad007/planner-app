import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const heading = () => page.locator(".book > .page .template h1").first();
async function saved() {
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Next spread"]')?.disabled,
  );
}
async function snapshot() {
  const event = page.waitForEvent("download");
  await button("Download backup").click();
  const result = JSON.parse(await readFile(await (await event).path(), "utf8"));
  result.pages.sort((a, b) => a.id.localeCompare(b.id));
  await saved();
  return result;
}
async function draw(x1, y1, x2, y2) {
  const r = await page.locator(".book > .page canvas").first().boundingBox();
  const x = (v) => r.x + (v / 600) * r.width,
    y = (v) => r.y + (v / 800) * r.height;
  await page.mouse.move(x(x1), y(y1));
  await page.mouse.down();
  await page.mouse.move(x(x2), y(y2), { steps: 12 });
  await page.mouse.up();
  await saved();
}
async function open(id) {
  await page.getByLabel("Open spread", { exact: true }).selectOption(id);
  await saved();
}
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await heading().waitFor();
  await draw(100, 200, 180, 240);
  const legacyInk = (await snapshot()).pages[0];
  await button("Pages & bookmarks").click();
  for (const template of [
    "blank",
    "lined",
    "dot-grid",
    "checklist",
    "sketchbook",
  ]) {
    await page
      .getByLabel("Insert paper", { exact: true })
      .selectOption(template);
    await page
      .getByLabel("Insert title", { exact: true })
      .fill(template + " ideas");
    await button("Add spread").click();
    await saved();
    assert.equal(await heading().textContent(), template + " ideas");
    assert.equal(await page.locator(".book > .page .insert-paper").count(), 2);
  }
  await button("Close pages").click();
  await button("Highlighter").click();
  const highlighterSize = page.getByRole("slider", {
    name: "Highlighter thickness",
  });
  assert.equal(await highlighterSize.inputValue(), "24");
  assert.equal(await highlighterSize.getAttribute("max"), "48");
  await highlighterSize.fill("48");
  await button("Pen").click();
  assert.equal(
    await page.getByRole("slider", { name: "Pen thickness" }).inputValue(),
    "2.5",
  );
  await button("Highlighter").click();
  assert.equal(await highlighterSize.inputValue(), "48");
  await highlighterSize.fill("24");
  await draw(100, 200, 180, 240);
  const highlightLayer = page
    .locator(".book > .page .highlighter-layer")
    .first();
  assert.equal(
    await highlightLayer.evaluate((c) => getComputedStyle(c).mixBlendMode),
    "multiply",
  );
  assert.equal(
    await highlightLayer.evaluate((c) => getComputedStyle(c).pointerEvents),
    "none",
  );
  const highlightAlpha = await highlightLayer.evaluate((c) => {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    for (let i = 3; i < data.length; i += 4) max = Math.max(max, data[i]);
    return max;
  });
  assert.ok(
    Math.abs(highlightAlpha - 0.65 * 255) < 2,
    "highlight uses 65% opacity",
  );
  await button("Eraser").click();
  await draw(140, 220, 140, 220);
  assert.equal(
    await highlightLayer.evaluate((c) =>
      c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height)
        .data.some((v) => v),
    ),
    false,
    "erasing removes the highlighter bitmap",
  );
  await button("Undo").click();
  await saved();
  assert.equal(
    await highlightLayer.evaluate((c) =>
      c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height)
        .data.some((v) => v),
    ),
    true,
    "undo redraws the highlighter layer",
  );
  await button("Pencil").click();
  await draw(260, 320, 300, 350);
  const before = await snapshot();
  const originalView = before.settings.view,
    originalId = `custom:${originalView.insert}:left`;
  const original = before.pages.find((p) => p.id === originalId);
  assert.equal(original.strokes[0].tool, "highlighter");
  assert.equal(original.strokes[0].width, 24);
  assert.equal(original.strokes[1].tool, "pencil");
  assert.equal(original.strokes[1].width, 2.5);
  // Select a long segment by crossing its middle; endpoints lie outside this box.
  await button("Select / move").click();
  await draw(130, 205, 150, 235);
  assert.deepEqual(
    (await snapshot()).pages.find((p) => p.id === originalId),
    original,
  );
  await draw(140, 220, 190, 280);
  const moved = (await snapshot()).pages.find((p) => p.id === originalId);
  assert.ok(
    Math.abs(
      moved.strokes[0].points[0].x - original.strokes[0].points[0].x - 50,
    ) < 2,
  );
  assert.deepEqual(moved.strokes[1], original.strokes[1]);
  await button("Undo").click();
  assert.deepEqual(
    (await snapshot()).pages.find((p) => p.id === originalId),
    original,
  );
  await button("Redo").click();
  // A replacement rectangle selects both strokes and moves them together.
  await draw(120, 230, 320, 370);
  await draw(190, 280, 210, 300);
  const groupMoved = (await snapshot()).pages.find((p) => p.id === originalId);
  for (let i = 0; i < 2; i++) {
    assert.ok(
      Math.abs(
        groupMoved.strokes[i].points[0].x - moved.strokes[i].points[0].x - 20,
      ) < 2,
    );
    assert.ok(
      Math.abs(
        groupMoved.strokes[i].points[0].y - moved.strokes[i].points[0].y - 20,
      ) < 2,
    );
  }
  await button("Undo").click();
  assert.deepEqual(
    (await snapshot()).pages.find((p) => p.id === originalId),
    moved,
  );
  await button("Pen").click();
  await button("Pages & bookmarks").click();
  await button("Bookmark spread").click();
  await saved();
  await button("Duplicate spread").click();
  await saved();
  const duplicate = await snapshot(),
    copyId = `custom:${duplicate.settings.view.insert}:left`;
  const copy = duplicate.pages.find((p) => p.id === copyId);
  assert.notEqual(copy.strokes[0].id, moved.strokes[0].id);
  assert.deepEqual(copy.strokes[0].points, moved.strokes[0].points);
  await button("Close pages").click();
  await draw(400, 400, 440, 440);
  const edited = await snapshot();
  assert.equal(edited.pages.find((p) => p.id === copyId).strokes.length, 3);
  assert.equal(edited.pages.find((p) => p.id === originalId).strokes.length, 2);
  await button("Pages & bookmarks").click();
  await page
    .getByLabel("Move position", { exact: true })
    .selectOption("before");
  await page
    .getByLabel("Move destination", { exact: true })
    .selectOption("month:2027-01-01");
  await button("Move spread").click();
  await saved();
  const reordered = await snapshot(),
    index = reordered.settings.order.findIndex(
      (v) => v.insert === reordered.settings.view.insert,
    );
  assert.equal(reordered.settings.order[index + 1].date, "2027-01-01");
  await button("Next spread").click();
  await saved();
  assert.equal(await heading().textContent(), "January 2027");
  await button("Previous spread").click();
  await saved();
  assert.equal(
    (await snapshot()).settings.view.insert,
    reordered.settings.view.insert,
  );
  await page.reload();
  await heading().waitFor();
  const reloaded = await snapshot();
  assert.deepEqual(reloaded.pages, reordered.pages);
  assert.deepEqual(reloaded.settings.order, reordered.settings.order);
  await button("Pages & bookmarks").click();
  const deleteButton = button("Delete custom spread");
  page.once("dialog", (d) => d.dismiss());
  await deleteButton.click();
  await saved();
  assert.equal((await snapshot()).pages.length, reloaded.pages.length);
  page.once("dialog", (d) => d.accept());
  await deleteButton.click();
  await saved();
  const deleted = await snapshot();
  assert.ok(!deleted.pages.some((p) => p.id === copyId));
  assert.deepEqual(
    deleted.pages.find((p) => p.id === originalId),
    moved,
  );
  const bookmark = page
    .getByLabel("Bookmarks", { exact: true })
    .getByRole("button");
  await bookmark.click();
  await saved();
  assert.equal((await snapshot()).settings.view.insert, originalView.insert);
  await open("month:2027-01-01");
  assert.deepEqual(
    (await snapshot()).pages.find((p) => p.id === legacyInk.id),
    legacyInk,
  );
  await button("Duplicate spread").click();
  await saved();
  assert.equal(await heading().textContent(), "January 2027");
  const calendarCopy = await snapshot();
  assert.equal(calendarCopy.settings.inserts.at(-1).source.mode, "month");
  // Restore a version 2 backup and retain all custom metadata and ink.
  page.on("dialog", (d) => d.accept());
  await page.locator('input[type="file"]').setInputFiles({
    name: "phase3.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(reordered)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Backup restored" })
    .waitFor();
  const restored = await snapshot();
  assert.deepEqual(restored.pages, reordered.pages);
  assert.deepEqual(restored.settings.order, reordered.settings.order);
  await button("Close pages").click();
  await page.screenshot({
    path: "test-results/phase3-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1376, height: 1032 });
  await button("Pages & bookmarks").click();
  await page.screenshot({
    path: "test-results/phase3-organizer.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  // Saved organization must grow when a turn reaches either end of the book.
  const boundaryBaseline = await snapshot();
  for (const direction of [1, -1]) {
    for (let crossing = 0; crossing < 2; crossing++) {
      const before = await snapshot();
      const order = before.settings.order;
      const edge = direction > 0 ? order[order.length - 1] : order[0];
      const id = edge.insert
        ? `custom:${edge.insert}`
        : `${edge.mode}:${edge.date}`;
      await open(id);
      await button("Close pages").click();
      if (direction > 0 && crossing === 0) {
        const cdp = await context.newCDPSession(page);
        const r = await page
          .locator(".book > .page canvas")
          .first()
          .boundingBox();
        const y = r.y + r.height / 2;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: r.x + 260, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: r.x + 100, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
      } else {
        await button(direction > 0 ? "Next spread" : "Previous spread").click();
      }
      await page.waitForFunction(() => !document.querySelector(".page-turn"));
      await saved();
      const after = await snapshot();
      assert.ok(
        direction > 0
          ? after.settings.view.date > edge.date
          : after.settings.view.date < edge.date,
      );
      assert.ok(after.settings.order.length > order.length);
      assert.deepEqual(after.pages, boundaryBaseline.pages);
      assert.deepEqual(
        after.settings.bookmarks,
        boundaryBaseline.settings.bookmarks,
      );
      await button(direction > 0 ? "Previous spread" : "Next spread").click();
      await page.waitForFunction(() => !document.querySelector(".page-turn"));
      await saved();
      assert.deepEqual((await snapshot()).settings.view, edge);
      await button("Pages & bookmarks").click();
    }
  }
  const boundaryResult = await snapshot();
  await page.reload();
  await saved();
  assert.deepEqual(
    (await snapshot()).settings.order,
    boundaryResult.settings.order,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Phase 3 browser checks passed: five templates, tools, segment selection, movement/undo, duplicate independence, saved ordering, animation, bookmarks, delete confirmation and backup restoration.",
  );
} finally {
  await browser.close();
}
