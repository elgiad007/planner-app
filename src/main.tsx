import { createRoot } from "react-dom/client";
import { APP_VERSION } from "./version";
import { useEffect, useMemo, useRef, useState } from "react";
import { SaveQueue } from "./saveQueue";
import { SpreadViewport } from "./SpreadViewport";
import { DockMenu } from "./DockMenu";
import { ToolButton } from "./ToolButton";
import { SHORTCUTS, TOOL_KEYS } from "./shortcuts";
import { TextLayer } from "./TextLayer";
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
  readPlannerRecords,
} from "./storage";
import {
  INSERTS,
  DEFAULT_PREFERENCES,
  type ToolPreferences,
  plannerOrder,
  restoreOriginalOrder,
  spreadId,
  spreadTitle,
  resolvedBookmarkNames,
  cleanBookmarkName,
  bookmarkNameKey,
  bookmarkNameError,
  contentIndex,
  duplicateSpread,
  type Insert,
  initialView,
  pageIds,
  turnDestination,
  parseDate,
  MONTHS,
  validView,
  validDate,
  migrateBackup,
  type Page,
  type Stroke,
  type Settings,
  type View,
  type Backup,
} from "./model";
import "./style.css";

const DEFAULT_PLANNER_NAME = "My Pastel Planner";
function download(data: unknown, prefix?: string) {
  prefix ??=
    ((data as Backup)?.settings?.plannerName || DEFAULT_PLANNER_NAME)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "planner";
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function App() {
  const [pages, setPages] = useState<Record<string, Page>>({}),
    [settings, setSettings] = useState<Settings>({ view: initialView });
  const plannerName = settings.plannerName || DEFAULT_PLANNER_NAME;
  useEffect(() => {
    document.title = plannerName;
  }, [plannerName]);
  const [ready, setReady] = useState(false),
    [recoveryAllowed, setRecoveryAllowed] = useState(false),
    [fatal, setFatal] = useState(""),
    [status, setStatus] = useState("Opening planner…"),
    [error, setError] = useState("");
  const [bookmarkNotice, setBookmarkNotice] = useState<{
    message: string;
  } | null>(null);
  const bookmarkNoticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bookmarkNotice) return;
    bookmarkNoticeRef.current?.showPopover();
    const timeout = setTimeout(() => setBookmarkNotice(null), 3000);
    return () => clearTimeout(timeout);
  }, [bookmarkNotice]);
  const {
    inkColor,
    highlighterColor,
    inkWidth,
    highlighterWidth,
    tool,
    textFontSize,
  } = {
    ...DEFAULT_PREFERENCES,
    ...settings.preferences,
  };
  const setInkColor = (value: string) => updatePreference("inkColor", value);
  const setHighlighterColor = (value: string) =>
    updatePreference("highlighterColor", value);
  const setInkWidth = (value: number | ((previous: number) => number)) =>
    updatePreference("inkWidth", value);
  const setHighlighterWidth = (
    value: number | ((previous: number) => number),
  ) => updatePreference("highlighterWidth", value);
  const setTool = (value: ToolPreferences["tool"]) =>
    updatePreference("tool", value);
  const [fingerWriting, setFingerWriting] = useState(false),
    [insertType, setInsertType] = useState<Insert>("lined"),
    [insertTitle, setInsertTitle] = useState(""),
    [position, setPosition] = useState<"before" | "after">("after"),
    [movePosition, setMovePosition] = useState<"before" | "after">("after"),
    [moveTarget, setMoveTarget] = useState(""),
    [expanded, setExpanded] = useState(() => window.innerWidth > 700),
    [help, setHelp] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [operation, setOperation] = useState(false),
    [busy, setBusy] = useState(false),
    [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false),
    [updateMessage, setUpdateMessage] = useState("");
  const [pdfScope, setPdfScope] = useState<"current" | "binder">("current"),
    [pdfProgress, setPdfProgress] = useState(""),
    [pdfFile, setPdfFile] = useState<{ url: string; name: string } | null>(
      null,
    );
  const pdfAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (pdfFile) URL.revokeObjectURL(pdfFile.url);
    },
    [pdfFile],
  );
  useEffect(() => () => pdfAbort.current?.abort(), []);
  const [colorRevision, setColorRevision] = useState(0);
  const color = tool === "highlighter" ? highlighterColor : inkColor;
  const width = tool === "highlighter" ? highlighterWidth : inkWidth;
  const palette =
    tool === "highlighter"
      ? [
          { color: "#ffff00", name: "Yellow" },
          { color: "#ff00a8", name: "Pink" },
          { color: "#00bfff", name: "Blue" },
          { color: "#39ff14", name: "Green" },
          { color: "#ff8000", name: "Orange" },
          { color: "#bf00ff", name: "Purple" },
        ]
      : ["#4b4659", "#986077", "#6c628d", "#557961", "#ad7554", "#467c91"].map(
          (color) => ({ color, name: color }),
        );
  const pagesRef = useRef(pages),
    settingsRef = useRef(settings),
    busyRef = useRef(false),
    opRef = useRef(false),
    pending = useRef(0),
    failed = useRef(false),
    queue = useRef<Promise<void>>(Promise.resolve());
  const saveQueue = useRef<SaveQueue | null>(null);
  if (!saveQueue.current)
    saveQueue.current = new SaveQueue((e) => {
      failed.current = true;
      setError(
        `Could not save: ${String(e)}. Keep the app open. Use Save planner to download a file, or retry.`,
      );
    });
  const [hand, setHand] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const [selectionReset, setSelectionReset] = useState(0);
  const dateInput = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(100);
  const [pinching, setPinching] = useState(false);
  const pinchingRef = useRef(false);
  const book = useWritingGuard(
    !hand && !spacePan && tool !== "browse" && !operation && ready,
  );
  const history = useRef<{ past: Page[]; future: Page[] }>({
    past: [],
    future: [],
  });
  const input = useRef<HTMLInputElement>(null);
  const view = settings.view,
    ids = pageIds(view);
  const organization = useMemo(() => plannerOrder(settings), [settings]);
  const bookmarkNames = useMemo(
    () => resolvedBookmarkNames(settings),
    [settings],
  );
  const [editingBookmark, setEditingBookmark] = useState<string | null>(null);
  const [bookmarkDraft, setBookmarkDraft] = useState("");
  const [bookmarkRenameError, setBookmarkRenameError] = useState("");
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
          setStatus("Changes saved on this device");
        })
        .catch((e) => {
          if (live) {
            setRecoveryAllowed(true);
            setFatal(
              `Could not open local storage: ${String(e)}. Your existing data has not been replaced. Close other planner tabs and try again.`,
            );
          }
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
              setStatus("Saved on this device · offline app ready");
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
  function persist(key: string, work: () => Promise<void>) {
    pending.current++;
    setStatus("Saving on this device…");
    queue.current = saveQueue.current!.enqueue(key, work).finally(() => {
      pending.current--;
      if (!pending.current)
        setStatus(
          failed.current
            ? "Save needs attention"
            : "Changes saved on this device",
        );
    });
  }
  function lock() {
    return (
      busyRef.current ||
      pinchingRef.current ||
      opRef.current ||
      turning.current ||
      !ready
    );
  }
  function navigate(next: View) {
    if (lock() || !validView(next)) return;
    commitView(next);
  }
  function updatePreference<K extends keyof ToolPreferences>(
    key: K,
    value:
      | ToolPreferences[K]
      | ((previous: ToolPreferences[K]) => ToolPreferences[K]),
  ) {
    if (lock()) return;
    const previous =
      settingsRef.current.preferences?.[key] ?? DEFAULT_PREFERENCES[key];
    const nextValue = typeof value === "function" ? value(previous) : value;
    const next = {
      ...settingsRef.current,
      preferences: { ...settingsRef.current.preferences, [key]: nextValue },
    };
    settingsRef.current = next;
    setSettings(next);
    persist("settings", () => saveSettings(next));
  }
  function commitView(next: View) {
    const s = { ...settingsRef.current, view: next };
    if (s.order?.length) s.order = plannerOrder(s);
    settingsRef.current = s;
    setSettings(s);
    persist("settings", () => saveSettings(s));
  }
  function turnPage(direction: number) {
    if (lock()) return;
    const current = settingsRef.current;
    const next = turnDestination(current, direction);
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
  function changePage(
    id: string,
    strokes: Stroke[],
    recordHistory = true,
    textBlocks = pagesRef.current[id]?.textBlocks,
  ) {
    const before = pagesRef.current[id] ?? { id, strokes: [] };
    if (recordHistory) {
      const h = history.current;
      h.past.push(before);
      if (h.past.length > 40) h.past.shift();
      h.future = [];
    }
    const p = { id, strokes, ...(textBlocks ? { textBlocks } : {}) };
    const next = { ...pagesRef.current, [id]: p };
    pagesRef.current = next;
    setPages(next);
    persist(id, () => savePage(p));
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
        textBlocks: pagesRef.current[next.id]?.textBlocks,
      });
      changePage(next.id, next.strokes, false, next.textBlocks ?? []);
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
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      pages: Object.values(pagesRef.current),
      settings: settingsRef.current,
    };
  }
  function organizePages(
    action:
      | "insert"
      | "duplicate"
      | "delete"
      | "bookmark"
      | "remove-bookmark"
      | "rename-bookmark"
      | "move"
      | "restore-order",
    target?: string,
    name?: string,
  ) {
    void exclusive(async () => {
      if (failed.current) throw Error("Retry saving before organizing pages.");
      const current = settingsRef.current;
      let order = plannerOrder(current);
      let inserts = [...(current.inserts ?? [])];
      let bookmarks = [...(current.bookmarks ?? [])];
      let names = resolvedBookmarkNames(current);
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
            "Delete this custom spread and its handwriting? This cannot be undone. Save a planner file first if you want to keep a copy.",
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
      } else if (action === "remove-bookmark") {
        bookmarks = bookmarks.filter((id) => id !== target);
      } else if (action === "rename-bookmark") {
        if (!target || !bookmarks.includes(target) || name === undefined)
          return;
        const error =
          bookmarkNameError(name) ||
          (Object.entries(names).some(
            ([id, existing]) =>
              id !== target &&
              bookmarkNameKey(existing) === bookmarkNameKey(name),
          )
            ? "A bookmark with this name already exists."
            : null);
        if (error) {
          setBookmarkRenameError(error);
          return;
        }
        names[target] = cleanBookmarkName(name);
      } else if (action === "restore-order") {
        order = restoreOriginalOrder(order);
      } else {
        if (!current.view.insert) return;
        if (!target || target === key) return;
        if (!order.some((v) => spreadId(v) === target)) return;
        const [moving] = order.splice(index, 1);
        const at = order.findIndex((v) => spreadId(v) === target);
        order.splice(at + (movePosition === "after" ? 1 : 0), 0, moving);
      }
      names = Object.fromEntries(
        Object.entries(names).filter(([id]) => bookmarks.includes(id)),
      );
      names = resolvedBookmarkNames({
        ...current,
        order,
        inserts,
        bookmarks,
        bookmarkNames: names,
      });
      const next = {
        ...current,
        view: nextView,
        order,
        inserts,
        bookmarks,
        bookmarkNames: names,
      };
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
      if (action === "rename-bookmark") {
        setEditingBookmark(null);
        setBookmarkRenameError("");
      }
      if (action === "bookmark" || action === "remove-bookmark") {
        setBookmarkNotice({
          message:
            action === "bookmark" && bookmarks.includes(key)
              ? "Bookmark added"
              : "Bookmark removed",
        });
      }
      setStatus(
        action === "restore-order"
          ? "Original spread order restored"
          : "Changes saved on this device",
      );
    });
  }
  function renamePlanner() {
    if (lock()) return;
    const entered = prompt("Planner name (up to 100 characters)", plannerName);
    if (entered === null) return;
    const name = entered.trim();
    if (!name || name.length > 100) {
      setError("Planner name must contain 1 to 100 characters.");
      return;
    }
    const next = { ...settingsRef.current, plannerName: name };
    settingsRef.current = next;
    setSettings(next);
    persist("settings", () => saveSettings(next));
  }
  function backup() {
    void exclusive(async () => {
      download(snapshot());
      const next = {
        ...settingsRef.current,
        lastBackup: new Date().toISOString(),
      };
      await saveSettings(next);
      settingsRef.current = next;
      setSettings(next);
      setStatus("Planner file downloaded — keep it in a safe location");
    });
  }
  async function restore(file?: File) {
    if (!file) return;
    await exclusive(async () => {
      if (file.size > 100 * 1024 * 1024)
        throw Error("Planner file is too large (maximum 100 MB).");
      const data = migrateBackup(JSON.parse(await file.text()));
      if (
        !confirm(
          `Open “${data.settings.plannerName || DEFAULT_PLANNER_NAME}” and replace “${settingsRef.current.plannerName || DEFAULT_PLANNER_NAME}” on this device? A safety copy of the current planner will download first. Keep that file in a safe location before continuing.`,
        )
      )
        return;
      download(snapshot());
      if (
        !confirm(
          "Have you kept the safety copy in a safe location? Select OK to replace the planner, or Cancel to leave it unchanged.",
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
      setStatus("Planner opened · changes saved on this device");
    });
  }
  function retry() {
    void exclusive(async () => {
      await replacePlanner(snapshot());
      failed.current = false;
      setError("");
      setStatus("Changes saved on this device");
    });
  }
  async function recoveryCopy() {
    const records = await readPlannerRecords();
    download(
      {
        format: "my-pastel-planner-recovery-records",
        exportedAt: new Date().toISOString(),
        ...records,
      },
      "my-pastel-planner-recovery",
    );
  }
  async function recover(file?: File) {
    if (!file || opRef.current) return;
    opRef.current = true;
    setOperation(true);
    try {
      if (file.size > 100 * 1024 * 1024)
        throw Error("Planner file is too large (maximum 100 MB).");
      const data = migrateBackup(JSON.parse(await file.text()));
      if (
        !confirm(
          "Open this planner file? The unreadable local records will download as a recovery file first. Save that file before replacing anything.",
        )
      )
        return;
      await recoveryCopy();
      if (
        !confirm(
          "Has the recovery file been saved in Files? Select OK to replace local data with the validated planner file, or Cancel to leave it unchanged.",
        )
      )
        return;
      await replacePlanner(data);
      location.reload();
    } catch (e) {
      setError(String(e));
    } finally {
      opRef.current = false;
      setOperation(false);
    }
  }
  function exportPdf() {
    void exclusive(async () => {
      const controller = new AbortController();
      pdfAbort.current = controller;
      setPdfFile(null);
      setPdfProgress("Preparing PDF…");
      try {
        const data = snapshot();
        const { createPdf } = await import("./pdf");
        const blob = await createPdf(
          data,
          pdfScope,
          controller.signal,
          (done, total) =>
            setPdfProgress(`Creating PDF: ${done} of ${total} spreads`),
        );
        setPdfFile({
          url: URL.createObjectURL(blob),
          name: `my-pastel-planner-${pdfScope}-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`,
        });
        setPdfProgress("PDF ready. Download and save it in Files.");
      } catch (e) {
        if (controller.signal.aborted)
          setPdfProgress("PDF export cancelled. Your planner is unchanged.");
        else {
          setPdfProgress(
            "PDF export failed. Try the current spread or save an editable planner file.",
          );
          throw e;
        }
      } finally {
        pdfAbort.current = null;
      }
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
  async function checkForUpdates() {
    setCheckingUpdate(true);
    setUpdateMessage("Checking for updates…");
    try {
      if (!navigator.onLine)
        throw Error("You’re offline. Connect to the internet and try again.");
      if (!import.meta.env.PROD || !("serviceWorker" in navigator))
        throw Error(
          "Update checks are available in the installed or hosted app.",
        );
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg)
        throw Error(
          "The offline app isn’t ready yet. Reopen the app online and try again.",
        );
      if (!reg.waiting) {
        await reg.update();
        const worker = reg.installing;
        if (worker) {
          await new Promise<void>((resolve, reject) => {
            const finish = () => {
              if (worker.state !== "installed" && worker.state !== "redundant")
                return;
              clearTimeout(timeout);
              worker.removeEventListener("statechange", finish);
              if (worker.state === "installed") resolve();
              else
                reject(Error("The update could not be downloaded. Try again."));
            };
            const timeout = setTimeout(() => {
              worker.removeEventListener("statechange", finish);
              reject(Error("The update check timed out. Try again."));
            }, 30000);
            worker.addEventListener("statechange", finish);
            finish();
          });
        }
      }
      if (reg.waiting) {
        setUpdate(reg);
        setUpdateMessage(
          "An update is available. Save a planner file before updating.",
        );
      } else {
        setUpdateMessage("You’re up to date.");
      }
    } catch (e) {
      setUpdateMessage(
        e instanceof Error
          ? e.message
          : "Couldn’t check for updates. Try again.",
      );
    } finally {
      setCheckingUpdate(false);
    }
  }
  function installUpdate() {
    void exclusive(async () => {
      if (failed.current)
        throw Error("Retry saving or save a planner file before updating.");
      const worker = update?.waiting;
      if (!worker)
        throw Error(
          "This update is no longer ready. Reopen the app to check again.",
        );
      download(snapshot());
      if (
        !confirm(
          "A file of your current planner has been downloaded. Keep it in a safe location before continuing. Have you kept the file? Select OK to update, or Cancel to keep the planner open.",
        )
      ) {
        setStatus("Update paused — keep the planner file, then try again");
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
  useEffect(() => {
    const release = () => setSpacePan(false);
    const keyup = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!help) return;
    setSpacePan(false);
    const previous = document.activeElement;
    document
      .querySelectorAll<HTMLElement>("[popover]:popover-open")
      .forEach((panel) => panel.hidePopover());
    document.querySelector<HTMLElement>(".help")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [help]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !ready || fatal) return;
      if (help) {
        if (e.key === "Escape") {
          e.preventDefault();
          setHelp(false);
        }
        if (e.key === "Tab") {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>(".help button")?.focus();
        }
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape") {
        const popover = document.querySelector<HTMLElement>(
          "[popover]:popover-open",
        );
        if (popover) {
          e.preventDefault();
          popover.hidePopover();
          return;
        }
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        ["s", "o"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        if (!e.repeat && !lock()) {
          if (e.key.toLowerCase() === "s") backup();
          else input.current?.click();
        }
        return;
      }
      // Preserve text editing, native form controls, and browser/OS shortcuts.
      if (
        target?.closest(
          "dialog, input, textarea, select, [contenteditable]:not([contenteditable='false'])",
        )
      )
        return;
      if (lock()) return;
      const key = e.key.toLowerCase();
      if (e.altKey) return;
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" || key === "y") {
          e.preventDefault();
          if (!e.repeat) undo(key === "y" || e.shiftKey);
        }
        return;
      }
      if (e.shiftKey && (key === "arrowleft" || key === "arrowright")) {
        e.preventDefault();
        if (!e.repeat) {
          const content = contentIndex(settingsRef.current, pagesRef.current);
          const next = key === "arrowleft" ? content.previous : content.next;
          if (next) navigate(next);
        }
        return;
      }
      if (e.key === " " && !target?.closest("button, a, [role='button']")) {
        e.preventDefault();
        setSpacePan(true);
        return;
      }
      const actions: Record<string, () => void> = {
        arrowleft: () => turnPage(-1),
        arrowright: () => turnPage(1),
        home: () => navigate(initialView),
        m: () => navigate({ mode: "month", date: view.date }),
        w: () => navigate({ mode: "week", date: view.date }),
        k: () => organizePages("bookmark"),
        g: () => {
          const input = dateInput.current;
          input?.closest<HTMLElement>("[popover]")?.showPopover();
          input?.focus();
        },
        "+": () => setZoom((z) => Math.min(250, z + 25)),
        "=": () => setZoom((z) => Math.min(250, z + 25)),
        "-": () => setZoom((z) => Math.max(100, z - 25)),
        "0": () => setZoom(100),
        "[": () =>
          tool === "highlighter"
            ? setHighlighterWidth((w) => Math.max(12, w - 2))
            : setInkWidth((w) => Math.max(1, w - 0.5)),
        "]": () =>
          tool === "highlighter"
            ? setHighlighterWidth((w) => Math.min(48, w + 2))
            : setInkWidth((w) => Math.min(6, w + 0.5)),
        escape: () => setSelectionReset((n) => n + 1),
        "?": () => setHelp(true),
      };
      const selectedTool = TOOL_KEYS[key];
      const action = selectedTool
        ? () => {
            setHand(false);
            setTool(selectedTool);
          }
        : actions[key];
      if (!action || (e.shiftKey && !["?", "+"].includes(e.key))) return;
      e.preventDefault();
      if (!e.repeat) action();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  if (fatal)
    return (
      <main className="opening">
        <h1>My Pastel Planner</h1>
        <p role="alert">{fatal}</p>
        <button onClick={() => location.reload()}>Try again</button>
        {recoveryAllowed && (
          <>
            <button
              disabled={operation}
              onClick={() => {
                void recoveryCopy().catch((e) => setError(String(e)));
              }}
            >
              Download recovery data
            </button>
            <p>
              Recovery data preserves local records for troubleshooting. To open
              a known good planner file, select it below. Existing records are
              preserved until you confirm replacement.
            </p>
            <input
              disabled={operation}
              aria-label="Recovery planner file"
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void recover(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </main>
    );
  if (!ready)
    return (
      <main className="opening">
        <h1>My Pastel Planner</h1>
        <p>Opening your pages…</p>
      </main>
    );
  const locked = busy || pinching || operation || !!turn;
  const year = parseDate(view.date).getUTCFullYear();
  const currentInsert = settings.inserts?.find((i) => i.id === view.insert);
  const bookmarked = settings.bookmarks?.includes(spreadId(view));
  const content = contentIndex(settings, pages);
  return (
    <main className="planner-shell">
      <header className="planner-identity">
        <h1 title={plannerName}>{plannerName}</h1>
        <button
          className="planner-rename"
          type="button"
          aria-label="Edit planner name"
          title="Edit planner name"
          disabled={locked}
          onClick={renamePlanner}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m16 3 5 5-12 12-6 1 1-6Z" />
            <path d="m14 5 5 5M4 15l5 5" />
          </svg>
        </button>
      </header>
      <aside className="right-dock dock" aria-label="Planner options">
        <div
          className="dock-brand"
          title="My Pastel Planner"
          aria-label="My Pastel Planner"
        >
          ✿
        </div>
        <DockMenu label="Navigate" icon="▦" disabled={locked}>
          <nav className="nav-controls" aria-label="Planner navigation">
            <button
              title="Home (Home)"
              disabled={locked}
              onClick={() => navigate(initialView)}
            >
              Home
            </button>
            <button title="Today" disabled={locked} onClick={today}>
              Today
            </button>
            <div className="segmented">
              {(["month", "week"] as const).map((mode) => (
                <button
                  key={mode}
                  title={mode === "month" ? "Month (M)" : "Week (W)"}
                  disabled={locked}
                  className={view.mode === mode ? "selected" : ""}
                  onClick={() => navigate({ mode, date: view.date })}
                >
                  {mode === "month" ? "Month" : "Week"}
                </button>
              ))}
            </div>
            <input
              ref={dateInput}
              title="Jump to date (G)"
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
            <label className="holiday-toggle">
              <input
                type="checkbox"
                checked={settings.showHolidays !== false}
                disabled={locked}
                onChange={(e) => {
                  if (lock()) return;
                  const next = {
                    ...settingsRef.current,
                    showHolidays: e.target.checked,
                  };
                  settingsRef.current = next;
                  setSettings(next);
                  persist("settings", () => saveSettings(next));
                }}
              />
              Show holidays
            </label>
          </nav>
        </DockMenu>
        <DockMenu label="Bookmarks" icon="★" disabled={locked}>
          <p className="current-spread-name">
            {spreadTitle(view, settings.inserts)}
          </p>
          <button
            disabled={locked}
            aria-pressed={!!bookmarked}
            aria-keyshortcuts="k"
            title={bookmarked ? "Remove bookmark (K)" : "Add bookmark (K)"}
            onClick={() => organizePages("bookmark")}
          >
            {bookmarked ? "Remove bookmark" : "Add bookmark"}
          </button>
          <h3>Saved bookmarks</h3>
          <div className="bookmark-list" aria-label="Saved bookmarks">
            {(settings.bookmarks ?? []).length ? (
              organization
                .filter((v) => settings.bookmarks?.includes(spreadId(v)))
                .map((v) => (
                  <div className="bookmark-row" key={spreadId(v)}>
                    {editingBookmark === spreadId(v) ? (
                      <form
                        className="bookmark-rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          organizePages(
                            "rename-bookmark",
                            spreadId(v),
                            bookmarkDraft,
                          );
                        }}
                      >
                        <label>
                          Bookmark name
                          <input
                            autoFocus
                            value={bookmarkDraft}
                            disabled={locked}
                            aria-describedby="bookmark-name-help"
                            aria-invalid={!!bookmarkRenameError}
                            onChange={(e) => {
                              setBookmarkDraft(e.target.value);
                              setBookmarkRenameError("");
                            }}
                          />
                        </label>
                        <small id="bookmark-name-help">
                          1–60 characters. Letters, numbers, spaces, and - _ '
                          &amp; ( ) . , :
                        </small>
                        {bookmarkRenameError && (
                          <p role="alert">{bookmarkRenameError}</p>
                        )}
                        <div>
                          <button disabled={locked} type="submit">
                            Save
                          </button>{" "}
                          <button
                            disabled={locked}
                            type="button"
                            onClick={() => setEditingBookmark(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          disabled={locked}
                          aria-current={
                            spreadId(v) === spreadId(view) ? "page" : undefined
                          }
                          onClick={() => navigate(v)}
                        >
                          ★ {bookmarkNames[spreadId(v)]}
                          {bookmarkNames[spreadId(v)] !==
                            spreadTitle(v, settings.inserts) && (
                            <small>{spreadTitle(v, settings.inserts)}</small>
                          )}
                        </button>
                        <button
                          disabled={locked}
                          title="Rename"
                          aria-label={`Rename bookmark ${bookmarkNames[spreadId(v)]}`}
                          onClick={() => {
                            setEditingBookmark(spreadId(v));
                            setBookmarkDraft(bookmarkNames[spreadId(v)]);
                            setBookmarkRenameError("");
                          }}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" />
                            <path d="m14 5 5 5" />
                          </svg>
                        </button>
                        <button
                          disabled={locked}
                          aria-label={`Remove bookmark for ${bookmarkNames[spreadId(v)]}`}
                          onClick={() =>
                            organizePages("remove-bookmark", spreadId(v))
                          }
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                ))
            ) : (
              <p>
                No bookmarks yet. Use “Add bookmark” to save the current spread
                here.
              </p>
            )}
          </div>
        </DockMenu>
        <DockMenu label="Pages" icon="▤" disabled={locked}>
          <section className="organizer" aria-label="Pages">
            <header className="organizer-header">
              <div>
                <h2>Pages</h2>
                <p>
                  A spread is two facing pages. Add pages, organize your
                  planner, or jump to a spread.
                </p>
              </div>
            </header>
            <div className="organizer-grid">
              <section className="organizer-card">
                <h3>Add pages</h3>
                <p>Add a new two-page spread beside the one you’re viewing.</p>
                <div className="organizer-controls">
                  <label>
                    Paper style{" "}
                    <select
                      aria-label="Insert paper"
                      disabled={locked}
                      value={insertType}
                      onChange={(e) => setInsertType(e.target.value as Insert)}
                    >
                      {INSERTS.map((t) => (
                        <option key={t} value={t}>
                          {t === "dot-grid"
                            ? "Dot grid"
                            : t[0].toUpperCase() + t.slice(1)}
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
                    Place new pages{" "}
                    <select
                      aria-label="Spread position"
                      disabled={locked}
                      value={position}
                      onChange={(e) =>
                        setPosition(e.target.value as "before" | "after")
                      }
                    >
                      <option value="before">Before this spread</option>
                      <option value="after">After this spread</option>
                    </select>
                  </label>
                  <button
                    disabled={locked}
                    className="organizer-primary"
                    onClick={() => organizePages("insert")}
                  >
                    Add spread
                  </button>
                </div>
              </section>
              <section className="organizer-card">
                <h3>Current spread</h3>
                <p className="current-spread-name">
                  {spreadTitle(view, settings.inserts)}
                </p>
                <div className="organizer-controls">
                  <button
                    disabled={locked}
                    onClick={() => organizePages("duplicate")}
                  >
                    Duplicate spread
                  </button>
                </div>
                <p>
                  Duplicates include handwriting and are placed {position} this
                  spread.
                </p>
                <div className="organizer-controls">
                  <label>
                    Destination{" "}
                    <select
                      aria-label="Move destination"
                      value={moveTarget}
                      disabled={locked || !view.insert}
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
                  <label>
                    Place moved pages
                    <select
                      aria-label="Move position"
                      disabled={locked || !view.insert}
                      value={movePosition}
                      onChange={(e) =>
                        setMovePosition(e.target.value as "before" | "after")
                      }
                    >
                      <option value="before">Before destination</option>
                      <option value="after">After destination</option>
                    </select>
                  </label>
                  <button
                    disabled={locked || !view.insert || !moveTarget}
                    onClick={() => organizePages("move", moveTarget)}
                  >
                    Move spread
                  </button>
                </div>

                <p>
                  {view.insert
                    ? "Page-turn arrows follow your saved order."
                    : "Only custom spreads can be moved."}
                </p>
                <button
                  disabled={locked}
                  onClick={() => organizePages("restore-order")}
                >
                  Restore original spread order
                </button>
                <p>
                  Restores the original month and week sequence. Custom spreads
                  stay in their current slots. Handwriting and bookmarks are
                  preserved.
                </p>
                <div className="organizer-danger">
                  <button
                    disabled={locked || !view.insert}
                    onClick={() => organizePages("delete")}
                  >
                    Delete custom spread
                  </button>
                  <small>
                    {view.insert
                      ? "Deletes both pages and their handwriting. You’ll be asked to confirm."
                      : "Only custom spreads can be deleted."}
                  </small>
                </div>
              </section>
              <section className="organizer-card organizer-navigation">
                <h3>Go to a spread</h3>
                <label>
                  All spreads{" "}
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
            </div>
          </section>
        </DockMenu>
        <DockMenu label="Zoom" icon="⌕" disabled={locked}>
          <div className="spread-zoom" role="group" aria-label="Spread zoom">
            <button
              aria-label="Zoom out"
              title="Zoom out (−)"
              disabled={locked || zoom <= 100}
              onClick={() => setZoom(Math.max(100, zoom - 25))}
            >
              −
            </button>
            <output aria-label="Zoom level">{zoom}%</output>
            <button
              aria-label="Zoom in"
              title="Zoom in (+)"
              disabled={locked || zoom >= 250}
              onClick={() => setZoom(Math.min(250, zoom + 25))}
            >
              +
            </button>
            <button
              title="Fit spread (0)"
              disabled={locked}
              onClick={() => setZoom(100)}
            >
              Fit spread
            </button>
            <button
              disabled={locked}
              aria-pressed={hand}
              onClick={(e) => {
                setHand(!hand);
                e.currentTarget
                  .closest<HTMLElement>("[popover]")
                  ?.hidePopover();
              }}
              title="Drag to move around the spread"
            >
              Hand
            </button>
          </div>
        </DockMenu>
        <DockMenu label="Files" icon="⇩" disabled={locked}>
          <button disabled={locked} onClick={renamePlanner}>
            Rename planner…
          </button>
          <p>
            Changes are kept in this browser on this device. Nothing is synced
            to the cloud. Use Save planner to download a file you can keep and
            open later.
          </p>
          {(!settings.lastBackup ||
            Date.now() - Date.parse(settings.lastBackup) > 7 * 86400000) && (
            <p className="backup-note">
              {settings.lastBackup
                ? "It has been over a week since a planner file download. "
                : "Your handwriting stays on this device. "}
              Use Save planner and keep the downloaded file in a safe location.
            </p>
          )}
          <div className="file-actions">
            <button
              disabled={locked}
              onClick={backup}
              title="Save planner (Ctrl+S / Cmd+S)"
              aria-keyshortcuts="Control+s Meta+s"
            >
              Save planner…
            </button>
            <button
              disabled={locked}
              onClick={() => input.current?.click()}
              title="Open planner (Ctrl+O / Cmd+O)"
              aria-keyshortcuts="Control+o Meta+o"
            >
              Open planner…
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
          <section className="pdf-panel" aria-label="PDF export">
            <p>
              PDF includes page templates, handwriting, and text, with one
              two-page spread per sheet. Keep saved planner files for editable
              recovery.
            </p>
            <label>
              Pages to export{" "}
              <select
                aria-label="PDF pages"
                disabled={locked}
                value={pdfScope}
                onChange={(e) => {
                  setPdfScope(e.target.value as "current" | "binder");
                  setPdfFile(null);
                  setPdfProgress("");
                }}
              >
                <option value="current">Current spread</option>
                <option value="binder">Entire binder</option>
              </select>
            </label>{" "}
            <button disabled={locked} onClick={exportPdf}>
              Create PDF
            </button>{" "}
            {pdfAbort.current && (
              <button onClick={() => pdfAbort.current?.abort()}>
                Cancel PDF
              </button>
            )}
            {pdfFile && (
              <a
                href={pdfFile.url}
                download={pdfFile.name}
                onClick={(e) =>
                  e.currentTarget
                    .closest<HTMLElement>("[popover]")
                    ?.hidePopover()
                }
              >
                Download PDF
              </a>
            )}
            <p role="status">{pdfProgress}</p>
          </section>
        </DockMenu>
        <button
          className="dock-launcher"
          disabled={locked}
          onClick={() => setHelp(true)}
          aria-label="Help and installation"
          title="Help and installation (?)"
        >
          <span aria-hidden="true">?</span>
          <small>Help</small>
        </button>
      </aside>
      <div className="workspace">
        <div className="spread-navigation">
          <div
            className="content-navigation"
            role="group"
            aria-label="Spreads with content"
          >
            <button
              disabled={locked || !content.previous}
              title="Previous with content (Shift+←)"
              aria-keyshortcuts="Shift+ArrowLeft"
              aria-label="Previous with content"
              onClick={() => content.previous && navigate(content.previous)}
            >
              ‹ ●
            </button>
            <button
              disabled={locked || !content.next}
              title="Next with content (Shift+→)"
              aria-keyshortcuts="Shift+ArrowRight"
              aria-label="Next with content"
              onClick={() => content.next && navigate(content.next)}
            >
              ● ›
            </button>
          </div>
          <button
            disabled={locked}
            aria-label="Previous spread"
            title="Previous spread (←)"
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
            title="Next spread (→)"
            onClick={() => turnPage(1)}
          >
            ›
          </button>
        </div>
        <SpreadViewport
          locked={locked}
          hand={hand || spacePan}
          zoom={zoom}
          pinchDisabled={operation || !!turn || help}
          onZoom={setZoom}
          onPinch={(active) => {
            pinchingRef.current = active;
            setPinching(active);
            gesture.current = null;
            contacts.current.clear();
          }}
        >
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
                !!(e.target as Element).closest(".text-layer, .text-actions") ||
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
                    plannerName={plannerName}
                    showHolidays={settings.showHolidays !== false}
                    view={view}
                    insert={currentInsert}
                    side={side}
                    onWeek={(date) => navigate({ mode: "week", date })}
                  />
                  <TextLayer
                    blocks={pages[id]?.textBlocks ?? []}
                    active={
                      !pinching &&
                      !hand &&
                      !spacePan &&
                      !help &&
                      !operation &&
                      !turn &&
                      (tool === "text" || tool === "select")
                    }
                    colorRevision={colorRevision}
                    placing={tool === "text"}
                    defaultFontSize={textFontSize}
                    color={color}
                    reset={selectionReset}
                    onChange={(textBlocks) =>
                      changePage(
                        id,
                        pagesRef.current[id]?.strokes ?? [],
                        true,
                        textBlocks,
                      )
                    }
                  />
                  <Ink
                    selectionReset={selectionReset}
                    fingerWriting={fingerWriting}
                    strokes={pages[id]?.strokes ?? []}
                    color={color}
                    width={width}
                    tool={tool === "text" ? "browse" : tool}
                    eraser={tool === "eraser"}
                    enabled={
                      !pinching &&
                      !hand &&
                      !spacePan &&
                      !help &&
                      tool !== "browse" &&
                      tool !== "text" &&
                      !operation &&
                      !turn
                    }
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
                          plannerName={plannerName}
                          showHolidays={settings.showHolidays !== false}
                          view={turn.next}
                          insert={settings.inserts?.find(
                            (i) => i.id === turn.next.insert,
                          )}
                          side={side}
                          onWeek={() => {}}
                        />
                        <TextLayer
                          blocks={pages[id]?.textBlocks ?? []}
                          active={false}
                          placing={false}
                          color={color}
                          onChange={() => {}}
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
                  data-has-content={content.months.has(
                    `${year}-${String(i + 1).padStart(2, "0")}`,
                  )}
                  aria-label={`${month} ${year}${content.months.has(`${year}-${String(i + 1).padStart(2, "0")}`) ? ", has content" : ""}`}
                  title={`${month}${content.months.has(`${year}-${String(i + 1).padStart(2, "0")}`) ? " — has content" : ""}`}
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
        </SpreadViewport>
      </div>
      <aside className="toolbar left-dock dock" aria-label="Writing tools">
        <ToolButton
          disabled={locked}
          icon={expanded ? "collapse" : "expand"}
          label={expanded ? "Collapse writing tools" : "Expand writing tools"}
          onClick={() => setExpanded(!expanded)}
        ></ToolButton>
        {expanded && (
          <>
            <ToolButton
              icon="pen"
              label="Pen"
              disabled={locked}
              aria-pressed={!hand && tool === "pen"}
              className={!hand && tool === "pen" ? "selected" : ""}
              onClick={() => {
                setHand(false);
                setTool("pen");
              }}
            />
            {(["highlighter", "pencil", "text", "select"] as const).map((t) => (
              <ToolButton
                key={t}
                icon={t}
                label={
                  t === "select"
                    ? "Select / move"
                    : t[0].toUpperCase() + t.slice(1)
                }
                aria-pressed={!hand && tool === t}
                disabled={locked}
                className={!hand && tool === t ? "selected" : ""}
                onClick={() => {
                  setHand(false);
                  setTool(t);
                }}
              />
            ))}
            <ToolButton
              icon="eraser"
              label="Eraser"
              disabled={locked}
              aria-pressed={!hand && tool === "eraser"}
              className={!hand && tool === "eraser" ? "selected" : ""}
              onClick={() => {
                setHand(false);
                setTool("eraser");
              }}
            />
            <ToolButton
              icon="browse"
              label="Browse dates"
              disabled={locked}
              aria-pressed={!hand && tool === "browse"}
              className={!hand && tool === "browse" ? "selected" : ""}
              onClick={() => {
                setHand(false);
                setTool("browse");
              }}
            />
            <span className="divider" />
            <div className="dock-palette" role="group" aria-label="Colors">
              {palette.map(({ color: c, name }) => (
                <button
                  key={c}
                  disabled={locked}
                  className={"swatch " + (color === c ? "chosen" : "")}
                  aria-label={
                    tool === "highlighter" ? `Highlighter ${name}` : `Ink ${c}`
                  }
                  aria-pressed={color === c}
                  style={{ background: c }}
                  onClick={() => {
                    setColorRevision((n) => n + 1);
                    if (tool === "highlighter") setHighlighterColor(c);
                    else setInkColor(c);
                    setHand(false);
                    if (
                      tool !== "pencil" &&
                      tool !== "highlighter" &&
                      tool !== "text" &&
                      tool !== "select"
                    )
                      setTool("pen");
                  }}
                />
              ))}
            </div>
            <DockMenu
              label="Tool settings"
              icon="⚙"
              side="left"
              disabled={locked}
            >
              <div className="finger-setting">
                <ToolButton
                  icon="finger"
                  label="Finger writing"
                  disabled={locked}
                  aria-pressed={fingerWriting}
                  className={fingerWriting ? "selected" : ""}
                  onClick={() => setFingerWriting(!fingerWriting)}
                  hint="Finger writing: Enable touch input for fingers or touch styluses. Turn off when using a pen for palm protection."
                />
                <span>
                  Finger writing{" "}
                  <small>
                    Enable for a finger or touch stylus. Leave off when using a
                    pen for palm protection.
                  </small>
                </span>
              </div>
              <label>
                Default text font size
                <input
                  aria-label="Default text font size"
                  type="number"
                  min={8}
                  max={96}
                  value={textFontSize}
                  disabled={locked}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    if (Number.isFinite(size) && size >= 8 && size <= 96)
                      updatePreference("textFontSize", size);
                  }}
                />
              </label>
              <label className="thickness">
                Size <output>{width}</output>{" "}
                <input
                  aria-label={
                    tool === "highlighter"
                      ? "Highlighter thickness"
                      : "Pen thickness"
                  }
                  disabled={locked}
                  type="range"
                  min={tool === "highlighter" ? 12 : 1}
                  max={tool === "highlighter" ? 48 : 6}
                  step={tool === "highlighter" ? 2 : 0.5}
                  value={width}
                  onChange={(e) => {
                    const nextWidth = Number(e.target.value);
                    if (tool === "highlighter") setHighlighterWidth(nextWidth);
                    else setInkWidth(nextWidth);
                  }}
                />
              </label>
            </DockMenu>
            <ToolButton
              icon="undo"
              label="Undo"
              disabled={locked || !history.current.past.length}
              onClick={() => undo()}
            />
            <ToolButton
              icon="redo"
              label="Redo"
              disabled={locked || !history.current.future.length}
              onClick={() => undo(true)}
            />
          </>
        )}
      </aside>
      {bookmarkNotice && (
        <div
          ref={bookmarkNoticeRef}
          popover="manual"
          className="bookmark-notice"
        >
          <span role="status" aria-live="polite" aria-atomic="true">
            {bookmarkNotice.message}
          </span>
          <button
            type="button"
            aria-label="Dismiss bookmark notification"
            onClick={() => setBookmarkNotice(null)}
          >
            ✕
          </button>
        </div>
      )}
      <div className="bottom">
        <div className="status-row">
          <span role="status">
            {status} · {online ? "Online" : "Offline"}
          </span>
        </div>
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
            An app update is ready. Save a planner file before updating.{" "}
            <button disabled={locked} onClick={installUpdate}>
              Save planner and update
            </button>
          </div>
        )}
      </div>
      {help && (
        <div className="modal-backdrop">
          <section
            className="help"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="help-header">
              <h2 id="help-title">Your planner, at home on your iPad</h2>
              <button
                type="button"
                className="help-close"
                aria-label="Close help"
                onClick={() => setHelp(false)}
              >
                Close <span aria-hidden="true">×</span>
              </button>
            </div>
            <p className="help-version">
              Version {APP_VERSION}
              <button
                className="update-link"
                disabled={checkingUpdate}
                onClick={() => void checkForUpdates()}
              >
                {checkingUpdate ? "Checking…" : "Check for updates"}
              </button>
            </p>
            <p role="status">{updateMessage}</p>
            {update && (
              <p>
                <button disabled={locked} onClick={installUpdate}>
                  Save planner and update
                </button>
              </p>
            )}
            <h3>Keyboard shortcuts</h3>
            <p>
              Shortcuts pause while editing form fields and while writing or
              turning pages. Use Command instead of Ctrl on a Mac. Browser zoom
              shortcuts remain available.
            </p>
            <table className="shortcut-table">
              <thead>
                <tr>
                  <th>Keys</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {SHORTCUTS.map(([keys, action]) => (
                  <tr key={keys}>
                    <td>
                      <kbd>{keys}</kbd>
                    </td>
                    <td>{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              Open Zoom in the right toolbar and use + and − to zoom from 100%
              to 250%, or pinch with two fingers directly on the spread. Fit
              spread shows both pages again. Scroll to reach enlarged pages, or
              select Hand and drag to move around. Select a writing tool to
              resume editing.
            </p>
            <p>
              In Safari, open Share → Add to Home Screen. Open the installed
              planner online once, wait for “offline app ready,” then test
              closing and reopening it in Airplane Mode.
            </p>
            <p>
              Save planner…s regularly and save them in Files, outside the app.
              Clearing website data or losing your iPad can remove local planner
              data. A saved planner file contains editable ink and text and is
              readable, unencrypted JSON. Open planner replaces the active
              planner after confirmation.
            </p>
            <p>
              Swipe horizontally with one finger or tap an outer paper edge to
              turn pages. Use the arrows for mouse navigation. Finger writing
              disables page gestures until you switch to Browse dates. Month
              tabs jump instantly. Pages adds custom spreads, duplicates and
              ordering. Bookmarks saves favorite spreads for quick access.
              Select / move: draw a box around ink, then drag a selected stroke;
              switch tools to clear selection. Use Text to place a text block,
              then select it to edit, move, resize, or delete it. The palette
              changes selected text color. Undo reverses ink movement.
              Highlighter is translucent; Pencil varies with pressure. Export
              PDF creates a visual copy of the current spread or entire binder.
              Create it, then tap Download PDF and save in Files. PDFs cannot be
              opened as editable planners.
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
