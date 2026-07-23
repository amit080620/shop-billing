import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewBillClient } from "./NewBillClient";

export default async function NewBillPage() {
  const session = await requireSession();

  if (!session.shopStateCode) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted">
          Add your shop&apos;s state in GST settings before billing — it decides whether a sale
          is CGST+SGST or IGST.
        </p>
        <Link href="/settings" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Go to settings
        </Link>
      </div>
    );
  }

  const admin = createSupabaseAdminClient();

  const [{ data: products }, { data: customers }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, gst_percent, hsn_code")
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("customers")
      .select("id, name, phone, gstin, state_code")
      .eq("shop_id", session.shopId)
      .order("name"),
  ]);

  return (
    <NewBillClient
      shopStateCode={session.shopStateCode}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        gstPercent: Number(p.gst_percent),
        hsnCode: p.hsn_code,
      }))}
      customers={customers ?? []}
    />
  );
}
