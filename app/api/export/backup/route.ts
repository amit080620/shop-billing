import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildBackup } from "@/lib/backup";
import { logAuditEvent } from "@/lib/audit";

// A big shop's backup reads many tables.
export const maxDuration = 60;

/** Above this the file goes through storage: a function's response can't carry much more. */
const DIRECT_MAX = 4 * 1024 * 1024;
const BUCKET = "backups";

/** The shop's full backup as one Excel file. Owner only, one a minute, and every download is
 * written to the activity log so the owner can see who took one. */
export async function GET() {
  const session = await requireSession();
  if (session.role !== "owner") return new Response("Only the shop owner can download the full backup.", { status: 403 });
  const db = createSupabaseAdminClient();

  const { data: recent } = await db
    .from("audit_logs")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("action", "backup.download")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString())
    .limit(1);
  if (recent?.length) return new Response("A backup was just made. Please wait a minute and try again.", { status: 429 });

  const { file, counts, shopName } = await buildBackup(db, session.shopId);
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const fileName = `${shopName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop"}-backup-${day}.xlsx`;
  await logAuditEvent({ admin: db, shopId: session.shopId, staffId: session.userId, action: "backup.download", entityType: "shop", entityId: session.shopId, details: { sheets: counts.length, rows: counts.reduce((s, c) => s + c.rows, 0), bytes: file.length } });

  if (file.length <= DIRECT_MAX) {
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Large shop: hand the file over through a private, short-lived storage link.
  await db.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  // Only the newest one is kept: older ones have done their job.
  const { data: old } = await db.storage.from(BUCKET).list(session.shopId);
  if (old?.length) await db.storage.from(BUCKET).remove(old.map((o) => `${session.shopId}/${o.name}`));
  const path = `${session.shopId}/${Date.now()}.xlsx`;
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
  if (error) return new Response("Could not prepare the backup. Please try again.", { status: 500 });
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 600, { download: fileName });
  if (!signed?.signedUrl) return new Response("Could not prepare the backup. Please try again.", { status: 500 });
  // The Backup screen opens this link; it downloads the file and expires in ten minutes.
  return Response.json({ url: signed.signedUrl, fileName }, { headers: { "Cache-Control": "no-store" } });
}
