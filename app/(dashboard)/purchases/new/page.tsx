import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { NewPurchaseClient } from "./NewPurchaseClient";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { vendorId } = await searchParams;
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: vendors }, { data: products }] = await Promise.all([
    admin.from("vendors").select("id, name, gstin, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("products").select("id, name, hsn_code, is_pharma").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <NewPurchaseClient
      lang={lang}
      vendors={vendors ?? []}
      products={(products ?? []).map((p) => ({ id: p.id, name: p.name, hsnCode: p.hsn_code, isPharma: p.is_pharma }))}
      preselectedVendorId={vendorId ?? null}
    />
  );
}
