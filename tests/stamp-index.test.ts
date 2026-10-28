import { test } from "node:test";
import assert from "node:assert/strict";
import { stampIndex } from "../src/stampIndex.ts";
import { type Settings, type Page } from "../src/model.ts";

test("stamp finder deduplicates facing pages, includes saved years and follows custom order", () => {
  const settings: Settings = {
    view: { mode: "month", date: "2027-01-01" },
    order: [
      { mode: "month", date: "2027-03-01", insert: "notes" },
      { mode: "week", date: "2027-01-31" },
    ],
    inserts: [{ id: "notes", title: "Notes", template: "blank" }],
    stamps: [{ id: "star", name: "Star", hidden: true, strokes: [] }],
  };
  const pages: Record<string, Page> = {};
  for (const id of [
    "custom:notes:left",
    "week:2027-01-31:left",
    "week:2027-01-31:right",
    "month:2030-06-01:left",
  ]) {
    pages[id] = {
      id,
      strokes: [],
      stamps: [1, 2].map((n) => ({
        id: String(n),
        stampId: "star",
        x: 0,
        y: 0,
      })),
    };
  }
  let matches = stampIndex(settings, pages).get("star")!;
  assert.equal(matches.spreads.length, 3);
  assert.equal(matches.spreads[0].insert, "notes");
  assert.deepEqual([...matches.months].sort(), [
    "2027-01",
    "2027-02",
    "2027-03",
    "2030-06",
  ]);
  delete pages["week:2027-01-31:left"];
  assert.equal(stampIndex(settings, pages).get("star")!.spreads.length, 3);
  delete pages["week:2027-01-31:right"];
  matches = stampIndex(settings, pages).get("star")!;
  assert.equal(matches.spreads.length, 2);
  assert.equal(matches.months.has("2027-02"), false);
  assert.equal(stampIndex(settings, {}).size, 0);
});
