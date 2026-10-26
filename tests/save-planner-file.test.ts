import { test } from "node:test";
import assert from "node:assert/strict";
import { savePlannerFile } from "../src/savePlannerFile.ts";

test("picker opens immediately and writes JSON before closing", async () => {
  const events: string[] = [];
  const saving = savePlannerFile(
    { planner: true },
    "Work.json",
    () => assert.fail(),
    {
      showSaveFilePicker: async (options) => {
        events.push("picker");
        assert.equal(options.suggestedName, "Work.json");
        return {
          createWritable: async () => ({
            write: async (blob) => {
              assert.deepEqual(JSON.parse(await blob.text()), {
                planner: true,
              });
              events.push("write");
            },
            close: async () => {
              events.push("close");
            },
          }),
        };
      },
    },
  );
  assert.deepEqual(events, ["picker"]);
  assert.equal((await saving).status, "saved");
  assert.deepEqual(events, ["picker", "write", "close"]);
});

test("cancel and write failure never trigger fallback", async () => {
  assert.equal(
    (
      await savePlannerFile({}, "planner.json", () => assert.fail(), {
        showSaveFilePicker: async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
      })
    ).status,
    "cancelled",
  );
  const failure = new Error("Disk full");
  assert.deepEqual(
    await savePlannerFile({}, "planner.json", () => assert.fail(), {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async () => {
            throw failure;
          },
          close: async () => assert.fail(),
        }),
      }),
    }),
    { status: "failed", error: failure },
  );
});

test("unsupported browsers download", async () => {
  let downloads = 0;
  const result = await savePlannerFile(
    {},
    "planner.json",
    () => {
      downloads++;
    },
    {},
  );
  assert.equal(result.status, "downloaded");
  assert.equal(downloads, 1);
});
