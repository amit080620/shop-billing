import { describe, expect, it } from "vitest";
import { offlineCopyChanges } from "../offline-db";

const item = (id: string, price = 10, barcode: string | null = null) => ({ id, name: `Item ${id}`, price, barcode });

describe("offline copy changes", () => {
  it("writes nothing when nothing changed", () => {
    const rows = [item("a"), item("b", 20, "890")];
    expect(offlineCopyChanges(rows, rows.map((r) => ({ ...r })))).toEqual({ put: [], remove: [] });
  });

  it("writes a new item and a changed price, and only those", () => {
    const { put, remove } = offlineCopyChanges([item("a"), item("b")], [item("a"), item("b", 25), item("c")]);
    expect(put.map((r) => r.id)).toEqual(["b", "c"]);
    expect(put[0].price).toBe(25);
    expect(remove).toEqual([]);
  });

  it("removes an item the shop no longer has", () => {
    expect(offlineCopyChanges([item("a"), item("b")], [item("a")])).toEqual({ put: [], remove: ["b"] });
  });

  it("notices a barcode added or taken away", () => {
    expect(offlineCopyChanges([item("a")], [item("a", 10, "890")]).put).toHaveLength(1);
    expect(offlineCopyChanges([item("a", 10, "890")], [item("a")]).put).toHaveLength(1);
  });

  it("treats a missing value and null as the same", () => {
    const old = { id: "a", name: "A" } as { id: string; name: string; hsn?: string | null };
    expect(offlineCopyChanges([old], [{ id: "a", name: "A", hsn: null }]).put).toEqual([]);
  });

  it("writes everything into an empty copy", () => {
    expect(offlineCopyChanges([], [item("a"), item("b")]).put).toHaveLength(2);
  });
});
