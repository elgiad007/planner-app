import { validateStamps } from "./validateStamps";
export type Point = { x: number; y: number; pressure: number };
export type Stroke = {
  id: string;
  tool?: "pen" | "highlighter" | "pencil";
  color: string;
  width: number;
  points: Point[];
};
export type TextBlock = {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};
export type Stamp = {
  id: string;
  name: string;
  strokes: Stroke[];
  hidden?: boolean;
};
export type StampPlacement = {
  id: string;
  stampId: string;
  x: number;
  y: number;
};
export type Page = {
  id: string;
  strokes: Stroke[];
  textBlocks?: TextBlock[];
  stamps?: StampPlacement[];
};
export type Insert =
  "blank" | "lined" | "dot-grid" | "checklist" | "sketchbook";
export type CustomSpread = {
  id: string;
  template: Insert;
  title: string;
  source?: View;
};
export type View = { mode: "month" | "week"; date: string; insert?: string };
export const DEFAULT_PREFERENCES = {
  tool: "pen" as
    | "pen"
    | "eraser"
    | "browse"
    | "highlighter"
    | "pencil"
    | "select"
    | "text"
    | "stamp",
  inkColor: "#4b4659",
  highlighterColor: "#ffff00",
  inkWidth: 2.5,
  highlighterWidth: 24,
  textFontSize: 24,
};
export type ToolPreferences = typeof DEFAULT_PREFERENCES;
export type Settings = {
  stamps?: Stamp[];
  plannerName?: string;
  preferences?: Partial<ToolPreferences>;
  showHolidays?: boolean;
  view: View;
  lastBackup?: string;
  order?: View[];
  inserts?: CustomSpread[];
  bookmarks?: string[];
  bookmarkNames?: Record<string, string>;
};
export function cleanBookmarkName(name: string) {
  return name.normalize("NFC").trim().replace(/\s+/gu, " ");
}
export function bookmarkNameKey(name: string) {
  return cleanBookmarkName(name).toLowerCase();
}
export function bookmarkNameError(name: string): string | null {
  const clean = cleanBookmarkName(name);
  if (!clean || clean.length > 60) return "Use 1–60 characters.";
  if (!/^[\p{L}\p{M}\p{N} _'&().,:-]+$/u.test(clean))
    return "Use letters, numbers, spaces, or - _ ' & ( ) . , :";
  return null;
}
// Reserve custom names first, then give unnamed legacy bookmarks unique defaults.
export function resolvedBookmarkNames(
  settings: Settings,
): Record<string, string> {
  const names: Record<string, string> = {};
  const used = new Set<string>();
  const views = new Map(plannerOrder(settings).map((v) => [spreadId(v), v]));
  for (const id of settings.bookmarks ?? []) {
    const name = settings.bookmarkNames?.[id];
    if (name !== undefined) {
      names[id] = name;
      used.add(bookmarkNameKey(name));
    }
  }
  for (const id of settings.bookmarks ?? []) {
    if (names[id] !== undefined) continue;
    const view = views.get(id);
    const base = (view ? spreadTitle(view, settings.inserts) : "Bookmark")
      .normalize("NFC")
      .replace(/[^\p{L}\p{M}\p{N} _'&().,:-]/gu, " ");
    const title = cleanBookmarkName(base).slice(0, 60).trim() || "Bookmark";
    let name = title;
    for (let n = 2; used.has(bookmarkNameKey(name)); n++) {
      const suffix = ` (${n})`;
      name = title.slice(0, 60 - suffix.length).trimEnd() + suffix;
    }
    names[id] = name;
    used.add(bookmarkNameKey(name));
  }
  return names;
}
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
    throw Error("This is not a supported planner file. No data was changed.");
  if (
    b.settings.plannerName !== undefined &&
    (typeof b.settings.plannerName !== "string" ||
      !b.settings.plannerName.trim() ||
      b.settings.plannerName.length > 100)
  )
    throw Error("Planner name must contain 1 to 100 characters.");
  if (
    b.settings.lastBackup !== undefined &&
    (typeof b.settings.lastBackup !== "string" ||
      !Number.isFinite(Date.parse(b.settings.lastBackup)))
  )
    throw Error("Invalid file download date.");
  if (
    b.settings.showHolidays !== undefined &&
    typeof b.settings.showHolidays !== "boolean"
  )
    throw Error("Invalid holiday visibility setting.");
  const preferences = b.settings.preferences;
  if (preferences !== undefined) {
    if (
      !preferences ||
      typeof preferences !== "object" ||
      Array.isArray(preferences)
    )
      throw Error("Invalid tool preferences.");
    if (
      preferences.tool !== undefined &&
      ![
        "pen",
        "eraser",
        "browse",
        "highlighter",
        "pencil",
        "select",
        "text",
        "stamp",
      ].includes(preferences.tool)
    )
      throw Error("Invalid selected tool.");
    for (const key of ["inkColor", "highlighterColor"] as const) {
      const value = preferences[key];
      if (
        value !== undefined &&
        (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
      )
        throw Error("Invalid tool color.");
    }
    for (const [key, min, max] of [
      ["inkWidth", 1, 6],
      ["highlighterWidth", 12, 48],
      ["textFontSize", 8, 96],
    ] as const) {
      const value = preferences[key];
      if (
        value !== undefined &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < min ||
          value > max)
      )
        throw Error("Invalid tool size.");
    }
  }
  if (b.pages.length > 20000)
    throw Error("Planner file contains too many pages.");
  const inserts = b.settings.inserts ?? [];
  const library = b.settings.stamps ?? [];
  validateStamps(library);
  const stampIds = new Set(library.map((s) => s.id));
  const order = b.settings.order ?? [];
  const bookmarks = b.settings.bookmarks ?? [];
  const bookmarkNames = b.settings.bookmarkNames;
  if (bookmarkNames !== undefined) {
    if (
      !bookmarkNames ||
      typeof bookmarkNames !== "object" ||
      Array.isArray(bookmarkNames)
    )
      throw Error("Invalid bookmark names.");
    const usedNames = new Set<string>();
    for (const [id, name] of Object.entries(bookmarkNames)) {
      if (
        !Array.isArray(bookmarks) ||
        !bookmarks.includes(id) ||
        typeof name !== "string" ||
        bookmarkNameError(name)
      )
        throw Error("Invalid bookmark name.");
      const key = bookmarkNameKey(name);
      if (usedNames.has(key)) throw Error("Bookmark names must be unique.");
      usedNames.add(key);
    }
  }
  if (
    b.schemaVersion === 1 &&
    (inserts.length ||
      order.length ||
      bookmarks.length ||
      (bookmarkNames && Object.keys(bookmarkNames).length) ||
      b.settings.view.insert)
  )
    throw Error("Custom pages require a version 2 planner file.");
  if (
    !Array.isArray(inserts) ||
    inserts.length > 5000 ||
    !Array.isArray(order) ||
    order.length > 20000 ||
    !Array.isArray(bookmarks) ||
    bookmarks.length > 20000
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
    inserts.some((i) => !orderIds.has(`custom:${i.id}`)) ||
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
      throw Error("Planner file contains invalid or duplicate pages.");
    if (p.textBlocks !== undefined) {
      if (!Array.isArray(p.textBlocks) || p.textBlocks.length > 1000)
        throw Error("Invalid text blocks.");
      const seen = new Set<string>();
      for (const t of p.textBlocks) {
        if (
          !t ||
          typeof t.id !== "string" ||
          !t.id ||
          t.id.length > 100 ||
          seen.has(t.id) ||
          typeof t.text !== "string" ||
          t.text.length > 10000 ||
          typeof t.color !== "string" ||
          !/^#[0-9a-f]{6}$/i.test(t.color) ||
          ![t.x, t.y, t.width, t.height, t.fontSize].every(Number.isFinite) ||
          t.x < 0 ||
          t.y < 0 ||
          t.width < 40 ||
          t.height < 30 ||
          t.x + t.width > WIDTH ||
          t.y + t.height > HEIGHT ||
          t.fontSize < 8 ||
          t.fontSize > 96
        )
          throw Error("Invalid text block.");
        seen.add(t.id);
      }
    }
    if (p.stamps !== undefined) {
      if (!Array.isArray(p.stamps) || p.stamps.length > 1000)
        throw Error("Invalid stamp placements.");
      const seen = new Set<string>();
      for (const item of p.stamps) {
        if (
          !item ||
          typeof item.id !== "string" ||
          !item.id ||
          item.id.length > 100 ||
          seen.has(item.id) ||
          !stampIds.has(item.stampId) ||
          ![item.x, item.y].every(Number.isFinite) ||
          item.x < 0 ||
          item.y < 0 ||
          item.x > WIDTH - 200 ||
          item.y > HEIGHT - 200
        )
          throw Error("Invalid stamp placement.");
        seen.add(item.id);
      }
    }
    ids.add(p.id);
    const strokeIds = new Set<string>();
    for (const s of p.strokes) {
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        s.id.length > 100 ||
        strokeIds.has(s.id) ||
        typeof s.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(s.color) ||
        !Number.isFinite(s.width) ||
        s.width < 0.5 ||
        s.width > (s.tool === "highlighter" ? 48 : 20) ||
        (s.tool !== undefined &&
          !["pen", "highlighter", "pencil"].includes(s.tool)) ||
        !Array.isArray(s.points) ||
        !s.points.length
      )
        throw Error("Planner file contains invalid handwriting.");
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
          throw Error(
            "Planner file contains invalid or excessive stroke points.",
          );
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
      ...(p.stamps
        ? {
            stamps: p.stamps.map(({ id, stampId, x, y }) => ({
              id,
              stampId,
              x,
              y,
            })),
          }
        : {}),
      ...(p.textBlocks
        ? {
            textBlocks: p.textBlocks.map((t) => ({
              id: t.id,
              text: t.text,
              color: t.color,
              x: t.x,
              y: t.y,
              width: t.width,
              height: t.height,
              fontSize: t.fontSize,
            })),
          }
        : {}),
      strokes: p.strokes.map((s) => ({
        id: s.id,
        color: s.color,
        width: s.width,
        ...(s.tool ? { tool: s.tool } : {}),
        points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      })),
    })),
    settings: {
      ...(b.settings.stamps !== undefined
        ? {
            stamps: library.map((stamp) => ({
              id: stamp.id,
              name: stamp.name.trim(),
              ...(stamp.hidden !== undefined ? { hidden: stamp.hidden } : {}),
              strokes: stamp.strokes.map((s) => ({
                id: s.id,
                color: s.color,
                width: s.width,
                points: s.points.map(({ x, y, pressure }) => ({
                  x,
                  y,
                  pressure,
                })),
              })),
            })),
          }
        : {}),
      ...(b.settings.plannerName !== undefined
        ? { plannerName: b.settings.plannerName.trim() }
        : {}),
      view: cleanView(b.settings.view),
      ...(preferences !== undefined
        ? {
            preferences: Object.fromEntries(
              Object.keys(DEFAULT_PREFERENCES)
                .filter((key) =>
                  Object.prototype.hasOwnProperty.call(preferences, key),
                )
                .map((key) => [key, preferences[key as keyof ToolPreferences]]),
            ),
          }
        : {}),
      ...(b.settings.showHolidays !== undefined
        ? { showHolidays: b.settings.showHolidays }
        : {}),
      ...(b.settings.lastBackup ? { lastBackup: b.settings.lastBackup } : {}),
      ...(b.schemaVersion === 2
        ? {
            inserts: inserts.map((i) => ({
              id: i.id,
              template: i.template,
              title: i.title,
              ...(i.source ? { source: cleanView(i.source) } : {}),
            })),
            order: order.map(cleanView),
            bookmarks: [...bookmarks],
            ...(bookmarkNames !== undefined
              ? {
                  bookmarkNames: Object.fromEntries(
                    Object.entries(bookmarkNames).map(([id, name]) => [
                      id,
                      cleanBookmarkName(name),
                    ]),
                  ),
                }
              : {}),
          }
        : {}),
    },
  };
}
function cleanView(v: View): View {
  return {
    mode: v.mode,
    date: v.date,
    ...(v.insert ? { insert: v.insert } : {}),
  };
}
// Explicit additive format migration; never alters page IDs, coordinates or tools.
export function migrateBackup(raw: unknown): Backup {
  const data = validateBackup(raw);
  return {
    ...data,
    schemaVersion: 2,
    settings: {
      ...data.settings,
      inserts: data.settings.inserts ?? [],
      order: data.settings.order ?? [],
      bookmarks: data.settings.bookmarks ?? [],
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
export function spreadHasContent(v: View, pages: Record<string, Page>) {
  return pageIds(v).some((id) => {
    const page = pages[id];
    return (
      page?.strokes.some((s) => s.points.length > 0) ||
      (page?.stamps?.length ?? 0) > 0 ||
      page?.textBlocks?.some((t) => t.text.trim().length > 0) ||
      false
    );
  });
}
export function contentIndex(settings: Settings, pages: Record<string, Page>) {
  const order = plannerOrder(settings);
  const occupied = order.filter((v) => spreadHasContent(v, pages));
  const months = new Set<string>();
  for (const v of occupied) {
    months.add(v.date.slice(0, 7));
    if (!v.insert && v.mode === "week") {
      months.add(sunday(v.date).slice(0, 7));
      months.add(addDays(sunday(v.date), 6).slice(0, 7));
    }
  }
  const current = order.findIndex(
    (v) => spreadId(v) === spreadId(settings.view),
  );
  return {
    months,
    previous: order
      .slice(0, current)
      .reverse()
      .find((v) => spreadHasContent(v, pages)),
    next: order.slice(current + 1).find((v) => spreadHasContent(v, pages)),
  };
}
export function spreadTitle(v: View, inserts: CustomSpread[] = []) {
  return v.insert
    ? (inserts.find((i) => i.id === v.insert)?.title ?? "Insert")
    : `${v.mode === "month" ? "Month" : "Week"} · ${v.mode === "month" ? monthStart(v.date) : sunday(v.date)}`;
}
export function plannerOrder(settings: Settings): View[] {
  const order = [...(settings.order ?? [])];
  const known = new Set(order.map(spreadId));
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
    const missing = generated.filter((v) => !known.has(spreadId(v)));
    for (const v of missing) known.add(spreadId(v));
    const calendar = order.filter((v) => !v.insert);
    if (
      calendar.length &&
      missing.length &&
      missing.every((v) => calendar.every((o) => o.date > v.date))
    )
      order.unshift(...missing);
    else order.push(...missing);
  }
  return order;
}
export function restoreOriginalOrder(order: View[]): View[] {
  const calendar = order
    .filter((v) => !v.insert)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.mode.localeCompare(b.mode),
    );
  let index = 0;
  return order.map((v) => (v.insert ? v : calendar[index++]));
}
export function turnDestination(
  settings: Settings,
  direction: number,
): View | undefined {
  const order = settings.order;
  const index =
    order?.findIndex((v) => spreadId(v) === spreadId(settings.view)) ?? -1;
  if (!order || index < 0)
    return moveView(
      { mode: settings.view.mode, date: settings.view.date },
      direction,
    );
  const neighbor = order[index + direction];
  if (neighbor) return neighbor;
  const dates = order
    .filter((v) => !v.insert)
    .map((v) => v.date)
    .sort();
  if (!dates.length) return;
  const edge = direction > 0 ? dates[dates.length - 1] : dates[0];
  // A year's first weekly spread can begin in December of the previous year.
  const boundary =
    direction > 0
      ? moveView({ mode: "month", date: edge }, 1)
      : moveView({ mode: "week", date: edge }, -1);
  if (!validView(boundary)) return;
  const expanded = plannerOrder({ ...settings, view: boundary });
  const added = expanded.filter(
    (v) => !order.some((o) => spreadId(o) === spreadId(v)),
  );
  return direction > 0 ? added[0] : added[added.length - 1];
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
    stamps: (pages[pageIds(view)[side]]?.stamps ?? []).map((s) => ({
      ...s,
      id: crypto.randomUUID(),
    })),
    textBlocks: (pages[pageIds(view)[side]]?.textBlocks ?? []).map((t) => ({
      ...t,
      id: crypto.randomUUID(),
    })),
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
