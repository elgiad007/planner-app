import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1366, height: 1024 },
  reducedMotion: "no-preference",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.env.PLANNER_TEST_URL ?? "http://127.0.0.1:4173/");
  await page
    .getByRole("button", { name: "Next spread", exact: true })
    .waitFor();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("my-pastel-planner", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["pages", "settings"], "readwrite");
    const views = ["01", "02"].map((month) => ({
      mode: "month",
      date: `2027-${month}-01`,
    }));
    tx.objectStore("settings").put(
      {
        view: views[0],
        order: views,
        preferences: { tool: "browse" },
        stamps: ["01", "02"].map((month) => ({
          id: `stamp-${month}`,
          name: `Stamp ${month}`,
          strokes: [
            {
              id: `stroke-${month}`,
              color: month === "01" ? "#986077" : "#557961",
              width: 6,
              points: [
                { x: 20, y: 20, pressure: 1 },
                { x: 180, y: 180, pressure: 1 },
              ],
            },
          ],
        })),
      },
      "main",
    );
    for (const month of ["01", "02"])
      for (const side of ["left", "right"]) {
        tx.objectStore("pages").put({
          id: `month:2027-${month}-01:${side}`,
          strokes: [],
          stamps: [
            {
              id: `placed-${month}-${side}`,
              stampId: `stamp-${month}`,
              x: 100,
              y: 200,
            },
          ],
        });
      }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Next spread", exact: true })
    .waitFor();
  // Capture the bitmap-copy calls synchronously: even a short animation must
  // contain incoming stamp pixels at the moment its sheets are constructed.
  await page.evaluate(() => {
    window.stampCopies = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      const result = drawImage.call(this, source, ...args);
      if (
        source instanceof HTMLCanvasElement &&
        source.classList.contains("stamp-preview")
      ) {
        const pixels = this.getImageData(
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        ).data;
        window.stampCopies.push({
          incoming: !!source.closest(".turn-destination"),
          painted: pixels.some((value, index) => index % 4 === 3 && value > 0),
        });
      }
      return result;
    };
  });
  for (const direction of ["Next spread", "Previous spread"]) {
    await page.evaluate(() => {
      window.stampCopies = [];
    });
    await page.getByRole("button", { name: direction, exact: true }).click();
    await page.waitForFunction(() => window.stampCopies.length === 4);
    const copies = await page.evaluate(() => window.stampCopies);
    assert.equal(copies.filter((c) => c.incoming).length, 2);
    assert.ok(
      copies.every((c) => c.painted),
      `${direction}: outgoing and incoming stamp bitmaps must be painted before animation snapshots`,
    );
    await page.waitForFunction(() => !document.querySelector(".page-turn"));
  }
  assert.deepEqual(errors, []);
  console.log(
    "Stamp page-turn checks passed: painted outgoing and incoming snapshots in both directions.",
  );
} finally {
  await browser.close();
}
