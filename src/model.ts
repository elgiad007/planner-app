export type Point = { x: number; y: number; pressure: number };
export type Stroke = {
  id: string;
  tool?: "pen" | "highlighter" | "pencil";
  color: string;
  width: number;
  points: Point[];
};
export type Page = { id: string; strokes: Stroke[] };
export type Insert =
  "blank" | "lined" | "dot-grid" | "checklist" | "sketchbook";
export type CustomSpread = {
  id: string;
  template: Insert;
  title: string;
  source?: View;
};
export type View = { mode: "month" | "week"; date: string; insert?: string };
export type Settings = {
  view: View;
  lastBackup?: string;
  order?: View[];
  inserts?: CustomSpread[];
  bookmarks?: string[];
};
export type Backup = {
  format: "my-pastel-planner";
  schemaVersion: 1 | 2;
  appVersion: string;
  exportedAt: string;
  layoutVersion: 1;
  pages: Page[];
  settings: Settings;
};
export const WIDTH = 600,
  HEIGHT = 800;
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const initialView: View = { mode: "month", date: "2027-01-01" };
// UTC arithmetic treats dates as civil dates without daylight-saving gaps.
export function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function parseDate(s: string) {
  return new Date(s + "T12:00:00Z");
}
export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d);
}
export function sunday(s: string) {
  return addDays(s, -parseDate(s).getUTCDay());
}
export function monthStart(s: string) {
  return s.slice(0, 7) + "-01";
}
export function monthCells(s: string) {
  const start = sunday(monthStart(s));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function moveView(v: View, amount: number): View {
  if (v.mode === "week")
    return { ...v, date: addDays(sunday(v.date), 7 * amount) };
  const d = parseDate(monthStart(v.date));
  d.setUTCMonth(d.getUTCMonth() + amount);
  return { ...v, date: dateKey(d) };
}
export function pageIds(v: View) {
  if (v.insert) return [`custom:${v.insert}:left`, `custom:${v.insert}:right`];
  const key = v.mode === "month" ? monthStart(v.date) : sunday(v.date);
  return [`${v.mode}:${key}:left`, `${v.mode}:${key}:right`];
}
export function validDate(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number(s.slice(0, 4)) >= 1900 &&
    Number(s.slice(0, 4)) <= 2200 &&
    !Number.isNaN(parseDate(s).getTime()) &&
    dateKey(parseDate(s)) === s
  );
}
export function validView(v: unknown): v is View {
  const x = v as View;
  return (
    !!x &&
    ["month", "week"].includes(x.mode) &&
    validDate(x.date) &&
    (x.insert === undefined ||
      (typeof x.insert === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(x.insert)))
  );
}
export function validateBackup(raw: unknown): Backup {
  const b = raw as Backup;
  if (
    !b ||
    b.format !== "my-pastel-planner" ||
    ![1, 2].includes(b.schemaVersion) ||
    b.layoutVersion !== 1 ||
    !Array.isArray(b.pages) ||
    !validView(b.settings?.view) ||
    typeof b.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(b.exportedAt)) ||
    typeof b.appVersion !== "string"
  )
    throw Error("This is not a supported planner backup. No data was changed.");
  if (b.pages.length > 20000) throw Error("Backup contains too many pages.");
  const inserts = b.settings.inserts ?? [];
  const order = b.settings.order ?? [];
  const bookmarks = b.settings.bookmarks ?? [];
  if (
    b.schemaVersion === 1 &&
    (inserts.length ||
      order.length ||
      bookmarks.length ||
      b.settings.view.insert)
  )
    throw Error("Custom pages require a version 2 backup.");
  if (
    !Array.isArray(inserts) ||
    inserts.length > 5000 ||
    !Array.isArray(order) ||
    order.length > 20000 ||
    !Array.isArray(bookmarks)
  )
    throw Error("Invalid page organization.");
  const customIds = new Set<string>();
  for (const item of inserts) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) ||
      customIds.has(item.id) ||
      !INSERTS.includes(item.template) ||
      typeof item.title !== "string" ||
      item.title.length > 100
    )
      throw Error("Invalid custom insert.");
    if (item.source && (!validView(item.source) || item.source.insert))
      throw Error("Invalid duplicated calendar template.");
    customIds.add(item.id);
  }
  const orderIds = new Set<string>();
  for (const v of order) {
    if (
      !validView(v) ||
      (v.insert && !customIds.has(v.insert)) ||
      orderIds.has(spreadId(v))
    )
      throw Error("Invalid page ordering.");
    orderIds.add(spreadId(v));
  }
  if (
    inserts.some((i) => !order.some((v) => v.insert === i.id)) ||
    (b.settings.view.insert && !customIds.has(b.settings.view.insert)) ||
    bookmarks.some((id) => typeof id !== "string" || !orderIds.has(id)) ||
    new Set(bookmarks).size !== bookmarks.length
  )
    throw Error("Invalid page references.");
  const ids = new Set<string>();
  let count = 0;
  for (const p of b.pages) {
    const match =
      typeof p?.id === "string" &&
      /^(month|week):(\d{4}-\d{2}-\d{2}):(left|right)$/.exec(p.id);
    const custom =
      typeof p?.id === "string" &&
      /^custom:([a-zA-Z0-9-]{1,100}):(left|right)$/.exec(p.id);
    const validCalendar =
      match &&
      validDate(match[2]) &&
      (match[1] === "month"
        ? monthStart(match[2]) === match[2]
        : sunday(match[2]) === match[2]);
    const validCustom =
      b.schemaVersion === 2 && custom && customIds.has(custom[1]);
    if (
      (!validCalendar && !validCustom) ||
      ids.has(p.id) ||
      !Array.isArray(p.strokes)
    )
      throw Error("Backup contains invalid or duplicate pages.");
    ids.add(p.id);
    const strokeIds = new Set<string>();
    for (const s of p.strokes) {
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        s.id.length > 100 ||
        strokeIds.has(s.id) ||
        !/^#[0-9a-f]{6}$/i.test(s.color) ||
        !Number.isFinite(s.width) ||
        s.width < 0.5 ||
        s.width > 20 ||
        (s.tool !== undefined &&
          !["pen", "highlighter", "pencil"].includes(s.tool)) ||
        !Array.isArray(s.points) ||
        !s.points.length
      )
        throw Error("Backup contains invalid handwriting.");
      strokeIds.add(s.id);
      for (const pt of s.points) {
        if (
          ++count > 5000000 ||
          !pt ||
          !Number.isFinite(pt.x) ||
          !Number.isFinite(pt.y) ||
          pt.x < 0 ||
          pt.x > WIDTH ||
          pt.y < 0 ||
          pt.y > HEIGHT ||
          !Number.isFinite(pt.pressure) ||
          pt.pressure < 0 ||
          pt.pressure > 1
        )
          throw Error("Backup contains invalid or excessive stroke points.");
      }
    }
  }
  return {
    format: b.format,
    schemaVersion: b.schemaVersion,
    layoutVersion: 1,
    appVersion: b.appVersion,
    exportedAt: b.exportedAt,
    pages: b.pages.map((p) => ({
      id: p.id,
      strokes: p.strokes.map((s) => ({
        id: s.id,
        color: s.color,
        width: s.width,
        ...(s.tool ? { tool: s.tool } : {}),
        points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      })),
    })),
    settings: {
      view: { ...b.settings.view },
      ...(b.settings.lastBackup ? { lastBackup: b.settings.lastBackup } : {}),
      ...(b.schemaVersion === 2
        ? {
            inserts: structuredClone(inserts),
            order: structuredClone(order),
            bookmarks: [...bookmarks],
          }
        : {}),
    },
  };
}
export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitsStroke(p: Point, s: Stroke) {
  return s.points.some(
    (a, i) =>
      distanceToSegment(p, a, s.points[Math.max(0, i - 1)]) < 10 + s.width,
  );
}
export const INSERTS: Insert[] = [
  "blank",
  "lined",
  "dot-grid",
  "checklist",
  "sketchbook",
];
export function spreadId(v: View) {
  return pageIds(v)[0].replace(/:left$/, "");
}
export function spreadTitle(v: View, inserts: CustomSpread[] = []) {
  return v.insert
    ? (inserts.find((i) => i.id === v.insert)?.title ?? "Insert")
    : `${v.mode === "month" ? "Month" : "Week"} · ${v.mode === "month" ? monthStart(v.date) : sunday(v.date)}`;
}
export function plannerOrder(settings: Settings): View[] {
  const order = [...(settings.order ?? [])];
  const years = new Set([2027, parseDate(settings.view.date).getUTCFullYear()]);
  for (const year of years) {
    const generated: View[] = [];
    for (let m = 1; m <= 12; m++)
      generated.push({
        mode: "month",
        date: `${year}-${String(m).padStart(2, "0")}-01`,
      });
    for (
      let date = sunday(`${year}-01-01`);
      date <= `${year}-12-31`;
      date = addDays(date, 7)
    )
      if (validDate(date)) generated.push({ mode: "week", date });
    generated.sort(
      (a, b) => a.date.localeCompare(b.date) || a.mode.localeCompare(b.mode),
    );
    for (const v of generated)
      if (!order.some((o) => spreadId(o) === spreadId(v))) order.push(v);
  }
  return order;
}
export function duplicateSpread(
  view: View,
  template: Insert,
  title: string,
  pages: Record<string, Page>,
): { view: View; insert: CustomSpread; pages: Page[] } {
  const id = crypto.randomUUID();
  const next = { ...view, insert: id };
  const copies = pageIds(next).map((id, side) => ({
    id,
    strokes: (pages[pageIds(view)[side]]?.strokes ?? []).map((s) => ({
      ...structuredClone(s),
      id: crypto.randomUUID(),
    })),
  }));
  return { view: next, insert: { id, template, title }, pages: copies };
}
export function translateStrokes(
  strokes: Stroke[],
  selected: Set<string>,
  dx: number,
  dy: number,
): Stroke[] {
  let minX = WIDTH,
    maxX = 0,
    minY = HEIGHT,
    maxY = 0,
    found = false;
  for (const s of strokes)
    if (selected.has(s.id))
      for (const p of s.points) {
        found = true;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
  if (!found) return strokes;
  dx = Math.max(-minX, Math.min(WIDTH - maxX, dx));
  dy = Math.max(-minY, Math.min(HEIGHT - maxY, dy));
  return strokes.map((s) =>
    selected.has(s.id)
      ? {
          ...s,
          points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
        }
      : s,
  );
}
