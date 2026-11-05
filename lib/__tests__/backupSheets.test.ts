import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, flattenRow, parentsFirst, sheetName } from "../backupSheets";

describe("backup sheets", () => {
  it("reads every parent before its items", () => {
    expect(parentsFirst(BACKUP_TABLES)).toBe(true);
  });

  it("has no table twice and every sheet name fits Excel", () => {
    const tables = BACKUP_TABLES.map((t) => t.table);
    expect(new Set(tables).size).toBe(tables.length);
    const used = new Set<string>();
    for (const t of BACKUP_TABLES) {
      const name = sheetName(t.sheet, used);
      expect(name.length).toBeLessThanOrEqual(31);
      expect(name).toBe(t.sheet.slice(0, 31));
    }
  });

  it("keeps the hotel's own records in its backup", () => {
    const tables = BACKUP_TABLES.map((x) => x.table);
    for (const table of ["hotel_accounts", "hotel_rate_rules", "hotel_maintenance_tickets", "hotel_housekeeping_log", "hotel_night_audits", "hotel_booking_requests", "hotel_public_pages", "hotel_halls", "hotel_events", "hotel_event_payments"]) expect(tables).toContain(table);
    // This one has no id column, and reading by a column it lacks would silently drop it.
    expect(BACKUP_TABLES.find((x) => x.table === "hotel_public_pages")?.order).toBe("shop_id");
  });

  it("never writes PINs or the shop id", () => {
    const row = flattenRow({ id: "a", shop_id: "s", manager_pin: "1234", name: "Ram", total: 10, paid: true, meta: { a: 1 }, tags: ["x"], none: null });
    expect(row).toEqual({ id: "a", name: "Ram", total: 10, paid: true, meta: '{"a":1}', tags: '["x"]', none: null });
  });

  it("cuts text that would overflow an Excel cell", () => {
    const row = flattenRow({ note: "x".repeat(40000) });
    expect(String(row.note).length).toBeLessThanOrEqual(32001);
  });

  it("makes clashing or odd sheet names unique and valid", () => {
    const used = new Set<string>();
    expect(sheetName("Bills", used)).toBe("Bills");
    expect(sheetName("bills", used)).toBe("bills 2");
    expect(sheetName("A/B: C?", used)).toBe("A-B- C-");
    expect(sheetName("x".repeat(40), used)).toHaveLength(31);
  });
});
