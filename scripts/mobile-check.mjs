import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page.locator(".book").waitFor();
  const welcome = page.getByRole("button", {
    name: "Back to my planner",
    exact: true,
  });
  if (await welcome.isVisible()) await welcome.click();
  await page.locator(".mobile-mode").waitFor();
  let turnCount = 0;
  async function mobileTurn(name) {
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .locator(".page-turn .stf__wrapper.--portrait")
      .waitFor({ state: "attached" });
    assert.equal(await page.locator(".turn-destination > .page").count(), 1);
    assert.equal(await page.locator(".page-turn .turn-rings").count(), 0);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".page-turn .turn-sheet")].some(
        (e) => e.style.transform && !e.classList.contains("--simple"),
      ),
    );
    const dimensions = await page
      .locator(".page-turn .turn-sheet .page")
      .first()
      .evaluate((e) => ({
        width: parseFloat(e.style.width),
        height: parseFloat(e.style.height),
      }));
    assert.ok(Math.abs(dimensions.width / dimensions.height - 0.75) < 0.001);
    if (++turnCount === 1) {
      const original = await page
        .locator(".book > .page .ink:not(.highlighter-layer)")
        .evaluate((e) => e.toDataURL());
      const copy = await page
        .locator(".page-turn .turn-sheet .ink:not(.highlighter-layer)")
        .first()
        .evaluate((e) => e.toDataURL());
      assert.equal(copy, original);
      await page.screenshot({ path: "test-results/mobile-turn-portrait.png" });
    }
    await page.waitForFunction(() => !document.querySelector(".page-turn"));
  }
  const geometry = () =>
    page.locator(".book > .page").evaluateAll((pages) =>
      pages.map((p) => {
        const r = p.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
    );
  let sizes = await geometry();
  assert.equal(sizes.length, 1);
  assert.ok(Math.abs(sizes[0].width / sizes[0].height - 0.75) < 0.001);
  assert.ok(sizes[0].width >= 380);
  assert.equal(await page.locator(".left-dock").isVisible(), false);
  assert.equal(await page.locator(".right-dock").isVisible(), false);
  // Footer reserves space for both arrows, even on narrow phones.
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    const previous = await page
      .getByRole("button", { name: "Previous page", exact: true })
      .boundingBox();
    const next = await page
      .getByRole("button", { name: "Next page", exact: true })
      .boundingBox();
    const label = await page.locator(".spread-navigation > span").boundingBox();
    assert.ok(previous.x + previous.width <= label.x);
    assert.ok(label.x + label.width <= next.x);
    assert.equal(await page.locator(".bottom .status-row").count(), 0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Options", exact: true }).click();
  assert.ok(
    (await page.locator(".mobile-save-status").innerText()).includes(
      "Changes saved",
    ),
  );
  await page.getByRole("button", { name: "Options", exact: true }).click();
  assert.equal(await page.locator(".mobile-save-status").count(), 0);
  await page.screenshot({ path: "test-results/mobile-footer.png" });
  const records = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("my-pastel-planner");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction("pages").objectStore("pages").getAll();
            read.onsuccess = () => {
              resolve(read.result);
              db.close();
            };
            read.onerror = () => {
              reject(read.error);
              db.close();
            };
          };
        }),
    );
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const ink = await page
    .locator(".book > .page .ink:not(.highlighter-layer)")
    .boundingBox();
  await page.mouse.move(ink.x + ink.width * 0.3, ink.y + ink.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(ink.x + ink.width * 0.6, ink.y + ink.height * 0.4, {
    steps: 6,
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const savedInk = await records();
  assert.ok(savedInk.some((p) => p.strokes.length > 0));
  await mobileTurn("Next page");
  await page.locator(".book > .page-1").waitFor();
  await mobileTurn("Next page");
  await page.locator(".book > .page-0").waitFor();
  await mobileTurn("Previous page");
  await page.locator(".book > .page-1").waitFor();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(250);
  sizes = await geometry();
  assert.ok(sizes[0].width >= 830);
  assert.ok(sizes[0].height > 1000);
  assert.ok(Math.abs(sizes[0].width / sizes[0].height - 0.75) < 0.001);
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const region = page.getByRole("region", { name: "Scrollable planner page" });
  const bounds = await region.boundingBox();
  await page.mouse.move(bounds.x + 200, bounds.y + 160);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 200, bounds.y + 40, { steps: 6 });
  await page.mouse.up();
  assert.ok((await region.evaluate((e) => e.scrollTop)) > 60);
  await mobileTurn("Next page");
  assert.equal(await region.evaluate((e) => e.scrollTop), 0);
  // A resize while turning must commit the destination and release navigation.
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.locator(".page-turn").waitFor({ state: "attached" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
  await page.locator(".book > .page-1").waitFor();
  await mobileTurn("Previous page");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  assert.equal(await page.locator(".page-turn").count(), 0);
  await page.locator(".book > .page-1").waitFor();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await page.locator(".book > .page-0").waitFor();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.waitForTimeout(100);
  sizes = await geometry();
  assert.ok(sizes[0].height <= bounds.height + 1);
  await page.getByRole("button", { name: "Fill width", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile-landscape.png" });
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  assert.equal(await page.locator(".left-dock").isVisible(), true);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page.getByLabel("Planner layout", { exact: true }).selectOption("book");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".book > .page").count(), 2);
  await page.reload();
  await page.locator(".book").waitFor();
  assert.equal(await page.locator(".mobile-mode").count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page.getByLabel("Planner layout", { exact: true }).selectOption("auto");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".book > .page").count(), 2);
  const beforeTurn = await page
    .locator(".book > .page-0 .template")
    .innerText();
  await page.getByRole("button", { name: "Next spread", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
  assert.notEqual(
    await page.locator(".book > .page-0 .template").innerText(),
    beforeTurn,
  );
  await page
    .getByRole("button", { name: "Previous spread", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector(".page-turn"));
  assert.equal(
    await page.locator(".book > .page-0 .template").innerText(),
    beforeTurn,
  );
  assert.deepEqual(await records(), savedInk);
  assert.deepEqual(errors, []);
  console.log(
    "Mobile portrait/landscape proportions, page sequence, panning, fit, menus, override and desktop checks passed.",
  );
} finally {
  await browser.close();
}
