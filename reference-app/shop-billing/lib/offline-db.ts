import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type CachedProduct = {
  id: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  barcode: string | null;
  unit: string;
};

export type CachedCustomer = {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  stateCode: string | null;
};

export type ShopContext = {
  shopId: string;
  shopName: string;
  shopStateCode: string;
  staffId: string;
  staffName: string;
  invoicePrefix: string;
  cachedAt: string;
};

export type PendingBillItem = {
  productId: string | null;
  name: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
};

export type PendingBill = {
  localId: string; // temporary, client-generated — replaced by the real invoice number on sync
  customerId: string | null;
  customerName: string | null;
  items: PendingBillItem[];
  discountType: "percent" | "flat";
  discountValue: number;
  paidAmount: number;
  paymentMethod: "cash" | "card" | "upi" | "online" | "other";
  createdAt: string; // client clock — used to preserve chronological sync order
  status: "pending" | "syncing" | "failed";
  syncError?: string;
};

interface OfflineDB extends DBSchema {
  products: { key: string; value: CachedProduct };
  customers: { key: string; value: CachedCustomer };
  shopContext: { key: string; value: ShopContext };
  pendingBills: { key: string; value: PendingBill };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("Offline DB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>("shop-billing-offline", 1, {
      upgrade(db) {
        db.createObjectStore("products", { keyPath: "id" });
        db.createObjectStore("customers", { keyPath: "id" });
        db.createObjectStore("shopContext", { keyPath: "shopId" });
        db.createObjectStore("pendingBills", { keyPath: "localId" });
      },
    });
  }
  return dbPromise;
}

/** Called during normal online use (e.g. every time the New Bill page loads
 * successfully) so there's always a reasonably fresh local copy to work
 * from if the connection drops. */
export async function cacheForOffline(
  shop: ShopContext,
  products: CachedProduct[],
  customers: CachedCustomer[],
) {
  const db = await getDb();
  const tx = db.transaction(["shopContext", "products", "customers"], "readwrite");
  await tx.objectStore("shopContext").put({ ...shop, cachedAt: new Date().toISOString() });
  await Promise.all([
    ...products.map((p) => tx.objectStore("products").put(p)),
    ...customers.map((c) => tx.objectStore("customers").put(c)),
  ]);
  await tx.done;
}

export async function getShopContext(): Promise<ShopContext | undefined> {
  const db = await getDb();
  const all = await db.getAll("shopContext");
  return all[0]; // single-shop-per-device in practice
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  const db = await getDb();
  return db.getAll("products");
}

export async function getCachedCustomers(): Promise<CachedCustomer[]> {
  const db = await getDb();
  return db.getAll("customers");
}

export async function queueOfflineBill(bill: PendingBill) {
  const db = await getDb();
  await db.put("pendingBills", bill);
}

export async function getPendingBills(): Promise<PendingBill[]> {
  const db = await getDb();
  const all = await db.getAll("pendingBills");
  return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function updatePendingBill(bill: PendingBill) {
  const db = await getDb();
  await db.put("pendingBills", bill);
}

export async function removePendingBill(localId: string) {
  const db = await getDb();
  await db.delete("pendingBills", localId);
}
