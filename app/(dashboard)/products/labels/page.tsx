import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/allRows";
import { LabelsClient } from "./LabelsClient";

export default async function LabelsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: products } = await allRows((from, to) =>
    admin.from("products").select("id, name, price, mrp, unit, barcode").eq("shop_id", session.shopId).order("name").order("id").range(from, to),
  );

  return (
    <LabelsClient
      shopName={session.shopName}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        mrp: p.mrp != null ? Number(p.mrp) : null,
        unit: p.unit,
        barcode: p.barcode,
      }))}
    />
  );
}
