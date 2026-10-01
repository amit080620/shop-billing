import { listPendingCatalogOrdersAction } from "@/lib/actions/catalog";

/** New online orders waiting for the shop — polled by the order alert. A plain GET, not a server
 * action: Next.js runs server actions one at a time, so a background poll sent as an action could
 * make a bill wait behind it. */
export async function GET() {
  const orders = await listPendingCatalogOrdersAction();
  return Response.json(orders, { headers: { "Cache-Control": "no-store" } });
}
