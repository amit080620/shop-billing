/** Screens kept on this phone or computer (IndexedDB), so a busy screen like New Bill opens at once
 * from the last copy while a fresh one loads. Each copy carries SHAPE, the version of the screens'
 * data: a copy of another shape is never shown. It used to be the app's release id, which threw
 * every copy away on each release — so after every update billing waited on the network again.
 *
 * Everything here fails quietly — no storage (private window, old phone) just means the screen
 * waits for the network, as it would without this. Cleared on the log-in page, so a copy never
 * outlives the session it belongs to. */

const DB = "ray-screens";
const STORE = "copies";
/** Bump whenever what lib/billing/newBillScreen.ts or fastBillingScreen.ts returns changes shape
 * (a field added, renamed or retyped in NewBillClient's or FastBillingClient's props). */
const SHAPE = "2026-10-29";

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
  return copy && copy.build === SHAPE ? { data: copy.data, savedAt: copy.savedAt } : null;
}

export async function saveScreen<T>(key: string, data: T): Promise<void> {
  await run("readwrite", (s) => s.put({ build: SHAPE, savedAt: Date.now(), data } satisfies Copy<T>, key));
}

/** Forget every kept screen (on the log-in page, and so on log-out). */
export async function clearScreens(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}
