import { Building2 } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadAccounts } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";
import { AccountsClient } from "./AccountsClient";

/** Companies and travel agents: picked on a booking, they bring their rate, GST details or commission. */
export default async function AccountsPage() {
  const gate = await hotelGate("hotel_operations");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const accounts = await loadAccounts(admin, session.shopId);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Companies & agents")} subtitle={t("Agreed rates, GST details and commission")} icon={<Building2 size={18} strokeWidth={1.8} />} />
      <AccountsClient accounts={accounts} />
    </div>
  );
}
