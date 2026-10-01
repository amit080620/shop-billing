import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { moduleLockMessage } from "@/lib/plans";
import { loadTallyExport } from "@/lib/tallyData";

/** Tally import files for a period: ?from=YYYY-MM-DD&to=YYYY-MM-DD&part=masters|vouchers. */
export async function GET(request: Request) {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "advanced_reports")) return new Response(moduleLockMessage("advanced_reports", session.businessType), { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const part = url.searchParams.get("part") === "masters" ? "masters" : "vouchers";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return new Response("Choose the dates.", { status: 400 });
  if (Date.parse(to) - Date.parse(from) > 400 * 86400000) return new Response("Export up to a year at a time.", { status: 400 });
  const out = await loadTallyExport(createSupabaseAdminClient(), session.shopId, from, to);
  return new Response(out[part], {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="tally-${part}_${from}_to_${to}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
