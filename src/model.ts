export type Point = { x: number; y: number; pressure: number };
export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: Point[];
};
export type Page = { id: string; strokes: Stroke[] };
export type View = { mode: "month" | "week"; date: string };
export type Settings = { view: View; lastBackup?: string };
export type Backup = {
  format: "my-pastel-planner";
  schemaVersion: 1;
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
  return !!x && ["month", "week"].includes(x.mode) && validDate(x.date);
}
export function validateBackup(raw: unknown): Backup {
  const b = raw as Backup;
  if (
    !b ||
    b.format !== "my-pastel-planner" ||
    b.schemaVersion !== 1 ||
    b.layoutVersion !== 1 ||
    !Array.isArray(b.pages) ||
    !validView(b.settings?.view) ||
    typeof b.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(b.exportedAt)) ||
    typeof b.appVersion !== "string"
  )
    throw Error("This is not a supported planner backup. No data was changed.");
  if (b.pages.length > 20000) throw Error("Backup contains too many pages.");
  const ids = new Set<string>();
  let count = 0;
  for (const p of b.pages) {
    const match =
      typeof p?.id === "string" &&
      /^(month|week):(\d{4}-\d{2}-\d{2}):(left|right)$/.exec(p.id);
    if (
      !match ||
      !validDate(match[2]) ||
      (match[1] === "month"
        ? monthStart(match[2]) !== match[2]
        : sunday(match[2]) !== match[2]) ||
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
    schemaVersion: 1,
    layoutVersion: 1,
    appVersion: b.appVersion,
    exportedAt: b.exportedAt,
    pages: b.pages.map((p) => ({
      id: p.id,
      strokes: p.strokes.map((s) => ({
        id: s.id,
        color: s.color,
        width: s.width,
        points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      })),
    })),
    settings: { view: { ...b.settings.view } },
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
