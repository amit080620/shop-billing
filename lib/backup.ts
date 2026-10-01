import "server-only";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKUP_TABLES, SHOP_FIELDS, flattenRow, sheetName } from "./backupSheets";

type Row = Record<string, unknown>;
// The table list is data, so the generic client is used rather than the typed one per table.
type AnyClient = SupabaseClient;

const PAGE = 1000;
const ID_CHUNK = 150;
const PARALLEL = 12;

async function readAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return rows.length ? rows : null; // a table this database doesn't have: skip it
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Builds the shop's full backup as an Excel workbook: a "Read me" sheet, the shop's details,
 * then one sheet per table that has anything in it. */
export async function buildBackup(db: AnyClient, shopId: string): Promise<{ file: Buffer; counts: { sheet: string; rows: number }[]; shopName: string }> {
  const { data: shop } = await db.from("shops").select(SHOP_FIELDS.join(", ")).eq("id", shopId).single();
  const shopRow = (shop ?? {}) as unknown as Row;
  const got = new Map<string, Row[]>();

  // Shop tables all at once (a few at a time), then the item tables, whose parents are all shop tables.
  async function inBatches(list: typeof BACKUP_TABLES, read: (t: (typeof BACKUP_TABLES)[number]) => Promise<Row[] | null>) {
    for (let i = 0; i < list.length; i += PARALLEL) {
      const batch = list.slice(i, i + PARALLEL);
      const results = await Promise.all(batch.map(read));
      batch.forEach((t, j) => {
        const rows = results[j];
        if (rows) got.set(t.table, rows);
      });
    }
  }
  await inBatches(
    BACKUP_TABLES.filter((t) => !t.parent),
    (t) => readAll((from, to) => db.from(t.table).select("*").eq("shop_id", shopId).order(t.order ?? "id").range(from, to)),
  );
  await inBatches(
    BACKUP_TABLES.filter((t) => t.parent),
    async (t) => {
      const parentIds = (got.get(t.parent!.table) ?? []).map((r) => String(r.id));
      const rows: Row[] = [];
      for (let i = 0; i < parentIds.length; i += ID_CHUNK) {
        const chunk = parentIds.slice(i, i + ID_CHUNK);
        const part = await readAll((from, to) => db.from(t.table).select("*").in(t.parent!.key, chunk).order(t.order ?? "id").range(from, to));
        if (part === null) return null;
        rows.push(...part);
      }
      return rows;
    },
  );
  const sheets = BACKUP_TABLES.filter((t) => (got.get(t.table)?.length ?? 0) > 0).map((t) => ({ sheet: t.sheet, rows: got.get(t.table)! }));

  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const readMe = [
    ["The Ray — full backup"],
    ["Shop", String(shopRow.legal_name || shopRow.name || "")],
    ["Downloaded", stamp],
    [],
    ["Each sheet is one kind of record. The id columns link them: a row in “Bill items” belongs to the bill whose id is its bill_id; customer_id points to “Customers”, product_id to “Items”."],
    ["Keep this file safe — it has your customers' names and phone numbers."],
    [],
    ["Sheet", "Rows"],
    ["Shop details", 1],
    ...sheets.map((s) => [s.sheet, s.rows.length]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readMe), sheetName("Read me", used));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([flattenRow(shopRow)]), sheetName("Shop details", used));
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.map(flattenRow)), sheetName(s.sheet, used));

  const file = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  return { file, counts: sheets.map((s) => ({ sheet: s.sheet, rows: s.rows.length })), shopName: String(shopRow.name ?? "shop") };
}
