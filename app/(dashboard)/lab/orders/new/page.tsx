import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { NewOrderClient } from "./NewOrderClient";

export default async function NewLabOrderPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: tests }, { data: packages }, { data: patients }, { data: staff }] = await Promise.all([
    admin.from("lab_tests").select("id, name, price, sample_type").eq("shop_id", session.shopId).eq("is_active", true).order("name"),
    admin.from("lab_packages").select("id, name, price").eq("shop_id", session.shopId).eq("is_active", true).order("name"),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("staff").select("id, name").eq("shop_id", session.shopId).neq("role", "owner"),
  ]);

  return (
    <NewOrderClient
      lang={lang}
      tests={(tests ?? []).map((t) => ({ id: t.id, name: t.name, price: Number(t.price), sampleType: t.sample_type }))}
      packages={(packages ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price) }))}
      patients={patients ?? []}
      staff={staff ?? []}
    />
  );
}
