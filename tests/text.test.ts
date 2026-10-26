import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  validateBackup,
  duplicateSpread,
  type Backup,
  type TextBlock,
} from "../src/model.ts";
import { savePage, saveSettings, loadPlanner } from "../src/storage.ts";
const block: TextBlock = {
  id: "text-1",
  text: "A note\nSecond line",
  color: "#557961",
  x: 20,
  y: 30,
  width: 220,
  height: 100,
  fontSize: 24,
};
const backup = (): Backup => ({
  format: "my-pastel-planner",
  schemaVersion: 2,
  layoutVersion: 1,
  appVersion: "test",
  exportedAt: new Date().toISOString(),
  settings: { view: { mode: "month", date: "2027-01-01" } },
  pages: [
    {
      id: "month:2027-01-01:left",
      strokes: [],
      textBlocks: [structuredClone(block)],
    },
  ],
});
test("text survives validation, storage, and independent spread duplication", async () => {
  const data = validateBackup(JSON.parse(JSON.stringify(backup())));
  assert.deepEqual(data.pages[0].textBlocks, [block]);
  await savePage(data.pages[0]);
  await saveSettings(data.settings);
  assert.deepEqual(
    (await loadPlanner()).pages.find((p) => p.id === data.pages[0].id)
      ?.textBlocks,
    [block],
  );
  const copy = duplicateSpread(data.settings.view, "blank", "Copy", {
    [data.pages[0].id]: data.pages[0],
  });
  assert.notEqual(copy.pages[0].textBlocks![0].id, block.id);
  copy.pages[0].textBlocks![0].text = "Changed";
  assert.equal(data.pages[0].textBlocks![0].text, block.text);
});
test("invalid text blocks are rejected instead of dropped", () => {
  for (const patch of [
    { x: -1 },
    { width: 0 },
    { height: 900 },
    { fontSize: Infinity },
    { fontSize: 7 },
    { color: "red" },
    { text: 42 },
    { text: "x".repeat(10001) },
  ]) {
    const data = backup();
    Object.assign(data.pages[0].textBlocks![0], patch);
    assert.throws(() => validateBackup(data), /text block/i);
  }
  const data = backup();
  data.pages[0].textBlocks!.push({ ...block });
  assert.throws(() => validateBackup(data), /text block/i);
  const legacy = backup();
  delete legacy.pages[0].textBlocks;
  assert.equal(validateBackup(legacy).pages[0].textBlocks, undefined);
});
