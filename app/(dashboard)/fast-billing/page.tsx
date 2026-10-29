import { requireSession } from "@/lib/auth";
import { CachedFastBilling } from "./CachedFastBilling";

/** The Fast Billing counter opens at once from the copy kept on this phone, and refreshes it from
 * the server (/api/screens/fast-billing) behind the scenes. */
export default async function FastBillingPage() {
  const session = await requireSession();
  return <CachedFastBilling cacheKey={`fast-billing:${session.shopId}:${session.userId}`} />;
}
