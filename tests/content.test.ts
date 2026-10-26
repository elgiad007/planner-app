import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentIndex,
  pageIds,
  spreadHasContent,
  type Page,
  type Settings,
  type View,
} from "../src/model.ts";

test("content navigation follows binder order and updates when content is removed", () => {
  const jan: View = { mode: "month", date: "2027-01-01" };
  const week: View = { mode: "week", date: "2027-01-31" };
  const custom: View = { mode: "month", date: "2027-03-01", insert: "notes" };
  const settings: Settings = {
    view: jan,
    order: [custom, jan, week],
    inserts: [{ id: "notes", title: "Notes", template: "lined" }],
  };
  const pages: Record<string, Page> = {
    [pageIds(custom)[1]]: {
      id: pageIds(custom)[1],
      strokes: [],
      textBlocks: [
        {
          id: "text",
          text: "Hello",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          fontSize: 24,
          color: "#000000",
        },
      ],
    },
    [pageIds(week)[0]]: {
      id: pageIds(week)[0],
      strokes: [
        {
          id: "ink",
          color: "#000000",
          width: 2,
          tool: "highlighter",
          points: [{ x: 10, y: 10, pressure: 1 }],
        },
      ],
    },
  };
  const index = contentIndex(settings, pages);
  assert.deepEqual(index.previous, custom);
  assert.deepEqual(index.next, week);
  assert.deepEqual([...index.months].sort(), ["2027-01", "2027-02", "2027-03"]);
  assert.equal(spreadHasContent(jan, pages), false);
  pages[pageIds(week)[0]].strokes = [];
  assert.equal(contentIndex(settings, pages).next, undefined);
  pages[pageIds(custom)[1]].textBlocks![0].text = "  \n";
  assert.equal(contentIndex(settings, pages).months.size, 0);
});

test("navigation stops at occupied endpoints without wrapping", () => {
  const view: View = { mode: "month", date: "2027-01-01" };
  const result = contentIndex({ view }, {});
  assert.equal(result.previous, undefined);
  assert.equal(result.next, undefined);
  assert.equal(result.months.size, 0);
});
