import { listPurchasesAction, listPurchasePaymentsAction } from "@/lib/actions/purchases";
import { PurchaseHubClient } from "./PurchaseHubClient";

export default async function PurchaseHubPage() {
  const [purchases, payments] = await Promise.all([listPurchasesAction(), listPurchasePaymentsAction()]);
  return <PurchaseHubClient purchases={purchases} payments={payments} />;
}
