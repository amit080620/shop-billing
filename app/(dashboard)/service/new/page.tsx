import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewJobClient } from "./NewJobClient";

export default async function NewJobPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return <NewJobClient customers={customers ?? []} />;
}
