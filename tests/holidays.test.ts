import { test } from "node:test";
import assert from "node:assert/strict";
import { holidayNames } from "../src/holidays.ts";
import { validateBackup } from "../src/model.ts";

test("federal holidays include actual, observed and cross-year dates", () => {
  assert.ok(holidayNames("2027-05-31").includes("Memorial Day"));
  assert.ok(holidayNames("2027-11-25").includes("Thanksgiving"));
  assert.ok(holidayNames("2027-06-18").includes("Juneteenth (observed)"));
  assert.ok(holidayNames("2027-07-04").includes("Independence Day"));
  assert.ok(holidayNames("2027-07-05").includes("Independence Day (observed)"));
  assert.deepEqual(holidayNames("2027-12-31"), [
    "New Year's Day (observed)",
    "New Year's Eve",
  ]);
  assert.ok(holidayNames("2028-05-29").includes("Memorial Day"));
});

test("common occasions follow changing years and share dates", () => {
  assert.ok(holidayNames("2027-03-28").includes("Easter Sunday"));
  assert.ok(holidayNames("2028-04-16").includes("Easter Sunday"));
  assert.ok(holidayNames("2027-03-26").includes("Good Friday"));
  assert.ok(holidayNames("2027-05-09").includes("Mother's Day"));
  assert.ok(holidayNames("2027-06-20").includes("Father's Day"));
  assert.equal(holidayNames("2027-12-24").length, 2);
  assert.deepEqual(holidayNames("2027-02-03"), []);
});

test("holiday visibility survives backups, defaults for older backups, rejects invalid values", () => {
  const backup = {
    format: "my-pastel-planner",
    schemaVersion: 2,
    layoutVersion: 1,
    appVersion: "0.4.0",
    exportedAt: new Date().toISOString(),
    pages: [],
    settings: {
      view: { mode: "month", date: "2027-01-01" },
      showHolidays: false,
    },
  };
  assert.equal(validateBackup(backup).settings.showHolidays, false);
  assert.equal(
    validateBackup({ ...backup, settings: { view: backup.settings.view } })
      .settings.showHolidays,
    undefined,
  );
  assert.throws(
    () =>
      validateBackup({
        ...backup,
        settings: { ...backup.settings, showHolidays: "false" },
      }),
    /holiday visibility/,
  );
});
