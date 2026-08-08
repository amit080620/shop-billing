import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { SellMembershipClient } from "./SellMembershipClient";

export default async function NewMembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string; memberName?: string; memberPhone?: string }>;
}) {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const { memberId, memberName, memberPhone } = await searchParams;
  const admin = createSupabaseAdminClient();

  const [{ data: plans }, { data: members }] = await Promise.all([
    admin.from("membership_plans").select("id, name, duration_days, price, pt_sessions_included").eq("shop_id", session.shopId).eq("is_active", true).order("price"),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <SellMembershipClient
      lang={lang}
      plans={(plans ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        durationDays: p.duration_days,
        price: Number(p.price),
        ptSessionsIncluded: p.pt_sessions_included,
      }))}
      members={members ?? []}
      prefillMemberId={memberId ?? null}
      prefillMemberName={memberName ?? ""}
      prefillMemberPhone={memberPhone ?? ""}
    />
  );
}
