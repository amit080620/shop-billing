import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLowStockReorderItemsAction } from "@/lib/actions/purchases";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { PackagePlus } from "lucide-react";
import { ReorderClient } from "./ReorderClient";

export default async function ReorderPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [items, { data: vendors }] = await Promise.all([
    getLowStockReorderItemsAction(),
    admin.from("vendors").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reorder stock"
        subtitle="What's running low — send it to a vendor, or start a purchase directly"
        icon={<PackagePlus size={18} strokeWidth={1.8} />}
      />

      {items.length === 0 ? (
        <EmptyState text="Nothing is running low right now." />
      ) : (
        <ReorderClient items={items} vendors={vendors ?? []} shopName={session.shopName} />
      )}
    </div>
  );
}
