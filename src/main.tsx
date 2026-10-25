import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Ink } from "./Ink";
import { useWritingGuard } from "./useWritingGuard";
import { Template } from "./Template";
import { PageTurn } from "./PageTurn";
import {
  loadPlanner,
  savePage,
  saveSettings,
  replacePlanner,
  saveOrganization,
} from "./storage";
import {
  INSERTS,
  plannerOrder,
  spreadId,
  spreadTitle,
  duplicateSpread,
  type Insert,
  initialView,
  pageIds,
  moveView,
  parseDate,
  MONTHS,
  validView,
  validDate,
  validateBackup,
  type Page,
  type Stroke,
  type Settings,
  type View,
  type Backup,
} from "./model";
import "./style.css";

function download(data: Backup) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-pastel-planner-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function App() {
  const [pages, setPages] = useState<Record<string, Page>>({}),
    [settings, setSettings] = useState<Settings>({ view: initialView });
  const [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(""),
    [status, setStatus] = useState("Opening planner…"),
    [error, setError] = useState("");
  const [color, setColor] = useState("#4b4659"),
    [width, setWidth] = useState(2.5),
    [fingerWriting, setFingerWriting] = useState(false),
    [tool, setTool] = useState<
      "pen" | "eraser" | "browse" | "highlighter" | "pencil" | "select"
    >("pen"),
    [organize, setOrganize] = useState(false),
    [insertType, setInsertType] = useState<Insert>("lined"),
    [insertTitle, setInsertTitle] = useState(""),
    [position, setPosition] = useState<"before" | "after">("after"),
    [moveTarget, setMoveTarget] = useState(""),
    [expanded, setExpanded] = useState(true),
    [help, setHelp] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [operation, setOperation] = useState(false),
    [busy, setBusy] = useState(false),
    [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const pagesRef = useRef(pages),
    settingsRef = useRef(settings),
    busyRef = useRef(false),
    opRef = useRef(false),
    pending = useRef(0),
    failed = useRef(false),
    queue = useRef<Promise<void>>(Promise.resolve());
  const book = useWritingGuard(tool !== "browse" && !operation && ready);
  const history = useRef<{ past: Page[]; future: Page[] }>({
    past: [],
    future: [],
  });
  const input = useRef<HTMLInputElement>(null);
  const view = settings.view,
    ids = pageIds(view);
  const [turn, setTurn] = useState<{ next: View; direction: number } | null>(
    null,
  );
  const turning = useRef(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    time: number;
    edge: number;
  } | null>(null);
  const contacts = useRef(new Set<number>());
  const penUntil = useRef(0);
  useEffect(() => {
    let live = true;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const open = () =>
      loadPlanner()
        .then((data) => {
          if (!live) return;
          if (!validView(data.settings.view))
            throw Error("Saved navigation data is invalid.");
          const p = Object.fromEntries(data.pages.map((p) => [p.id, p]));
          pagesRef.current = p;
          settingsRef.current = data.settings;
          setPages(p);
          setSettings(data.settings);
          setReady(true);
          setStatus("Saved on this iPad");
        })
        .catch((e) => {
          if (live)
            setFatal(
              `Could not open local storage: ${String(e)}. Your existing data has not been replaced. Close other planner tabs and try again.`,
            );
        });
    // Hold one writer lease for this tab's lifetime so stale tabs cannot overwrite ink.
    if (navigator.locks) {
      void navigator.locks
        .request(
          "pastel-planner-writer",
          { ifAvailable: true },
          async (lease) => {
            if (!live) return;
            if (!lease) {
              setFatal(
                "This planner is already open in another tab or window. Close that copy, then try again.",
              );
              return;
            }
            await open();
            await held;
          },
        )
        .catch((e) => {
          if (live) setFatal(`Could not secure local storage: ${String(e)}`);
        });
    } else {
      void open();
      setError(
        "This browser cannot prevent simultaneous editing. Keep the planner open in only one tab.",
      );
    }
    return () => {
      live = false;
      release();
    };
  }, []);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current || failed.current || busyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (disposed) return;
        if (reg.waiting) setUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setUpdate(reg);
            else if (worker.state === "installed")
              setStatus("Saved · offline app ready");
          });
        });
      })
      .catch((e) =>
        setError(
          `Offline installation failed: ${String(e)}. Keep online and try reopening.`,
        ),
      );
    return () => {
      disposed = true;
    };
  }, []);
  function persist(work: () => Promise<void>) {
    pending.current++;
    setStatus("Saving…");
    queue.current = queue.current
      .then(work)
      .catch((e) => {
        failed.current = true;
        setError(
          `Could not save: ${String(e)}. Keep the app open. Download a backup or retry.`,
        );
      })
      .finally(() => {
        pending.current--;
        if (!pending.current)
          setStatus(
            failed.current ? "Save needs attention" : "Saved on this iPad",
          );
      });
  }
  function lock() {
    return busyRef.current || opRef.current || turning.current || !ready;
  }
  function navigate(next: View) {
    if (lock() || !validView(next)) return;
    commitView(next);
  }
  function commitView(next: View) {
    const s = { ...settingsRef.current, view: next };
    if (s.order?.length) s.order = plannerOrder(s);
    settingsRef.current = s;
    setSettings(s);
    persist(() => saveSettings(s));
  }
  function turnPage(direction: number) {
    if (lock()) return;
    const current = settingsRef.current;
    const order = current.order;
    const index =
      order?.findIndex((v) => spreadId(v) === spreadId(current.view)) ?? -1;
    const next =
      order && index >= 0
        ? order[index + direction]
        : moveView(
            { mode: current.view.mode, date: current.view.date },
            direction,
          );
    if (!next) return;
    if (!validView(next)) return;
    gesture.current = null;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigate(next);
      return;
    }
    turning.current = true;
    setTurn({ next, direction });
  }
  function changePage(id: string, strokes: Stroke[], recordHistory = true) {
    const before = pagesRef.current[id]?.strokes ?? [];
    if (recordHistory) {
      const h = history.current;
      h.past.push({ id, strokes: before });
      if (h.past.length > 40) h.past.shift();
      h.future = [];
    }
    const p = { id, strokes };
    const next = { ...pagesRef.current, [id]: p };
    pagesRef.current = next;
    setPages(next);
    persist(() => savePage(p));
  }
  function undo(redo = false) {
    if (lock()) return;
    const h = history.current;
    const from = redo ? h.future : h.past,
      to = redo ? h.past : h.future;
    const next = from.pop();
    if (next) {
      to.push({
        id: next.id,
        strokes: pagesRef.current[next.id]?.strokes ?? [],
      });
      changePage(next.id, next.strokes, false);
    }
  }
  async function exclusive(work: () => Promise<void>) {
    if (lock()) return;
    opRef.current = true;
    setOperation(true);
    try {
      await queue.current;
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      opRef.current = false;
      setOperation(false);
    }
  }
  function snapshot(): Backup {
    return {
      format: "my-pastel-planner",
      schemaVersion: 2,
      layoutVersion: 1,
      appVersion: "0.3.0",
      exportedAt: new Date().toISOString(),
      pages: Object.values(pagesRef.current),
      settings: settingsRef.current,
    };
  }
  function organizePages(
    action: "insert" | "duplicate" | "delete" | "bookmark" | "move",
    target?: string,
  ) {
    void exclusive(async () => {
      if (failed.current) throw Error("Retry saving before organizing pages.");
      const current = settingsRef.current;
      let order = plannerOrder(current);
      let inserts = [...(current.inserts ?? [])];
      let bookmarks = [...(current.bookmarks ?? [])];
      let nextView = current.view;
      let additions: Page[] = [],
        removed: string[] = [];
      const key = spreadId(current.view);
      const index = order.findIndex((v) => spreadId(v) === key);
      if (index < 0) throw Error("Could not locate this spread.");
      if (action === "insert" || action === "duplicate") {
        if (inserts.length >= 5000)
          throw Error("The planner has reached its insert limit.");
        const source = inserts.find((i) => i.id === current.view.insert);
        const copy = duplicateSpread(
          current.view,
          action === "duplicate" ? (source?.template ?? "blank") : insertType,
          insertTitle.trim() ||
            (action === "duplicate"
              ? `${spreadTitle(current.view, inserts)} copy`.slice(0, 100)
              : `${insertType[0].toUpperCase() + insertType.slice(1)} notes`),
          action === "duplicate" ? pagesRef.current : {},
        );
        if (action === "duplicate" && (!current.view.insert || source?.source))
          copy.insert = {
            ...copy.insert,
            source: source?.source ?? {
              mode: current.view.mode,
              date: current.view.date,
            },
          };
        order.splice(index + (position === "after" ? 1 : 0), 0, copy.view);
        inserts.push(copy.insert);
        additions = copy.pages;
        nextView = copy.view;
      } else if (action === "delete") {
        if (
          !current.view.insert ||
          !confirm(
            "Delete this custom spread and its handwriting? This cannot be undone. Download a backup first if you want to keep a copy.",
          )
        )
          return;
        removed = pageIds(current.view);
        order.splice(index, 1);
        inserts = inserts.filter((i) => i.id !== current.view.insert);
        bookmarks = bookmarks.filter((id) => id !== key);
        nextView = order[Math.min(index, order.length - 1)] ?? initialView;
      } else if (action === "bookmark") {
        bookmarks = bookmarks.includes(key)
          ? bookmarks.filter((id) => id !== key)
          : [...bookmarks, key];
      } else {
        if (!target || target === key) return;
        if (!order.some((v) => spreadId(v) === target)) return;
        const [moving] = order.splice(index, 1);
        const at = order.findIndex((v) => spreadId(v) === target);
        order.splice(at + (position === "after" ? 1 : 0), 0, moving);
      }
      const next = { ...current, view: nextView, order, inserts, bookmarks };
      await saveOrganization(next, additions, removed);
      const updatedPages = { ...pagesRef.current };
      for (const id of removed) delete updatedPages[id];
      for (const p of additions) updatedPages[p.id] = p;
      if (removed.length) history.current = { past: [], future: [] };
      pagesRef.current = updatedPages;
      settingsRef.current = next;
      setPages(updatedPages);
      setSettings(next);
      setInsertTitle("");
      setStatus("Saved on this iPad");
    });
  }
  function backup() {
    void exclusive(async () => {
      download(snapshot());
      const next = {
        ...settingsRef.current,
        lastBackup: new Date().toISOString(),
      };
      settingsRef.current = next;
      setSettings(next);
      await saveSettings(next);
      setStatus("Backup downloaded — save it in Files");
    });
  }
  async function restore(file?: File) {
    if (!file) return;
    await exclusive(async () => {
      if (file.size > 100 * 1024 * 1024)
        throw Error("Backup is too large (maximum 100 MB).");
      const data = validateBackup(JSON.parse(await file.text()));
      if (
        !confirm(
          "Replace this iPad’s planner with this backup? A backup of the current planner will download first. Save that file in Files before continuing.",
        )
      )
        return;
      download(snapshot());
      if (
        !confirm(
          "Has the safety backup been saved? Select OK to replace the planner, or Cancel to leave it unchanged.",
        )
      )
        return;
      await replacePlanner(data);
      const p = Object.fromEntries(data.pages.map((p) => [p.id, p]));
      pagesRef.current = p;
      settingsRef.current = data.settings;
      setPages(p);
      setSettings(data.settings);
      history.current = { past: [], future: [] };
      failed.current = false;
      setError("");
      setStatus("Backup restored and saved");
    });
  }
  function retry() {
    void exclusive(async () => {
      await replacePlanner(snapshot());
      failed.current = false;
      setError("");
      setStatus("Saved on this iPad");
    });
  }
  function today() {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (
      d.getFullYear() !== 2027 &&
      !confirm(
        `Today is in ${d.getFullYear()}. Open that year? Your 2027 pages will remain available using the date picker.`,
      )
    )
      return;
    navigate({ mode: "week", date: key });
  }
  function installUpdate() {
    void exclusive(async () => {
      if (failed.current)
        throw Error("Retry saving or download a backup before updating.");
      const worker = update?.waiting;
      if (!worker)
        throw Error(
          "This update is no longer ready. Reopen the app to check again.",
        );
      download(snapshot());
      if (
        !confirm(
          "A backup of your current planner has been downloaded. Save it in Files before continuing. Has the backup been saved? Select OK to update, or Cancel to keep the planner open.",
        )
      ) {
        setStatus("Update paused — save the backup, then try again");
        return;
      }
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => location.reload(),
        { once: true },
      );
      worker.postMessage("ACTIVATE");
    });
  }
  if (fatal)
    return (
      <main className="opening">
        <h1>My Pastel Planner</h1>
        <p role="alert">{fatal}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (!ready)
    return (
      <main className="opening">
        <h1>My Pastel Planner</h1>
        <p>Opening your pages…</p>
      </main>
    );
  const locked = busy || operation || !!turn;
  const year = parseDate(view.date).getUTCFullYear();
  const currentInsert = settings.inserts?.find((i) => i.id === view.insert);
  const organization = plannerOrder(settings);
  const bookmarked = settings.bookmarks?.includes(spreadId(view));
  return (
    <main>
      <nav className="topbar" aria-label="Planner navigation">
        <div className="brand">
          <span className="brand-mark">✿</span>
          <span>
            My Pastel Planner<small>A little room for your day</small>
          </span>
        </div>
        <div className="nav-controls">
          <button disabled={locked} onClick={() => navigate(initialView)}>
            Home
          </button>
          <button disabled={locked} onClick={today}>
            Today
          </button>
          <div className="segmented">
            {(["month", "week"] as const).map((mode) => (
              <button
                key={mode}
                disabled={locked}
                className={view.mode === mode ? "selected" : ""}
                onClick={() => navigate({ mode, date: view.date })}
              >
                {mode === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
          <input
            aria-label="Jump to date"
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            value={view.date}
            disabled={locked}
            onChange={(e) => {
              if (validDate(e.target.value))
                navigate({ mode: view.mode, date: e.target.value });
            }}
          />
          <button
            disabled={locked}
            onClick={() => setOrganize(!organize)}
            aria-expanded={organize}
          >
            Pages &amp; bookmarks
          </button>
          <button
            disabled={locked}
            onClick={() => setHelp(true)}
            aria-label="Help and installation"
          >
            ?
          </button>
        </div>
      </nav>
      {organize && (
        <section className="organizer" aria-label="Pages and bookmarks">
          <div className="organizer-controls">
            <strong>Make it yours</strong>
            <button disabled={locked} onClick={() => setOrganize(false)}>
              Close pages
            </button>
          </div>
          <div className="organizer-controls">
            <label>
              Paper{" "}
              <select
                aria-label="Insert paper"
                disabled={locked}
                value={insertType}
                onChange={(e) => setInsertType(e.target.value as Insert)}
              >
                {INSERTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title{" "}
              <input
                aria-label="Insert title"
                maxLength={100}
                value={insertTitle}
                disabled={locked}
                placeholder="Optional title"
                onChange={(e) => setInsertTitle(e.target.value)}
              />
            </label>
            <label>
              Position{" "}
              <select
                aria-label="Spread position"
                disabled={locked}
                value={position}
                onChange={(e) =>
                  setPosition(e.target.value as "before" | "after")
                }
              >
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
            </label>
            <button disabled={locked} onClick={() => organizePages("insert")}>
              Insert spread
            </button>
            <button
              disabled={locked}
              onClick={() => organizePages("duplicate")}
            >
              Duplicate spread
            </button>
            <button
              disabled={locked || !view.insert}
              onClick={() => organizePages("delete")}
            >
              Delete custom spread
            </button>
            <button
              disabled={locked}
              aria-pressed={!!bookmarked}
              onClick={() => organizePages("bookmark")}
            >
              {bookmarked ? "Remove bookmark" : "Bookmark spread"}
            </button>
          </div>
          <div className="organizer-controls">
            <label>
              Move current spread{" "}
              <select
                aria-label="Move destination"
                value={moveTarget}
                disabled={locked}
                onChange={(e) => setMoveTarget(e.target.value)}
              >
                <option value="">Choose destination</option>
                {organization
                  .filter((v) => spreadId(v) !== spreadId(view))
                  .map((v) => (
                    <option key={spreadId(v)} value={spreadId(v)}>
                      {spreadTitle(v, settings.inserts)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              disabled={locked || !moveTarget}
              onClick={() => organizePages("move", moveTarget)}
            >
              Move spread
            </button>
          </div>
          <p>
            Inserts have two pages. Arrows follow your saved binder order after
            you organize it. Select ink by drawing a box, then drag a selected
            stroke to move the group.
          </p>
          <div className="bookmark-list" aria-label="Bookmarks">
            {(settings.bookmarks ?? []).length ? (
              organization
                .filter((v) => settings.bookmarks?.includes(spreadId(v)))
                .map((v) => (
                  <button
                    disabled={locked}
                    key={spreadId(v)}
                    onClick={() => navigate(v)}
                  >
                    ★ {spreadTitle(v, settings.inserts)}
                  </button>
                ))
            ) : (
              <span>No bookmarks yet.</span>
            )}
          </div>
          <label>
            Open spread{" "}
            <select
              aria-label="Open spread"
              disabled={locked}
              value={spreadId(view)}
              onChange={(e) => {
                const v = organization.find(
                  (v) => spreadId(v) === e.target.value,
                );
                if (v) navigate(v);
              }}
            >
              {organization.map((v) => (
                <option key={spreadId(v)} value={spreadId(v)}>
                  {spreadTitle(v, settings.inserts)}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      <div className="workspace">
        <div className="spread-navigation">
          <button
            disabled={locked}
            aria-label="Previous spread"
            onClick={() => turnPage(-1)}
          >
            ‹
          </button>
          <span>
            {currentInsert
              ? currentInsert.title
              : view.mode === "month"
                ? `${MONTHS[parseDate(view.date).getUTCMonth()]} ${year}`
                : "Your weekly pages"}
            <small>
              {currentInsert
                ? `${currentInsert.template} · custom spread`
                : view.mode === "month"
                  ? "Switch to Browse dates to tap a date and open its week"
                  : "Sunday through Saturday"}
            </small>
          </span>
          <button
            disabled={locked}
            aria-label="Next spread"
            onClick={() => turnPage(1)}
          >
            ›
          </button>
        </div>
        <div className="book-wrap">
          <div
            className={"book" + (turn ? " turning" : "")}
            ref={book}
            onPointerDownCapture={(e) => {
              if (e.pointerType === "pen") {
                penUntil.current = performance.now() + 700;
                gesture.current = null;
                return;
              }
              if (e.pointerType !== "touch") return;
              contacts.current.add(e.pointerId);
              if (
                contacts.current.size !== 1 ||
                lock() ||
                performance.now() < penUntil.current ||
                (fingerWriting && tool !== "browse") ||
                !(e.target as Element).closest(".page")
              ) {
                gesture.current = null;
                return;
              }
              const r = e.currentTarget.getBoundingClientRect();
              gesture.current = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                time: performance.now(),
                edge:
                  e.clientX < r.left + 42
                    ? -1
                    : e.clientX > r.right - 42
                      ? 1
                      : 0,
              };
            }}
            onPointerUpCapture={(e) => {
              contacts.current.delete(e.pointerId);
              const g = gesture.current;
              gesture.current = null;
              if (
                !g ||
                g.id !== e.pointerId ||
                lock() ||
                performance.now() < penUntil.current
              )
                return;
              const dx = e.clientX - g.x,
                dy = e.clientY - g.y;
              if (performance.now() - g.time > 900) return;
              if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6)
                turnPage(dx < 0 ? 1 : -1);
              else if (
                g.edge &&
                Math.abs(dx) < 12 &&
                Math.abs(dy) < 12 &&
                performance.now() - g.time < 350
              )
                turnPage(g.edge);
            }}
            onPointerCancelCapture={(e) => {
              contacts.current.delete(e.pointerId);
              gesture.current = null;
            }}
            onPointerLeave={() => {
              gesture.current = null;
              contacts.current.clear();
            }}
          >
            <div className="paper-stack" />
            {ids.map((id, side) => (
              <div className={"page page-" + side} key={id}>
                <div className="page-content">
                  <Template
                    view={view}
                    insert={currentInsert}
                    side={side}
                    onWeek={(date) => navigate({ mode: "week", date })}
                  />
                  <Ink
                    fingerWriting={fingerWriting}
                    strokes={pages[id]?.strokes ?? []}
                    color={color}
                    width={width}
                    tool={tool}
                    eraser={tool === "eraser"}
                    enabled={tool !== "browse" && !operation && !turn}
                    onBusy={(value) => {
                      if (value) gesture.current = null;
                      if (value || busyRef.current)
                        penUntil.current = performance.now() + 700;
                      busyRef.current = value;
                      setBusy(value);
                    }}
                    onChange={(strokes) => {
                      changePage(id, strokes);
                    }}
                  />
                </div>
              </div>
            ))}
            {turn && (
              <>
                <div className="turn-destination" aria-hidden="true" inert>
                  {pageIds(turn.next).map((id, side) => (
                    <div className={"page page-" + side} key={id}>
                      <div className="page-content">
                        <Template
                          view={turn.next}
                          insert={settings.inserts?.find(
                            (i) => i.id === turn.next.insert,
                          )}
                          side={side}
                          onWeek={() => {}}
                        />
                        <Ink
                          strokes={pages[id]?.strokes ?? []}
                          color={color}
                          width={width}
                          eraser={false}
                          enabled={false}
                          fingerWriting={false}
                          onBusy={() => {}}
                          onChange={() => {}}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <PageTurn
                  direction={turn.direction}
                  onDone={() => {
                    commitView(turn.next);
                    turning.current = false;
                    setTurn(null);
                  }}
                />
              </>
            )}
            <div className="spine" aria-hidden="true" />
            <div className="rings" aria-hidden="true">
              {[12, 20, 28, 72, 80, 88].map((top) => (
                <i key={top} style={{ top: `${top}%` }} />
              ))}
            </div>
            <aside className="month-tabs" aria-label="Months">
              {MONTHS.map((month, i) => (
                <button
                  disabled={locked}
                  key={month}
                  className={
                    parseDate(view.date).getUTCMonth() === i ? "active" : ""
                  }
                  style={{
                    background: [
                      "#eac6d1",
                      "#d6c9e8",
                      "#cbdcca",
                      "#eed0bb",
                      "#f0e5b5",
                      "#cadfdf",
                    ][i % 6],
                  }}
                  onClick={() =>
                    navigate({
                      mode: "month",
                      date: `${year}-${String(i + 1).padStart(2, "0")}-01`,
                    })
                  }
                >
                  {month.slice(0, 3)}
                </button>
              ))}
            </aside>
          </div>
        </div>
      </div>
      <div className="bottom">
        <div className="toolbar" aria-label="Writing tools">
          <button
            disabled={locked}
            aria-label={
              expanded ? "Collapse writing tools" : "Expand writing tools"
            }
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "−" : "+"}
          </button>
          {expanded && (
            <>
              <button
                disabled={locked}
                className={tool === "pen" ? "selected" : ""}
                onClick={() => setTool("pen")}
              >
                Pen
              </button>
              {(["highlighter", "pencil", "select"] as const).map((t) => (
                <button
                  key={t}
                  disabled={locked}
                  className={tool === t ? "selected" : ""}
                  onClick={() => setTool(t)}
                >
                  {t === "select"
                    ? "Select / move"
                    : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
              <button
                disabled={locked}
                className={tool === "eraser" ? "selected" : ""}
                onClick={() => setTool("eraser")}
              >
                Eraser
              </button>
              <button
                disabled={locked}
                className={tool === "browse" ? "selected" : ""}
                onClick={() => setTool("browse")}
              >
                Browse dates
              </button>
              <span className="divider" />
              <button
                disabled={locked}
                aria-pressed={fingerWriting}
                className={fingerWriting ? "selected" : ""}
                onClick={() => setFingerWriting(!fingerWriting)}
                title="Enable touch input for fingers or touch styluses. Turn off when using a pen for palm protection."
              >
                Finger writing
              </button>
              {[
                "#4b4659",
                "#986077",
                "#6c628d",
                "#557961",
                "#ad7554",
                "#467c91",
              ].map((c) => (
                <button
                  key={c}
                  disabled={locked}
                  className={"swatch " + (color === c ? "chosen" : "")}
                  aria-label={`Ink ${c}`}
                  aria-pressed={color === c}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    if (tool !== "pencil" && tool !== "highlighter")
                      setTool("pen");
                  }}
                />
              ))}
              <label className="thickness">
                Size{" "}
                <input
                  aria-label="Pen thickness"
                  disabled={locked}
                  type="range"
                  min="1"
                  max="6"
                  step="0.5"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                />
              </label>
              <button
                disabled={locked || !history.current.past.length}
                onClick={() => undo()}
              >
                Undo
              </button>
              <button
                disabled={locked || !history.current.future.length}
                onClick={() => undo(true)}
              >
                Redo
              </button>
            </>
          )}
        </div>
        <div className="status-row">
          <span role="status">
            {status} · {online ? "Online" : "Offline"}
          </span>
          <div>
            <button disabled={locked} onClick={backup}>
              Download backup
            </button>
            <button disabled={locked} onClick={() => input.current?.click()}>
              Restore
            </button>
            <input
              ref={input}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void restore(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {!settings.lastBackup && (
          <p className="backup-note">
            Your handwriting stays on this device. Download a backup regularly
            and save it in Files.
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button disabled={locked} onClick={retry}>
              Retry save
            </button>
          </div>
        )}
        {update && (
          <div className="update">
            An app update is ready. Download and save a backup before updating.{" "}
            <button disabled={locked} onClick={installUpdate}>
              Back up and update
            </button>
          </div>
        )}
      </div>
      {help && (
        <div className="modal-backdrop">
          <section
            className="help"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <h2 id="help-title">Your planner, at home on your iPad</h2>
            <p>
              Write with a pen or mouse. Enable Finger writing in the writing
              tools to use one finger or a touch stylus on a phone. Leave it off
              when using Apple Pencil to prevent palm marks. This option resets
              to off when you reopen the app. Use the tabs and arrow buttons to
              navigate; choose Browse dates to tap a calendar date. Eraser
              removes whole strokes. Undo and redo follow the order of your
              edits across all pages and panels, even after navigating to
              another spread. They leave your current view in place.
            </p>
            <p>
              In Safari, open Share → Add to Home Screen. Open the installed
              planner online once, wait for “offline app ready,” then test
              closing and reopening it in Airplane Mode.
            </p>
            <p>
              Download backups regularly and save them in Files, outside the
              app. Clearing website data or losing your iPad can remove local
              handwriting. A backup contains editable ink and is readable,
              unencrypted JSON. Restoring replaces the local planner after
              confirmation.
            </p>
            <p>
              Swipe horizontally with one finger or tap an outer paper edge to
              turn pages. Use the arrows for mouse navigation. Finger writing
              disables page gestures until you switch to Browse dates. Month
              tabs jump instantly. Pages &amp; bookmarks adds custom spreads,
              duplicates, ordering and bookmarks. Select / move: draw a box
              around ink, then drag a selected stroke; switch tools to clear
              selection. Undo reverses ink movement. Highlighter is translucent;
              Pencil varies with pressure. PDF export comes in Phase 4.
            </p>
            <button
              onClick={() => {
                void navigator.storage?.persist?.();
                setHelp(false);
              }}
            >
              Back to my planner
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
