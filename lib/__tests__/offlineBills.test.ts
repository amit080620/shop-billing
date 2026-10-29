import { describe, expect, it, vi, beforeEach } from "vitest";
import { isClientRef, offlineIssuedAt } from "../offlineBills";
import type { PendingBill } from "../offline-db";

describe("when an offline bill was issued", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("keeps the phone's time for a bill made earlier this GST month", () => {
    expect(offlineIssuedAt("2026-10-20T09:30:00Z", now).toISOString()).toBe("2026-10-20T09:30:00.000Z");
    expect(offlineIssuedAt("2026-10-14T09:30:00Z", now).toISOString()).toBe("2026-10-14T09:30:00.000Z");
  });
  it("uses the time it reaches the server when the phone's date can't be trusted or the month may be filed", () => {
    expect(offlineIssuedAt("2026-10-25T09:00:00Z", now)).toBe(now); // in the future
    expect(offlineIssuedAt("2026-10-01T09:00:00Z", now)).toBe(now); // over a week old
    expect(offlineIssuedAt("2026-09-30T09:00:00Z", new Date("2026-10-02T12:00:00Z")).toISOString()).toBe("2026-10-02T12:00:00.000Z"); // last month
    expect(offlineIssuedAt("not a date", now)).toBe(now);
    expect(offlineIssuedAt(undefined, now)).toBe(now);
  });
  it("only takes the phone's own ids", () => {
    expect(isClientRef("OFFLINE-1793000000000-k3j9x2")).toBe(true);
    expect(isClientRef("2026-27/00001")).toBe(false);
    expect(isClientRef("OFFLINE-1-x")).toBe(false);
  });
});

// The background sync, with the phone's store and the server faked.
const store = new Map<string, PendingBill>();
const action = vi.fn();
vi.mock("../offline-db", () => ({
  getPendingBills: async () => [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  updatePendingBill: async (b: PendingBill) => void store.set(b.localId, b),
  removePendingBill: async (id: string) => void store.delete(id),
}));
vi.mock("../actions/bills", () => ({ syncOfflineBillAction: (p: unknown) => action(p) }));
vi.mock("../bluetooth-print", () => ({ printViaBluetooth: vi.fn(), shouldDefaultToBluetooth: () => false }));
vi.stubGlobal("window", { dispatchEvent: vi.fn() });

const bill = (localId: string, shopId: string | undefined, createdAt: string): PendingBill => ({
  localId,
  shopId,
  customerId: null,
  customerName: null,
  items: [{ productId: "p1", name: "Rice", hsnCode: null, quantity: 1, unitPrice: 50, gstPercent: 5 }],
  discountType: "flat",
  discountValue: 0,
  paidAmount: 50,
  paymentMethod: "cash",
  createdAt,
  status: "pending",
});

describe("syncing waiting bills", () => {
  beforeEach(() => {
    store.clear();
    action.mockReset();
  });

  it("sends this shop's bills oldest first with their own id and time, and never another shop's", async () => {
    const { syncPendingBills } = await import("../offlineSync");
    store.set("OFFLINE-2-b", bill("OFFLINE-2-b", "shop-a", "2026-10-20T10:00:00Z"));
    store.set("OFFLINE-1-a", bill("OFFLINE-1-a", "shop-a", "2026-10-20T09:00:00Z"));
    store.set("OFFLINE-3-c", bill("OFFLINE-3-c", "shop-b", "2026-10-20T08:00:00Z"));
    action.mockResolvedValue({ billId: "x", invoiceNumber: "2026-27/00001" });
    expect(await syncPendingBills("shop-a")).toEqual({ synced: 2, failed: 0, stillOffline: false });
    expect(action.mock.calls.map(([p]) => [p.clientRef, p.createdAt])).toEqual([
      ["OFFLINE-1-a", "2026-10-20T09:00:00Z"],
      ["OFFLINE-2-b", "2026-10-20T10:00:00Z"],
    ]);
    expect([...store.keys()]).toEqual(["OFFLINE-3-c"]);
  });

  it("keeps a bill waiting when the connection drops, and marks one the server refuses", async () => {
    const { syncPendingBills } = await import("../offlineSync");
    store.set("OFFLINE-1-a", bill("OFFLINE-1-a", "shop-a", "2026-10-20T09:00:00Z"));
    store.set("OFFLINE-2-b", bill("OFFLINE-2-b", "shop-a", "2026-10-20T10:00:00Z"));
    action.mockResolvedValueOnce({ error: "Product not found" }).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await syncPendingBills("shop-a")).toEqual({ synced: 0, failed: 1, stillOffline: true });
    expect(store.get("OFFLINE-1-a")?.status).toBe("failed");
    expect(store.get("OFFLINE-1-a")?.syncError).toBe("Product not found");
    expect(store.get("OFFLINE-2-b")?.status).toBe("pending");
    // A refused bill isn't retried by itself, only when asked.
    action.mockResolvedValue({ billId: "x", invoiceNumber: "n" });
    await syncPendingBills("shop-a");
    expect(store.has("OFFLINE-1-a")).toBe(true);
    await syncPendingBills("shop-a", { retryFailed: true });
    expect(store.size).toBe(0);
  });
});
