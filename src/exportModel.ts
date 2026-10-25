import { plannerOrder, spreadId, type Backup, type View } from "./model";

// Include ink outside the active year, even if no organization was ever saved.
// Saved ordering is authoritative; previously unlisted ink is appended once.
export function exportViews(data: Backup, scope: "current" | "binder"): View[] {
  if (scope === "current") return [data.settings.view];
  const views = plannerOrder(data.settings);
  const seen = new Set(views.map(spreadId));
  for (const page of data.pages) {
    const match = /^(month|week):(\d{4}-\d{2}-\d{2}):/.exec(page.id);
    if (!match) continue;
    const view: View = { mode: match[1] as View["mode"], date: match[2] };
    if (!seen.has(spreadId(view))) {
      views.push(view);
      seen.add(spreadId(view));
    }
  }
  return views;
}
