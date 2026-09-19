/** Supabase's REST layer (PostgREST) returns at most 1,000 rows per request
 * and says nothing when it truncates. Across this app ~200 plain selects
 * build totals, reports and pickers from "all rows" — dashboard balances,
 * GST returns, CA exports, a pharmacy's product list — so every one of
 * them went quietly wrong once a shop passed 1,000 rows. Separately, a
 * long `.in("bill_id", ids)` filter overflows the request URL.
 *
 * This fetch wrapper fixes both centrally for the service-role client:
 * - a GET that asked for no explicit limit/range and came back with a full
 *   1,000 rows is re-read page by page (ordered, with an `id` tie-break so
 *   pages never overlap) and returned as one list;
 * - a GET whose URL is too long because of an `in.(…)` filter is split
 *   into chunks of ids and the results joined.
 * Queries that set their own limit/range, want a single object, or aren't
 * GETs pass straight through. */

export const MAX_ROWS = 1000;
const MAX_URL_LENGTH = 6000;
const IDS_PER_CHUNK = 150;

type Fetch = typeof fetch;

export function pagingFetch(baseFetch: Fetch = fetch): Fetch {
  async function fetchAll(url: URL, headers: Headers): Promise<Response> {
    const first = await baseFetch(url, { method: "GET", headers });
    if (!first.ok) return first;
    const rows: unknown = await first.clone().json();
    if (!Array.isArray(rows) || rows.length < MAX_ROWS) return first;

    const ordered = new URL(url);
    const order = ordered.searchParams.get("order");
    if (!order) ordered.searchParams.set("order", "id.asc");
    else if (!/(^|,)id\./.test(order)) ordered.searchParams.set("order", `${order},id.asc`);

    const all: unknown[] = [];
    for (let offset = 0; ; offset += MAX_ROWS) {
      const page = new URL(ordered);
      page.searchParams.set("limit", String(MAX_ROWS));
      page.searchParams.set("offset", String(offset));
      const res = await baseFetch(page, { method: "GET", headers });
      // A table without an `id` column can't be paged this way; keep the
      // original (first 1,000) answer rather than failing the query.
      if (!res.ok) return offset === 0 ? first : res;
      const chunk = (await res.json()) as unknown[];
      all.push(...chunk);
      if (chunk.length < MAX_ROWS) break;
    }
    return jsonResponse(all, first.headers);
  }

  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const isRestRead = method === "GET" && url.pathname.includes("/rest/v1/");
    const wantsOneObject = (headers.get("Accept") ?? "").includes("vnd.pgrst.object");
    const explicitlyPaged = url.searchParams.has("limit") || url.searchParams.has("offset") || headers.has("Range");
    if (!isRestRead || wantsOneObject || explicitlyPaged) return baseFetch(input, init);

    const longIn = url.toString().length > MAX_URL_LENGTH ? findLongestInFilter(url) : null;
    if (!longIn) return fetchAll(url, headers);

    const results: unknown[] = [];
    let last: Response | null = null;
    for (let i = 0; i < longIn.values.length; i += IDS_PER_CHUNK) {
      const chunkUrl = new URL(url);
      chunkUrl.searchParams.set(longIn.key, `in.(${longIn.values.slice(i, i + IDS_PER_CHUNK).join(",")})`);
      last = await fetchAll(chunkUrl, headers);
      if (!last.ok) return last;
      results.push(...((await last.clone().json()) as unknown[]));
    }
    return jsonResponse(results, last?.headers ?? new Headers());
  };
}

/** The query parameter holding the longest `in.(…)` list, e.g.
 * bill_id=in.(a,b,c). Only a plain `in` can be split and re-joined; a
 * `not.in` split into chunks would let every chunk's ids back in. */
function findLongestInFilter(url: URL): { key: string; values: string[] } | null {
  let best: { key: string; values: string[] } | null = null;
  for (const [key, value] of url.searchParams) {
    const m = value.match(/^in\.\((.*)\)$/);
    if (!m) continue;
    const values = m[1].split(",");
    if (!best || values.length > best.values.length) best = { key, values };
  }
  return best;
}

function jsonResponse(rows: unknown[], from: Headers): Response {
  const headers = new Headers(from);
  headers.delete("content-length");
  headers.delete("content-encoding");
  const total = headers.get("content-range")?.split("/")[1];
  headers.set("content-range", `${rows.length ? `0-${rows.length - 1}` : "*"}/${total ?? "*"}`);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(rows), { status: 200, headers });
}
