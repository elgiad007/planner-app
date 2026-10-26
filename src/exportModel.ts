import {
  plannerOrder,
  resolvedBookmarkNames,
  spreadId,
  type Backup,
  type View,
} from "./model";

// PDF destinations are one-based sheets, each containing one binder spread.
export function exportBookmarks(data: Backup, views: View[]) {
  const bookmarked = new Set(data.settings.bookmarks ?? []);
  const names = resolvedBookmarkNames(data.settings);
  return views.flatMap((view, index) => {
    const id = spreadId(view);
    return bookmarked.has(id)
      ? [{ title: names[id], pageNumber: index + 1 }]
      : [];
  });
}

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
