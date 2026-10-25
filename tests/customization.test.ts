import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  initialView,
  pageIds,
  spreadId,
  plannerOrder,
  turnDestination,
  duplicateSpread,
  translateStrokes,
  validateBackup,
  type Backup,
  type Stroke,
} from "../src/model.ts";
import {
  loadPlanner,
  replacePlanner,
  saveOrganization,
} from "../src/storage.ts";

const stroke: Stroke = {
  id: "original",
  color: "#123456",
  width: 3,
  points: [
    { x: 30, y: 40, pressure: 0.4 },
    { x: 70, y: 90, pressure: 0.8 },
  ],
};
const legacy: Backup = {
  format: "my-pastel-planner",
  schemaVersion: 1,
  layoutVersion: 1,
  appVersion: "0.2.0",
  exportedAt: "2026-10-25T15:00:00Z",
  settings: { view: initialView },
  pages: [{ id: pageIds(initialView)[0], strokes: [stroke] }],
};
function customized(): Backup {
  const copy = duplicateSpread(
    initialView,
    "lined",
    "Ideas",
    Object.fromEntries(legacy.pages.map((p) => [p.id, p])),
  );
  const order = plannerOrder(legacy.settings);
  order.splice(2, 0, copy.view);
  return {
    ...legacy,
    schemaVersion: 2,
    pages: [...structuredClone(legacy.pages), ...copy.pages],
    settings: {
      view: copy.view,
      order,
      inserts: [copy.insert],
      bookmarks: [spreadId(copy.view)],
    },
  };
}
test("legacy backups stay readable and duplicate ink is independently editable", () => {
  assert.deepEqual(validateBackup(legacy), legacy);
  const b = customized();
  assert.notEqual(b.pages[0].id, b.pages[1].id);
  assert.notEqual(b.pages[0].strokes[0].id, b.pages[1].strokes[0].id);
  b.pages[1].strokes[0].points[0].x = 99;
  assert.equal(b.pages[0].strokes[0].points[0].x, 30);
  b.pages[1].strokes[0].tool = "highlighter";
  b.pages[1].strokes[0].width = 18;
  b.pages[0].strokes[0].tool = "pencil";
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(b))), b);
});
test("custom backups reject dangling references, duplicate ordering and invalid tools", () => {
  for (const mutate of [
    (b: Backup) => b.settings.order!.push(b.settings.order![0]),
    (b: Backup) => (b.settings.inserts = []),
    (b: Backup) => (b.settings.bookmarks = ["missing"]),
    (b: Backup) => (b.pages[1].id = "custom:missing:left"),
    (b: Backup) => (b.settings.inserts![0].source = b.settings.view),
    (b: Backup) => (b.pages[0].strokes[0].tool = "bogus" as any),
    (b: Backup) => (b.schemaVersion = 1),
  ]) {
    const b = customized();
    mutate(b);
    assert.throws(() => validateBackup(b));
  }
});
test("reordering keeps identities, adds missing years and never duplicates calendar spreads", () => {
  const b = customized();
  const order = b.settings.order!;
  const [first] = order.splice(0, 1);
  order.splice(8, 0, first);
  assert.deepEqual(plannerOrder(b.settings), order);
  const expanded = plannerOrder({
    ...b.settings,
    view: { mode: "week", date: "2028-01-01" },
  });
  assert.equal(new Set(expanded.map(spreadId)).size, expanded.length);
  assert.ok(expanded.some((v) => v.date === "2028-12-01"));
  assert.equal(order[8], first);
  assert.deepEqual(b.pages[0], legacy.pages[0]);
});
test("selected strokes move as a group within paper bounds without mutating originals", () => {
  const list = [
    structuredClone(stroke),
    { ...structuredClone(stroke), id: "other" },
  ];
  const moved = translateStrokes(list, new Set(["original"]), 1000, -1000);
  assert.deepEqual(
    moved[0].points.map((p) => [p.x, p.y]),
    [
      [560, 0],
      [600, 50],
    ],
  );
  assert.deepEqual(moved[1], list[1]);
  assert.deepEqual(list[0], stroke);
  assert.equal(moved[0].points[1].pressure, 0.8);
  const group = translateStrokes(
    list,
    new Set(["original", "other"]),
    -1000,
    1000,
  );
  assert.deepEqual(group[0].points, group[1].points);
  assert.deepEqual(
    group[0].points.map((p) => [p.x, p.y]),
    [
      [0, 750],
      [40, 800],
    ],
  );
});
test("organization transaction migrates legacy content and rolls back failed deletes", async () => {
  await replacePlanner(legacy);
  const b = customized();
  await saveOrganization(b.settings, b.pages.slice(1));
  let saved = await loadPlanner();
  assert.deepEqual(saved.settings, b.settings);
  assert.equal(saved.pages.length, 3);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: any[]) {
    if (this.name === "settings") throw Error("simulated disk full");
    return original.apply(this, args as any);
  };
  try {
    await assert.rejects(
      saveOrganization(legacy.settings, [], pageIds(b.settings.view)),
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  saved = await loadPlanner();
  assert.equal(saved.pages.length, 3);
  assert.deepEqual(saved.settings, b.settings);
  await saveOrganization(
    {
      ...b.settings,
      view: initialView,
      inserts: [],
      bookmarks: [],
      order: b.settings.order!.filter((v) => !v.insert),
    },
    [],
    pageIds(b.settings.view),
  );
  assert.deepEqual((await loadPlanner()).pages, legacy.pages);
  await replacePlanner(b);
  assert.deepEqual((await loadPlanner()).settings, b.settings);
});

test("page turning expands both year boundaries and preserves custom organization", () => {
  for (const direction of [-1, 1]) {
    const b = customized();
    const originalOrder = structuredClone(b.settings.order!);
    let settings = b.settings;
    for (let crossing = 0; crossing < 3; crossing++) {
      const order = settings.order!;
      settings.view = direction > 0 ? order[order.length - 1] : order[0];
      const edge = settings.view.date;
      const next = turnDestination(settings, direction)!;
      assert.ok(next);
      assert.ok(direction > 0 ? next.date > edge : next.date < edge);
      settings = { ...settings, view: next };
      settings.order = plannerOrder(settings);
      assert.equal(
        new Set(settings.order.map(spreadId)).size,
        settings.order.length,
      );
      const index = settings.order.findIndex(
        (v) => spreadId(v) === spreadId(next),
      );
      assert.ok(index >= 0);
      assert.deepEqual(
        turnDestination(settings, -direction),
        order[direction > 0 ? order.length - 1 : 0],
      );
    }
    assert.deepEqual(
      settings.order!.filter((v) =>
        originalOrder.some((o) => spreadId(o) === spreadId(v)),
      ),
      originalOrder,
    );
    assert.deepEqual(settings.inserts, b.settings.inserts);
    assert.deepEqual(settings.bookmarks, b.settings.bookmarks);
    assert.deepEqual(b.pages[0], legacy.pages[0]);
  }
});

test("weekly and monthly turns without custom ordering cross years and leap day", () => {
  assert.deepEqual(
    turnDestination({ view: { mode: "week", date: "2027-12-26" } }, 1),
    { mode: "week", date: "2028-01-02" },
  );
  assert.deepEqual(
    turnDestination({ view: { mode: "week", date: "2028-01-02" } }, -1),
    { mode: "week", date: "2027-12-26" },
  );
  assert.deepEqual(
    turnDestination({ view: { mode: "week", date: "2028-02-27" } }, 1),
    { mode: "week", date: "2028-03-05" },
  );
});
