import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  bookmarkNameError,
  bookmarkNameKey,
  cleanBookmarkName,
  resolvedBookmarkNames,
  initialView,
  plannerOrder,
  spreadId,
  validateBackup,
  type Backup,
} from "../src/model.ts";
import { replacePlanner, loadPlanner } from "../src/storage.ts";
import { exportBookmarks, exportViews } from "../src/exportModel.ts";

test("PDF bookmarks follow exported order, names and one-based destinations", () => {
  const b = backup();
  const [first, second] = b.settings.order!;
  b.settings.order = [second, first];
  b.settings.bookmarkNames = {
    [spreadId(first)]: "École & Plans (2027)",
    [spreadId(second)]: "Łódź",
  };
  assert.deepEqual(exportBookmarks(b, exportViews(b, "binder")), [
    { title: "Łódź", pageNumber: 1 },
    { title: "École & Plans (2027)", pageNumber: 2 },
  ]);
  b.settings.view = first;
  assert.deepEqual(exportBookmarks(b, exportViews(b, "current")), [
    { title: "École & Plans (2027)", pageNumber: 1 },
  ]);
  b.settings.bookmarks = [spreadId(second)];
  assert.deepEqual(exportBookmarks(b, exportViews(b, "current")), []);
  b.settings.bookmarkNames = undefined;
  assert.equal(
    exportBookmarks(b, exportViews(b, "binder"))[0].title,
    resolvedBookmarkNames(b.settings)[spreadId(second)],
  );
  b.settings.bookmarks = undefined;
  assert.deepEqual(exportBookmarks(b, exportViews(b, "binder")), []);
});

function backup(): Backup {
  const order = plannerOrder({ view: initialView });
  return {
    format: "my-pastel-planner",
    schemaVersion: 2,
    layoutVersion: 1,
    appVersion: "test",
    exportedAt: new Date().toISOString(),
    pages: [],
    settings: {
      view: initialView,
      order,
      bookmarks: order.slice(0, 2).map(spreadId),
    },
  };
}
test("bookmark names allow accents and limited punctuation, normalize spaces, reject invalid names", () => {
  assert.equal(
    bookmarkNameError("École & Plans (2027): notes, v.2_3-4's"),
    null,
  );
  for (const name of [
    "",
    "   ",
    "x".repeat(61),
    "Work!",
    "<script>",
    "a/b",
    "⭐",
  ])
    assert.ok(bookmarkNameError(name), name);
  assert.equal(cleanBookmarkName("  Cafe\u0301   plans  "), "Café plans");
  assert.equal(
    bookmarkNameKey("  WORK   plans "),
    bookmarkNameKey("work plans"),
  );
});
test("legacy bookmark defaults are unique and new defaults avoid existing custom names", () => {
  const b = backup();
  const [a, c] = b.settings.bookmarks!;
  const names = resolvedBookmarkNames(b.settings);
  b.settings.bookmarkNames = { [a]: names[c] };
  const resolved = resolvedBookmarkNames(b.settings);
  assert.equal(resolved[a], names[c]);
  assert.equal(resolved[c], `${names[c]} (2)`);
  assert.ok(Object.values(resolved).every((name) => !bookmarkNameError(name)));
  assert.equal(validateBackup(b).settings.bookmarkNames![a], names[c]);
});
test("bookmark import rejects duplicate names, invalid characters and dangling labels", () => {
  for (const names of [
    ["Work plans", " work   PLANS "],
    ["Work!", "Other"],
    ["", "Other"],
  ]) {
    const b = backup();
    b.settings.bookmarkNames = Object.fromEntries(
      b.settings.bookmarks!.map((id, i) => [id, names[i]]),
    );
    assert.throws(() => validateBackup(b));
  }
  const b = backup();
  b.settings.bookmarkNames = { missing: "Work" };
  assert.throws(() => validateBackup(b));
});
test("bookmark names survive JSON export, import and local reload", async () => {
  const b = backup();
  b.settings.bookmarkNames = { [b.settings.bookmarks![0]]: "École & Plans" };
  await replacePlanner(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(
    (await loadPlanner()).settings.bookmarkNames,
    b.settings.bookmarkNames,
  );
});
