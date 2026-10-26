import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  validateBackup,
  duplicateSpread,
  spreadHasContent,
  type Backup,
} from "../src/model.ts";
import { replacePlanner, loadPlanner } from "../src/storage.ts";
import { drawStamps } from "../src/stamps.ts";

function backup(): Backup {
  return {
    format: "my-pastel-planner",
    schemaVersion: 2,
    layoutVersion: 1,
    appVersion: "test",
    exportedAt: new Date().toISOString(),
    settings: {
      view: { mode: "month", date: "2027-01-01" },
      stamps: [
        {
          id: "star",
          name: "Star",
          strokes: [
            {
              id: "s1",
              width: 3,
              color: "#4b4659",
              points: [
                { x: 0, y: 0, pressure: 0.5 },
                { x: 200, y: 200, pressure: 1 },
              ],
            },
          ],
        },
      ],
    },
    pages: [
      {
        id: "month:2027-01-01:left",
        strokes: [],
        stamps: [{ id: "p1", stampId: "star", x: 400, y: 600 }],
      },
    ],
  };
}
test("stamp library and references survive JSON and local storage; duplication gets independent placements", async () => {
  const data = validateBackup(JSON.parse(JSON.stringify(backup())));
  await replacePlanner(data);
  const local = await loadPlanner();
  assert.deepEqual(local.settings.stamps, data.settings.stamps);
  assert.deepEqual(local.pages, data.pages);
  const pages = Object.fromEntries(data.pages.map((p) => [p.id, p]));
  assert.equal(spreadHasContent(data.settings.view, pages), true);
  const copy = duplicateSpread(data.settings.view, "blank", "Copy", pages);
  assert.notEqual(copy.pages[0].stamps![0].id, "p1");
  assert.equal(copy.pages[0].stamps![0].stampId, "star");
  copy.pages[0].stamps![0].x = 0;
  assert.equal(data.pages[0].stamps![0].x, 400);
  data.settings.stamps![0].hidden = true;
  assert.equal(validateBackup(data).pages[0].stamps!.length, 1);
});
test("stamp imports reject invalid dimensions, missing references, duplicate IDs and excessive data", () => {
  const changes: ((b: Backup) => void)[] = [
    (b) => {
      b.settings.stamps![0].strokes[0].points[0].x = 201;
    },
    (b) => {
      b.settings.stamps![0].strokes[0].points[0].pressure = NaN;
    },
    (b) => {
      b.settings.stamps![0].strokes[0].width = 7;
    },
    (b) => {
      b.settings.stamps![0].strokes = [];
    },
    (b) => {
      b.settings.stamps!.push(structuredClone(b.settings.stamps![0]));
    },
    (b) => {
      b.pages[0].stamps![0].stampId = "missing";
    },
    (b) => {
      b.pages[0].stamps![0].x = 401;
    },
    (b) => {
      b.pages[0].stamps![0].y = -1;
    },
    (b) => {
      b.pages[0].stamps!.push({ ...b.pages[0].stamps![0] });
    },
  ];
  for (const change of changes) {
    const data = backup();
    change(data);
    assert.throws(() => validateBackup(data));
  }
  const legacy = backup();
  delete legacy.settings.stamps;
  delete legacy.pages[0].stamps;
  assert.doesNotThrow(() => validateBackup(legacy));
});
test("PDF stamp rendering translates and clips each shared definition, including removed stamps", () => {
  const data = backup();
  data.settings.stamps![0].hidden = true;
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args: unknown[]) =>
          calls.push({ method: String(key), args }),
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
  drawStamps(ctx, data.settings.stamps!, data.pages[0].stamps!);
  assert.ok(
    calls.some(
      (c) => c.method === "translate" && c.args[0] === 400 && c.args[1] === 600,
    ),
  );
  assert.ok(
    calls.some(
      (c) => c.method === "rect" && c.args[2] === 200 && c.args[3] === 200,
    ),
  );
  assert.ok(calls.some((c) => c.method === "stroke"));
});
