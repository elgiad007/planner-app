import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { migrateBackup, type Backup } from "../src/model.ts";
import { replacePlanner, loadPlanner } from "../src/storage.ts";
const file = (): Backup => ({
  format: "my-pastel-planner",
  schemaVersion: 2,
  layoutVersion: 1,
  appVersion: "test",
  exportedAt: new Date().toISOString(),
  pages: [],
  settings: { view: { mode: "month", date: "2027-01-01" } },
});
test("named planners survive file opening and local reload; legacy files remain valid", async () => {
  for (const name of ["Work Planner", "Personal 🌸"]) {
    const data = file();
    data.settings.plannerName = name;
    await replacePlanner(migrateBackup(JSON.parse(JSON.stringify(data))));
    assert.equal((await loadPlanner()).settings.plannerName, name);
  }
  for (const version of [1, 2] as const) {
    const data = file();
    data.schemaVersion = version;
    assert.equal(migrateBackup(data).settings.plannerName, undefined);
  }
});
test("invalid names cannot replace the active planner", async () => {
  const original = file();
  original.settings.plannerName = "Keep me";
  await replacePlanner(original);
  for (const name of [null, 42, "", "   ", "x".repeat(101)]) {
    const data = file();
    data.settings.plannerName = name as any;
    await assert.rejects(replacePlanner(data));
    assert.equal((await loadPlanner()).settings.plannerName, "Keep me");
  }
});
