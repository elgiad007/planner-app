import {
  addDays,
  pageIds,
  plannerOrder,
  spreadId,
  sunday,
  validDate,
  type Page,
  type Settings,
  type View,
} from "./model";

/** Include saved calendar pages outside the currently generated calendar years. */
export function stampIndex(settings: Settings, pages: Record<string, Page>) {
  const order = plannerOrder(settings);
  const known = new Set(order.map(spreadId));
  const extra = new Map<string, View>();
  for (const id of Object.keys(pages)) {
    const match = /^(month|week):(\d{4}-\d{2}-\d{2}):(left|right)$/.exec(id);
    if (!match || !validDate(match[2])) continue;
    const view: View = { mode: match[1] as "month" | "week", date: match[2] };
    if (!known.has(spreadId(view))) extra.set(spreadId(view), view);
  }
  order.push(
    ...[...extra.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.mode.localeCompare(b.mode),
    ),
  );
  const index = new Map<string, { spreads: View[]; months: Set<string> }>();
  for (const view of order) {
    const stamps = new Set(
      pageIds(view).flatMap(
        (id) => pages[id]?.stamps?.map((p) => p.stampId) ?? [],
      ),
    );
    for (const id of stamps) {
      let entry = index.get(id);
      if (!entry) index.set(id, (entry = { spreads: [], months: new Set() }));
      entry.spreads.push(view);
      entry.months.add(view.date.slice(0, 7));
      if (!view.insert && view.mode === "week") {
        entry.months.add(sunday(view.date).slice(0, 7));
        entry.months.add(addDays(sunday(view.date), 6).slice(0, 7));
      }
    }
  }
  return index;
}
