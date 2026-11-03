import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireSuperAdmin } from "@/lib/admin-auth";

/** The SQL files the admin panel offers to copy while the database waits for them (the garment
 * banner on /admin), read from this deploy's own supabase/migrations — next.config traces them in. */
const MIGRATION_FILES = ["0060_stock_guard.sql", "0061_bill_payments.sql", "0062_legacy_refund_guard.sql", "0063_garment_godowns.sql"] as const;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  await requireSuperAdmin();
  const { file } = await params;
  if (!(MIGRATION_FILES as readonly string[]).includes(file)) return new Response("Not found", { status: 404 });
  const sql = await readFile(join(process.cwd(), "supabase", "migrations", file), "utf8");
  return new Response(sql, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  });
}
