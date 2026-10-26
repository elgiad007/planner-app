import { holidayNames } from "./holidays";
import {
  DAYS,
  MONTHS,
  monthCells,
  parseDate,
  sunday,
  addDays,
  type View,
  type CustomSpread,
} from "./model";
export function Template({
  view,
  side,
  onWeek,
  insert,
  showHolidays = true,
  plannerName = "My Pastel Planner",
}: {
  showHolidays?: boolean;
  plannerName?: string;
  insert?: CustomSpread;
  view: View;
  side: number;
  onWeek: (s: string) => void;
}) {
  if (insert?.source)
    return (
      <Template
        plannerName={plannerName}
        view={insert.source}
        side={side}
        onWeek={onWeek}
        showHolidays={showHolidays}
      />
    );
  if (insert)
    return (
      <div className="template custom-template">
        <header>
          <span className="eyebrow">A LITTLE ROOM FOR YOU</span>
          <h1>{insert.title}</h1>
        </header>
        <svg
          className="insert-paper"
          viewBox="0 0 600 650"
          preserveAspectRatio="none"
          aria-label={`${insert.template} paper`}
        >
          {insert.template === "lined" || insert.template === "checklist"
            ? Array.from({ length: 21 }, (_, i) => (
                <g key={i}>
                  <line
                    x1={insert.template === "checklist" ? 58 : 0}
                    x2="600"
                    y1={24 + i * 30}
                    y2={24 + i * 30}
                    stroke="#d8d1c7"
                    strokeWidth="1"
                  />
                  {insert.template === "checklist" && (
                    <rect
                      x="12"
                      y={9 + i * 30}
                      width="14"
                      height="14"
                      rx="2"
                      fill="none"
                      stroke="#a69da8"
                    />
                  )}
                </g>
              ))
            : null}
          {insert.template === "dot-grid" && (
            <>
              <defs>
                <pattern
                  id={`dots-${side}`}
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="12" cy="12" r="1.2" fill="#bcb3ba" />
                </pattern>
              </defs>
              <rect width="600" height="650" fill={`url(#dots-${side})`} />
            </>
          )}
          {insert.template === "sketchbook" && (
            <rect
              x="2"
              y="2"
              width="596"
              height="646"
              rx="8"
              fill="none"
              stroke="#d8d1c7"
              strokeWidth="1"
            />
          )}
        </svg>
        <footer>
          {side === 0 ? "Ideas have room to grow." : "Make something lovely."}
        </footer>
      </div>
    );
  const d = parseDate(view.date),
    month = d.getUTCMonth();
  if (view.mode === "month") {
    const cells = monthCells(view.date);
    const cols = side === 0 ? [0, 1, 2, 3] : [4, 5, 6, 7];
    return (
      <div className="template">
        <header className="dated-header">
          <span className="eyebrow planner-page-title" title={plannerName}>
            {plannerName}
          </span>
          <h1 aria-label={`${MONTHS[month]} ${d.getUTCFullYear()}`}>
            {MONTHS[month]}
          </h1>
          <span className="header-year" aria-hidden="true">
            {d.getUTCFullYear()}
          </span>
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
                    {col < 7 && showHolidays && (
                      <div className="holiday-label">
                        {holidayNames(date).map((name) => (
                          <div key={name}>{name}</div>
                        ))}
                      </div>
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
      <header className="dated-header">
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
        <span className="header-year">
          <span>{parseDate(start).getUTCFullYear()}</span>
          {parseDate(start).getUTCFullYear() !==
          parseDate(addDays(start, 6)).getUTCFullYear() ? (
            <span>
              <span className="year-divider"> / </span>
              {parseDate(addDays(start, 6)).getUTCFullYear()}
            </span>
          ) : null}
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
            {showHolidays && (
              <div className="holiday-label">
                {holidayNames(addDays(start, n)).map((name) => (
                  <div key={name}>{name}</div>
                ))}
              </div>
            )}
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
