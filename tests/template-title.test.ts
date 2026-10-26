import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Template } from "../src/Template.tsx";
test("monthly headings use the planner name, including duplicated months and legacy defaults", () => {
  const view = { mode: "month" as const, date: "2027-01-01" };
  const render = (extra = {}) =>
    renderToStaticMarkup(
      createElement(Template, { view, side: 0, onWeek: () => {}, ...extra }),
    );
  assert.match(render(), /My Pastel Planner/);
  const named = render({ plannerName: "Work & Life" });
  assert.match(named, /Work &amp; Life/);
  assert.doesNotMatch(named, /My Pastel Planner/);
  assert.match(
    render({
      plannerName: "Work Planner",
      insert: {
        id: "copy",
        title: "January copy",
        template: "blank",
        source: view,
      },
    }),
    /Work Planner/,
  );
});
