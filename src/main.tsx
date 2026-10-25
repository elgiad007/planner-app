import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Ink } from "./Ink";
import { useWritingGuard } from "./useWritingGuard";
import { Template } from "./Template";
import { loadPlanner, savePage, saveSettings, replacePlanner } from "./storage";
import {
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
    [tool, setTool] = useState<"pen" | "eraser" | "browse">("pen"),
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
    return busyRef.current || opRef.current || !ready;
  }
  function navigate(next: View) {
    if (lock() || !validView(next)) return;
    const s = { ...settingsRef.current, view: next };
    settingsRef.current = s;
    setSettings(s);
    persist(() => saveSettings(s));
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
      schemaVersion: 1,
      layoutVersion: 1,
      appVersion: "0.1.0",
      exportedAt: new Date().toISOString(),
      pages: Object.values(pagesRef.current),
      settings: settingsRef.current,
    };
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
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => location.reload(),
        { once: true },
      );
      update?.waiting?.postMessage("ACTIVATE");
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
  const locked = busy || operation;
  const year = parseDate(view.date).getUTCFullYear();
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
                onClick={() => navigate({ ...view, mode })}
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
                navigate({ ...view, date: e.target.value });
            }}
          />
          <button
            disabled={locked}
            onClick={() => setHelp(true)}
            aria-label="Help and installation"
          >
            ?
          </button>
        </div>
      </nav>
      <div className="workspace">
        <div className="spread-navigation">
          <button
            disabled={locked}
            aria-label="Previous spread"
            onClick={() => navigate(moveView(view, -1))}
          >
            ‹
          </button>
          <span>
            {view.mode === "month"
              ? `${MONTHS[parseDate(view.date).getUTCMonth()]} ${year}`
              : "Your weekly pages"}
            <small>
              {view.mode === "month"
                ? "Switch to Browse dates to tap a date and open its week"
                : "Sunday through Saturday"}
            </small>
          </span>
          <button
            disabled={locked}
            aria-label="Next spread"
            onClick={() => navigate(moveView(view, 1))}
          >
            ›
          </button>
        </div>
        <div className="book-wrap">
          <div className="book" ref={book}>
            <div className="paper-stack" />
            {ids.map((id, side) => (
              <div className={"page page-" + side} key={id}>
                <div className="page-content">
                  <Template
                    view={view}
                    side={side}
                    onWeek={(date) => navigate({ mode: "week", date })}
                  />
                  <Ink
                    fingerWriting={fingerWriting}
                    strokes={pages[id]?.strokes ?? []}
                    color={color}
                    width={width}
                    eraser={tool === "eraser"}
                    enabled={tool !== "browse" && !operation}
                    onBusy={(value) => {
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
            An app update is ready.{" "}
            <button disabled={locked} onClick={installUpdate}>
              Save and update
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
              Phase 1 includes basic handwriting and navigation. Page curling,
              custom inserts, advanced tools and PDF export come in later
              phases.
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
