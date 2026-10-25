import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  initialView,
  type Page,
  type Settings,
  type Backup,
  validateBackup,
} from "./model";
interface PlannerDB extends DBSchema {
  pages: { key: string; value: Page };
  settings: {
    key: string;
    value: Settings & { dataSchemaVersion?: number; layoutVersion?: number };
  };
}
let connection: Promise<IDBPDatabase<PlannerDB>> | undefined;
function database() {
  return (connection ??= openDB<PlannerDB>("my-pastel-planner", 1, {
    upgrade(db) {
      db.createObjectStore("pages", { keyPath: "id" });
      db.createObjectStore("settings");
    },
    blocking() {
      void connection?.then((db) => db.close());
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
}
export async function readPlannerRecords() {
  const db = await database();
  const tx = db.transaction(["pages", "settings"], "readonly");
  const [pages, settings] = await Promise.all([
    tx.objectStore("pages").getAll(),
    tx.objectStore("settings").get("main"),
  ]);
  await tx.done;
  return { pages, settings: settings ?? { view: initialView } };
}
export async function loadPlanner() {
  const { pages, settings: stored } = await readPlannerRecords();
  const { dataSchemaVersion, layoutVersion, ...settings } = stored;
  if (
    (dataSchemaVersion !== undefined && ![1, 2].includes(dataSchemaVersion)) ||
    (layoutVersion !== undefined && layoutVersion !== 1)
  )
    throw Error(
      "Saved data requires a different app version. Install a compatible release; do not clear storage.",
    );
  // Validate persisted records as strictly as imported records. Never repair by
  // silently dropping ink, and never overwrite unsupported/corrupt local data.
  const checked = validateBackup({
    format: "my-pastel-planner",
    schemaVersion: 2,
    layoutVersion: 1,
    appVersion: "0.4.0",
    exportedAt: new Date().toISOString(),
    pages,
    settings,
  });
  return { pages: checked.pages, settings };
}
export async function savePage(page: Page) {
  const db = await database();
  await db.put("pages", page);
}
export async function saveSettings(settings: Settings) {
  const db = await database();
  await db.put(
    "settings",
    { ...settings, dataSchemaVersion: 2, layoutVersion: 1 },
    "main",
  );
}
export async function replacePlanner(raw: Backup) {
  const b = validateBackup(raw);
  const db = await database();
  const tx = db.transaction(["pages", "settings"], "readwrite");
  const done = tx.done;
  try {
    await tx.objectStore("pages").clear();
    for (const p of b.pages) await tx.objectStore("pages").put(p);
    await tx
      .objectStore("settings")
      .put({ ...b.settings, dataSchemaVersion: 2, layoutVersion: 1 }, "main");
    await done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => {});
    throw e;
  }
}

// Organization and affected ink commit together, so a reload cannot expose half an insert/delete.
export async function saveOrganization(
  settings: Settings,
  pages: Page[] = [],
  removed: string[] = [],
) {
  const db = await database();
  const tx = db.transaction(["pages", "settings"], "readwrite");
  const done = tx.done;
  try {
    for (const id of removed) await tx.objectStore("pages").delete(id);
    for (const page of pages) await tx.objectStore("pages").put(page);
    await tx
      .objectStore("settings")
      .put({ ...settings, dataSchemaVersion: 2, layoutVersion: 1 }, "main");
    await done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => {});
    throw e;
  }
}
