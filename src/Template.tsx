import {
  DAYS,
  MONTHS,
  monthCells,
  parseDate,
  sunday,
  addDays,
  type View,
} from "./model";
export function Template({
  view,
  side,
  onWeek,
}: {
  view: View;
  side: number;
  onWeek: (s: string) => void;
}) {
  const d = parseDate(view.date),
    month = d.getUTCMonth();
  if (view.mode === "month") {
    const cells = monthCells(view.date);
    const cols = side === 0 ? [0, 1, 2, 3] : [4, 5, 6, 7];
    return (
      <div className="template">
        <header>
          <span className="eyebrow">MY PASTEL PLANNER</span>
          <h1>
            {MONTHS[month]} <em>{d.getUTCFullYear()}</em>
          </h1>
        </header>
        <div className="calendar">
          {cols.map((col) => (
            <div className="calendar-column" key={col}>
              <div className="day-heading">{DAYS[col] ?? "Notes"}</div>
              {Array.from({ length: 6 }, (_, row) => {
                const date = cells[row * 7 + col];
                const inside =
                  col < 7 && parseDate(date).getUTCMonth() === month;
                return (
                  <div
                    className={
                      "date-cell " + (!inside && col < 7 ? "muted" : "")
                    }
                    key={row}
                  >
                    {col < 7 && (
                      <button
                        className="date-number"
                        aria-label={`Open week of ${date}`}
                        onClick={() => onWeek(date)}
                      >
                        {parseDate(date).getUTCDate()}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <footer>
          {side === 0
            ? "A little space for everything."
            : "Make room for the lovely things."}
        </footer>
      </div>
    );
  }
  const start = sunday(view.date),
    blocks = side === 0 ? [0, 1, 2] : [3, 4, 5, 6];
  return (
    <div className="template">
      <header>
        <span className="eyebrow">ONE WEEK AT A TIME</span>
        <h1>
          {parseDate(start).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}{" "}
          —{" "}
          {parseDate(addDays(start, 6)).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </h1>
        <span className="week-year">
          {parseDate(start).getUTCFullYear()}
          {parseDate(start).getUTCFullYear() !==
          parseDate(addDays(start, 6)).getUTCFullYear()
            ? ` / ${parseDate(addDays(start, 6)).getUTCFullYear()}`
            : ""}
        </span>
      </header>
      <div className="weekly">
        {side === 0 && (
          <div className="priorities">
            PRIORITIES <span>○ __________________　○ __________________</span>
          </div>
        )}
        {blocks.map((n) => (
          <section key={n} className={"weekly-day day-" + n}>
            <h2>
              {DAYS[n]} <span>{parseDate(addDays(start, n)).getUTCDate()}</span>
              <small>
                {MONTHS[parseDate(addDays(start, n)).getUTCMonth()].slice(0, 3)}
              </small>
            </h2>
            <div className="writing-lines" />
          </section>
        ))}
      </div>
      <footer>
        {side === 0
          ? "Small steps, beautiful days."
          : "Appointments · thoughts · little reminders"}
      </footer>
    </div>
  );
}
