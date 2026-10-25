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
  settings: { key: string; value: Settings };
}
let connection: Promise<IDBPDatabase<PlannerDB>> | undefined;
const database = () =>
  (connection ??= openDB<PlannerDB>("my-pastel-planner", 1, {
    upgrade(db) {
      db.createObjectStore("pages", { keyPath: "id" });
      db.createObjectStore("settings");
    },
  }));
export async function loadPlanner() {
  const db = await database();
  const tx = db.transaction(["pages", "settings"], "readonly");
  const [pages, settings] = await Promise.all([
    tx.objectStore("pages").getAll(),
    tx.objectStore("settings").get("main"),
  ]);
  await tx.done;
  return { pages, settings: settings ?? { view: initialView } };
}
export async function savePage(page: Page) {
  const db = await database();
  await db.put("pages", page);
}
export async function saveSettings(settings: Settings) {
  const db = await database();
  await db.put("settings", settings, "main");
}
export async function replacePlanner(raw: Backup) {
  const b = validateBackup(raw);
  const db = await database();
  const tx = db.transaction(["pages", "settings"], "readwrite");
  const done = tx.done;
  try {
    await tx.objectStore("pages").clear();
    for (const p of b.pages) await tx.objectStore("pages").put(p);
    await tx.objectStore("settings").put(b.settings, "main");
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
    await tx.objectStore("settings").put(settings, "main");
    await done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => {});
    throw e;
  }
}
