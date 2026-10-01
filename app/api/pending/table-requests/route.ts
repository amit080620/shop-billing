import { listPendingTableRequestsAction } from "@/lib/actions/table-orders";

/** QR table orders waiting at the tables screen — a plain GET for the same reason as
 * ../catalog-orders: a background poll must never queue ahead of a bill. */
export async function GET() {
  const requests = await listPendingTableRequestsAction();
  return Response.json(requests, { headers: { "Cache-Control": "no-store" } });
}
