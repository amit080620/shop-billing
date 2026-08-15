import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AuditClient } from "./AuditClient";

export default async function StockAuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: audit } = await admin
    .from("stock_audits")
    .select("id, status, created_at, completed_at")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!audit) {
    return <p className="text-sm text-muted">Audit not found.</p>;
  }

  const { data: items } = await admin
    .from("stock_audit_items")
    .select("id, product_name, unit, system_quantity, counted_quantity")
    .eq("audit_id", id)
    .order("product_name");

  return (
    <AuditClient
      auditId={audit.id}
      status={audit.status}
      items={(items ?? []).map((i) => ({
        id: i.id,
        productName: i.product_name,
        unit: i.unit,
        systemQuantity: Number(i.system_quantity),
        countedQuantity: i.counted_quantity !== null ? Number(i.counted_quantity) : null,
      }))}
    />
  );
}
