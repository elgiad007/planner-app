import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

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
  const write = async () => {
    const rect = await page.locator("canvas").first().boundingBox();
    await page.mouse.move(rect.x + 100, rect.y + 130);
    await page.mouse.down();
    await page.mouse.move(rect.x + 150, rect.y + 170, { steps: 8 });
    await page.mouse.up();
  };
  for (const modifier of ["Control", "Meta"]) {
    const downloadEvent = page.waitForEvent("download");
    await press(`${modifier}+s`);
    const download = await downloadEvent;
    assert.ok(download.suggestedFilename().endsWith(".json"));
    await page
      .getByRole("status")
      .filter({ hasText: "Planner file downloaded" })
      .waitFor();
    const chooserEvent = page.waitForEvent("filechooser");
    await press(`${modifier}+o`);
    const chooser = await chooserEvent;
    assert.equal(chooser.isMultiple(), false);
  }
  console.log("Save and Open shortcuts passed");
  await write();
  await page
    .getByRole("button", { name: "February 2027", exact: true })
    .click();
  await write();
  await press("Shift+ArrowLeft");
  assert.equal(
    await page.locator(".spread-navigation > span").innerText(),
    "January 2027",
  );
  await press("Shift+ArrowRight");
  assert.equal(
    await page.locator(".spread-navigation > span").innerText(),
    "February 2027",
  );
  await press("Shift+ArrowRight");
  assert.equal(
    await page.locator(".spread-navigation > span").innerText(),
    "February 2027",
    "no destination leaves the view unchanged",
  );
  // Start the remaining shortcut checks with a fresh undo history.
  await page
    .getByRole("status")
    .filter({ hasText: "Changes saved on this device" })
    .waitFor();
  await page.reload();
  await page.locator(".book").waitFor();
  await press("Home");
  for (const [key, label] of [
    ["t", "Text"],
    ["n", "Pencil"],
    ["h", "Highlighter"],
    ["e", "Eraser"],
    ["s", "Select / move"],
    ["b", "Browse dates"],
    ["p", "Pen"],
  ]) {
    await press(key);
    assert.equal(
      await page
        .getByRole("button", { name: label, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
  }
  await press("g");
  assert.equal(
    await page
      .getByLabel("Jump to date")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("n");
  assert.equal(
    await page
      .getByRole("button", { name: "Pen", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "typing does not switch tools",
  );
  await page.keyboard.press("Escape");
  await press("w");
  await press("g");
  assert.ok(
    (
      await page
        .getByRole("button", { name: "Week", exact: true })
        .getAttribute("class")
    ).includes("selected"),
  );
  const date = await page.getByLabel("Jump to date").inputValue();
  await page.keyboard.press("Escape");
  await press("ArrowRight");
  await press("g");
  assert.notEqual(await page.getByLabel("Jump to date").inputValue(), date);
  await page.keyboard.press("Escape");
  await press("+");
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  assert.equal(await page.getByLabel("Zoom level").textContent(), "125%");
  await page.keyboard.press("Escape");
  await press("0");
  await page.locator(".zoom-viewport").focus();
  await page.keyboard.down("Space");
  assert.ok(await page.locator(".hand-mode").count());
  await page.keyboard.up("Space");
  assert.equal(await page.locator(".hand-mode").count(), 0);
  await press("?");
  assert.equal(
    await page.getByRole("heading", { name: "Keyboard shortcuts" }).isVisible(),
    true,
  );
  assert.equal(await page.locator(".shortcut-table tbody tr").count(), 21);
  await page.keyboard.press("Tab");
  assert.equal(
    await helpClose.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("e");
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Pen", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "help blocks background shortcuts",
  );
  const canvas = page.locator("canvas:not(.highlighter-layer)").first();
  const rect = await canvas.boundingBox();
  const pointer = {
    pointerId: 51,
    pointerType: "pen",
    button: 0,
    clientX: rect.x + 60,
    clientY: rect.y + 80,
    pressure: 0.6,
    bubbles: true,
  };
  await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1 });
  await press("e");
  assert.equal(
    await page
      .getByRole("button", { name: "Pen", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "active stroke blocks tool shortcuts",
  );
  await canvas.dispatchEvent("pointerup", { ...pointer, buttons: 0 });
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  assert.equal(await undo.isEnabled(), true);
  await press("Control+z");
  assert.equal(await undo.isEnabled(), false);
  assert.equal(await redo.isEnabled(), true);
  await press("Control+Shift+z");
  assert.equal(await undo.isEnabled(), true);
  assert.equal(await redo.isEnabled(), false);
  await press("Control+z");
  await press("Control+y");
  assert.equal(await undo.isEnabled(), true);
  await press("]");
  await page
    .getByRole("button", { name: "Tool settings", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Pen thickness", { exact: true }).inputValue(),
    "3",
  );
  await page.keyboard.press("Escape");
  await press("g");
  await page.getByRole("button", { name: "Home", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page
      .getByRole("button", { name: "Today", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log("Keyboard shortcuts passed");
} finally {
  await browser.close();
}
