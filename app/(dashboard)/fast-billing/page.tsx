import { requireSession } from "@/lib/auth";
import { getUiVersion } from "@/lib/uiVersion";
import { CachedFastBilling } from "./CachedFastBilling";

/** The Fast Billing counter opens at once from the copy kept on this phone, and refreshes it from
 * the server (/api/screens/fast-billing) behind the scenes. */
export default async function FastBillingPage() {
  const session = await requireSession();
  const look = await getUiVersion(session);
  return <CachedFastBilling cacheKey={`fast-billing:${session.shopId}:${session.userId}`} look={look} />;
}
