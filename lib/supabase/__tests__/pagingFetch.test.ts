import { describe, it, expect } from "vitest";
import { pagingFetch, MAX_ROWS } from "../pagingFetch";

type Row = { id: string; n: number };

/** A tiny PostgREST stand-in: caps responses at 1,000 rows, honours
 * limit/offset, `order=id.asc`, and an `id=in.(…)` filter. */
function fakePostgrest(rows: Row[], { hasId = true } = {}) {
  const requests: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url.toString());
    const order = url.searchParams.get("order") ?? "";
    if (!hasId && order.includes("id.")) return new Response('{"message":"column id does not exist"}', { status: 400 });
    let result = rows;
    const inFilter = url.searchParams.get("id");
    if (inFilter?.startsWith("in.(")) {
      const wanted = new Set(inFilter.slice(4, -1).split(","));
      result = result.filter((r) => wanted.has(r.id));
    }
    if (order.includes("id.asc")) result = [...result].sort((a, b) => a.id.localeCompare(b.id));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
    const page = result.slice(offset, offset + limit);
    return new Response(JSON.stringify(page), {
      headers: { "content-type": "application/json", "content-range": `${offset}-${offset + page.length - 1}/*` },
    });
  }) as typeof fetch;
  return { f, requests };
}

const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}`, n: i }));
const BASE = "https://x.supabase.co/rest/v1/bills?select=id,n&shop_id=eq.s1";

describe("pagingFetch", () => {
  it("returns every row when the table has more than 1,000", async () => {
    const rows = makeRows(2345);
    const { f } = fakePostgrest(rows);
    const res = await pagingFetch(f)(BASE);
    const body = (await res.json()) as Row[];
    expect(body.length).toBe(2345);
    expect(new Set(body.map((r) => r.id)).size).toBe(2345);
  });

  it("makes a single request when the result fits in one page", async () => {
    const { f, requests } = fakePostgrest(makeRows(10));
    const body = (await (await pagingFetch(f)(BASE)).json()) as Row[];
    expect(body.length).toBe(10);
    expect(requests.length).toBe(1);
  });

  it("leaves queries that set their own limit or range untouched", async () => {
    const { f, requests } = fakePostgrest(makeRows(3000));
    const body = (await (await pagingFetch(f)(`${BASE}&limit=5`)).json()) as Row[];
    expect(body.length).toBe(5);
    expect(requests.length).toBe(1);
  });

  it("splits a very long in.(…) filter and joins the results", async () => {
    const rows = makeRows(1200);
    const ids = rows.slice(0, 900).map((r) => r.id);
    const { f, requests } = fakePostgrest(rows);
    const body = (await (await pagingFetch(f)(`${BASE}&id=in.(${ids.join(",")})`)).json()) as Row[];
    expect(body.length).toBe(900);
    expect(requests.every((u) => u.length < 8000)).toBe(true);
  });

  it("keeps the first page instead of failing when the table has no id column", async () => {
    const { f } = fakePostgrest(makeRows(1500), { hasId: false });
    const res = await pagingFetch(f)(BASE);
    expect(res.ok).toBe(true);
    expect(((await res.json()) as Row[]).length).toBe(MAX_ROWS);
  });

  it("passes non-GET requests straight through", async () => {
    const { f, requests } = fakePostgrest(makeRows(1));
    await pagingFetch(f)(BASE, { method: "POST", body: "{}" });
    expect(requests.length).toBe(1);
  });
});
