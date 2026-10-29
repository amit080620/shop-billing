/** Screens kept on this phone or computer (IndexedDB), so a busy screen like New Bill opens at once
 * from the last copy while a fresh one loads. Each copy is tied to the app version that saved it:
 * after an update the screen's shape may differ, so an older copy is never shown.
 *
 * Everything here fails quietly — no storage (private window, old phone) just means the screen
 * waits for the network, as it would without this. Cleared on the log-in page, so a copy never
 * outlives the session it belongs to. */

const DB = "ray-screens";
const STORE = "copies";
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

type Copy<T> = { build: string; savedAt: number; data: T };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

/** The copy saved under `key` by this version of the app, or null. */
export async function readScreen<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  const copy = await run<Copy<T> | undefined>("readonly", (s) => s.get(key) as IDBRequest<Copy<T> | undefined>);
  return copy && copy.build === BUILD ? { data: copy.data, savedAt: copy.savedAt } : null;
}

export async function saveScreen<T>(key: string, data: T): Promise<void> {
  await run("readwrite", (s) => s.put({ build: BUILD, savedAt: Date.now(), data } satisfies Copy<T>, key));
}

/** Forget every kept screen (on the log-in page, and so on log-out). */
export async function clearScreens(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}
