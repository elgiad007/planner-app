import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { SaveQueue } from "../src/saveQueue.ts";
import { exportViews } from "../src/exportModel.ts";
import {
  migrateBackup,
  validateBackup,
  initialView,
  pageIds,
  spreadId,
  type Backup,
} from "../src/model.ts";
import {
  replacePlanner,
  loadPlanner,
  savePage,
  readPlannerRecords,
} from "../src/storage.ts";
import { openDB } from "idb";

const backup: Backup = {
  format: "my-pastel-planner",
  schemaVersion: 1,
  layoutVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-10-25T12:00:00Z",
  settings: { view: initialView },
  pages: [
    {
      id: pageIds(initialView)[0],
      strokes: [
        {
          id: "original",
          color: "#123456",
          width: 3,
          points: [{ x: 120, y: 150, pressure: 0.8 }],
        },
      ],
    },
  ],
};
test("backups migrate additively; unsupported formats and invalid dates cannot replace ink", async () => {
  const migrated = migrateBackup(backup);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.pages, backup.pages);
  assert.deepEqual(migrateBackup(migrated), migrated);
  await replacePlanner(backup);
  for (const mutation of [
    (b: any) => (b.schemaVersion = 99),
    (b: any) => (b.layoutVersion = 2),
    (b: any) => (b.settings.lastBackup = {}),
    (b: any) => (b.pages[0].strokes[0].points[0].pressure = Infinity),
  ]) {
    const bad = structuredClone(backup);
    mutation(bad);
    await assert.rejects(replacePlanner(bad));
    assert.deepEqual((await loadPlanner()).pages, backup.pages);
  }
});
test("interrupted replacement rolls back the clear, all page puts and settings", async () => {
  await replacePlanner(backup);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: any[]) {
    const request = put.apply(this, args as any);
    if (this.name === "settings") this.transaction.abort();
    return request;
  };
  try {
    await assert.rejects(replacePlanner({ ...backup, pages: [] }));
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.deepEqual((await loadPlanner()).pages, backup.pages);
  assert.deepEqual((await loadPlanner()).settings, backup.settings);
});
test("invalid persisted records are reported without repairing or deleting them", async () => {
  await replacePlanner(backup);
  const page = structuredClone(backup.pages[0]);
  page.strokes[0].points[0].x = -1;
  await savePage(page);
  await assert.rejects(loadPlanner(), /invalid/);
  await assert.rejects(loadPlanner(), /invalid/);
  await replacePlanner(backup);
  assert.deepEqual((await loadPlanner()).pages, backup.pages);
});
test("future local schemas are preserved and blocked; legacy records still open", async () => {
  await replacePlanner(backup);
  const db = await openDB("my-pastel-planner", 1);
  await db.put(
    "settings",
    { ...backup.settings, dataSchemaVersion: 99 },
    "main",
  );
  await assert.rejects(loadPlanner(), /different app version/);
  assert.equal((await readPlannerRecords()).settings.dataSchemaVersion, 99);
  assert.deepEqual((await readPlannerRecords()).pages, backup.pages);
  await db.put("settings", backup.settings, "main");
  assert.deepEqual((await loadPlanner()).pages, backup.pages);
  db.close();
});
test("slow saves coalesce per page while preserving the active write and other records", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const written: string[] = [],
    errors: unknown[] = [];
  const queue = new SaveQueue((e) => errors.push(e));
  const first = queue.enqueue("left", async () => {
    await gate;
    written.push("left-1");
  });
  await Promise.resolve();
  for (let i = 2; i <= 1000; i++)
    queue.enqueue("left", async () => {
      written.push(`left-${i}`);
    });
  queue.enqueue("right", async () => {
    written.push("right");
  });
  queue.enqueue("settings", async () => {
    throw Error("storage full");
  });
  release();
  await first;
  assert.deepEqual(written, ["left-1", "left-1000", "right"]);
  assert.equal(errors.length, 1);
  await queue.enqueue("settings", async () => {
    written.push("retry");
  });
  assert.equal(written.at(-1), "retry");
});
test("binder export keeps saved order and includes ink in previously visited years", () => {
  const b = migrateBackup(backup);
  b.settings.order = [{ mode: "week", date: "2027-01-03" }, initialView];
  b.pages.push({ id: "month:2028-05-01:right", strokes: [] });
  const views = exportViews(b, "binder");
  assert.deepEqual(views.slice(0, 2), b.settings.order);
  assert.ok(views.some((v) => v.date === "2028-05-01"));
  assert.equal(new Set(views.map(spreadId)).size, views.length);
  assert.deepEqual(exportViews(b, "current"), [initialView]);
});
test("large backup round trip preserves 200,000 points and 1,000 custom spreads", async () => {
  const b = migrateBackup(backup);
  b.settings.inserts = [];
  b.settings.order = [initialView];
  b.pages = [];
  for (let i = 0; i < 1000; i++) {
    const view = { ...initialView, insert: `load-${i}` };
    b.settings.inserts.push({
      id: view.insert,
      template: "lined",
      title: `Notes ${i}`,
    });
    b.settings.order.push(view);
    b.pages.push({
      id: pageIds(view)[0],
      strokes: [
        {
          ...backup.pages[0].strokes[0],
          points: Array.from({ length: 200 }, (_, n) => ({
            x: n,
            y: n * 2,
            pressure: 0.5,
          })),
        },
      ],
    });
  }
  const start = performance.now();
  const checked = validateBackup(JSON.parse(JSON.stringify(b)));
  await replacePlanner(checked);
  const loaded = await loadPlanner();
  assert.equal(loaded.pages.length, 1000);
  assert.deepEqual(loaded.settings, checked.settings);
  assert.equal(
    loaded.pages.reduce((n, p) => n + p.strokes[0].points.length, 0),
    200000,
  );
  console.log(
    `Large backup validate/save/load: ${Math.round(performance.now() - start)} ms`,
  );
});
