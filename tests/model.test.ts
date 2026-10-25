import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthCells,
  sunday,
  addDays,
  moveView,
  pageIds,
  validateBackup,
  distanceToSegment,
  type Backup,
} from "../src/model.ts";
import "fake-indexeddb/auto";
import {
  savePage,
  saveSettings,
  loadPlanner,
  replacePlanner,
} from "../src/storage.ts";

test("2027 calendar is Sunday-first, covers every day and all six-row months", () => {
  for (let m = 1; m <= 12; m++) {
    const s = `2027-${String(m).padStart(2, "0")}-01`,
      cells = monthCells(s);
    assert.equal(new Date(cells[0] + "T12:00:00Z").getUTCDay(), 0);
    assert.equal(cells.length, 42);
    const inMonth = cells.filter((d) => d.startsWith(s.slice(0, 7)));
    assert.equal(inMonth.length, new Date(Date.UTC(2027, m, 0)).getUTCDate());
    assert.equal(inMonth[0], s);
  }
  assert.equal(monthCells("2027-05-01")[0], "2027-04-25");
  assert.ok(monthCells("2027-05-01").includes("2027-05-31"));
});
test("leap years and year-boundary weeks use civil date arithmetic", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(sunday("2027-01-01"), "2026-12-27");
  assert.deepEqual(moveView({ mode: "month", date: "2027-12-31" }, 1), {
    mode: "month",
    date: "2028-01-01",
  });
  assert.deepEqual(
    pageIds({ mode: "week", date: "2027-01-01" }),
    pageIds({ mode: "week", date: "2026-12-28" }),
  );
});
const backup: Backup = {
  format: "my-pastel-planner",
  schemaVersion: 1,
  layoutVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-10-25T15:00:00Z",
  settings: { view: { mode: "month", date: "2027-01-01" } },
  pages: [
    {
      id: "month:2027-01-01:left",
      strokes: [
        {
          id: "ink1",
          color: "#123456",
          width: 2,
          points: [
            { x: 20, y: 30, pressure: 0.5 },
            { x: 40, y: 50, pressure: 0.8 },
          ],
        },
      ],
    },
  ],
};
test("JSON round trip preserves editable ink and rejects malformed imports", () => {
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))), backup);
  for (const change of [
    (b) => (b.schemaVersion = 99),
    (b) => b.pages.push(b.pages[0]),
    (b) => (b.pages[0].strokes[0].points[0].x = NaN),
    (b) => (b.settings.view.date = "2027-02-30"),
    (b) => (b.pages[0].id = "week:2027-01-01:left"),
  ] as ((b: any) => void)[]) {
    const b = structuredClone(backup);
    change(b);
    assert.throws(() => validateBackup(b));
  }
});
test("eraser hit testing includes the middle of long stroke segments", () => {
  assert.equal(
    distanceToSegment(
      { x: 50, y: 2, pressure: 1 },
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ),
    2,
  );
});
test("IndexedDB round trip and validated atomic replacement", async () => {
  await savePage(backup.pages[0]);
  await saveSettings(backup.settings);
  let saved = await loadPlanner();
  assert.deepEqual(saved.pages, backup.pages);
  const invalid = structuredClone(backup);
  invalid.schemaVersion = 99 as 1;
  await assert.rejects(replacePlanner(invalid));
  assert.deepEqual((await loadPlanner()).pages, backup.pages);
  await replacePlanner({ ...backup, pages: [] });
  assert.deepEqual((await loadPlanner()).pages, []);
  await replacePlanner(backup);
  saved = await loadPlanner();
  assert.deepEqual(saved.pages, backup.pages);
  assert.deepEqual(saved.settings, backup.settings);
});
