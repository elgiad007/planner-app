import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  DEFAULT_PREFERENCES,
  validateBackup,
  migrateBackup,
  type Backup,
} from "../src/model.ts";
import { replacePlanner, loadPlanner } from "../src/storage.ts";
const backup = (): Backup => ({
  format: "my-pastel-planner",
  schemaVersion: 2,
  layoutVersion: 1,
  appVersion: "test",
  exportedAt: new Date().toISOString(),
  pages: [],
  settings: { view: { mode: "month", date: "2027-01-01" } },
});
test("tool preferences survive JSON export, replacement, and reopening", async () => {
  const data = backup();
  data.settings.preferences = {
    tool: "text",
    inkColor: "#557961",
    highlighterColor: "#ff00a8",
    inkWidth: 4,
    highlighterWidth: 32,
    textFontSize: 36,
  };
  const imported = migrateBackup(JSON.parse(JSON.stringify(data)));
  await replacePlanner(imported);
  assert.deepEqual(
    (await loadPlanner()).settings.preferences,
    data.settings.preferences,
  );
});
test("older backups retain current defaults and unknown preference fields are excluded", () => {
  for (const schemaVersion of [1, 2] as const) {
    const data = backup();
    data.schemaVersion = schemaVersion;
    assert.deepEqual(
      { ...DEFAULT_PREFERENCES, ...migrateBackup(data).settings.preferences },
      DEFAULT_PREFERENCES,
    );
  }
  const data = backup();
  data.settings.preferences = { textFontSize: 30, unknown: "discard" } as any;
  assert.deepEqual(validateBackup(data).settings.preferences, {
    textFontSize: 30,
  });
});
test("invalid tool preferences are rejected before replacing stored data", async () => {
  const original = backup();
  original.settings.preferences = { textFontSize: 36 };
  await replacePlanner(original);
  for (const preferences of [
    null,
    [],
    { tool: "invalid" },
    { inkColor: "red" },
    { highlighterColor: 12 },
    { inkWidth: 0 },
    { highlighterWidth: 100 },
    { textFontSize: 97 },
    { textFontSize: NaN },
  ]) {
    const data = backup();
    data.settings.preferences = preferences as any;
    assert.throws(() => validateBackup(data));
    await assert.rejects(replacePlanner(data));
  }
  assert.deepEqual(
    (await loadPlanner()).settings.preferences,
    original.settings.preferences,
  );
});
