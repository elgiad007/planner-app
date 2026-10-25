import { addDays, dateKey, parseDate } from "./model";

export type Holiday = { date: string; name: string };
const cache = new Map<number, Holiday[]>();

// Civil dates and UTC arithmetic keep holidays independent of device timezone.
export function holidaysForYear(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const holidays: Holiday[] = [];
  const date = (month: number, day: number, y = year) =>
    dateKey(new Date(Date.UTC(y, month - 1, day, 12)));
  const add = (date: string, name: string) => {
    if (parseDate(date).getUTCFullYear() === year)
      holidays.push({ date, name });
  };
  const nth = (month: number, weekday: number, occurrence: number) => {
    const first = date(month, 1);
    return addDays(
      first,
      ((weekday - parseDate(first).getUTCDay() + 7) % 7) + 7 * (occurrence - 1),
    );
  };
  // Include neighboring years so New Year's observed on Dec 31 is retained.
  for (const y of [year - 1, year, year + 1]) {
    for (const [month, day, name] of [
      [1, 1, "New Year's Day"],
      [6, 19, "Juneteenth"],
      [7, 4, "Independence Day"],
      [11, 11, "Veterans Day"],
      [12, 25, "Christmas Day"],
    ] as const) {
      const actual = date(month, day, y);
      add(actual, name);
      const weekday = parseDate(actual).getUTCDay();
      if (weekday === 0 || weekday === 6)
        add(addDays(actual, weekday === 6 ? -1 : 1), `${name} (observed)`);
    }
  }
  add(nth(1, 1, 3), "Martin Luther King Jr. Day");
  add(nth(2, 1, 3), "Presidents' Day");
  const mayEnd = date(5, 31);
  add(
    addDays(mayEnd, -(parseDate(mayEnd).getUTCDay() + 6) % 7),
    "Memorial Day",
  );
  add(nth(9, 1, 1), "Labor Day");
  add(nth(10, 1, 2), "Columbus Day / Indigenous Peoples' Day");
  add(nth(11, 4, 4), "Thanksgiving");
  for (const [month, day, name] of [
    [2, 14, "Valentine's Day"],
    [3, 17, "St. Patrick's Day"],
    [4, 1, "April Fools' Day"],
    [4, 22, "Earth Day"],
    [5, 5, "Cinco de Mayo"],
    [6, 14, "Flag Day"],
    [10, 31, "Halloween"],
    [12, 24, "Christmas Eve"],
    [12, 31, "New Year's Eve"],
  ] as const)
    add(date(month, day), name);
  add(nth(5, 0, 2), "Mother's Day");
  add(nth(6, 0, 3), "Father's Day");
  // Gregorian Easter (Meeus/Jones/Butcher).
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  const easter = date(Math.floor(value / 31), (value % 31) + 1);
  add(addDays(easter, -2), "Good Friday");
  add(easter, "Easter Sunday");
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, holidays);
  return holidays;
}

export function holidayNames(date: string): string[] {
  return holidaysForYear(parseDate(date).getUTCFullYear())
    .filter((holiday) => holiday.date === date)
    .map((holiday) => holiday.name);
}
