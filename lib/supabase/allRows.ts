/** Supabase answers at most 1000 rows to one query, silently: a kirana shop with 1,500 items would
 * see only the first 1,000 on New Bill, Products or Fast Billing. This reads a list a thousand
 * rows at a time until it is all there. `page(from, to)` must order the rows the same way every
 * time — end the order with a unique column such as "id" — so no row is skipped or repeated. */
export const PAGE_ROWS = 1000;
const MAX_PAGES = 30; // 30,000 rows: far past any shop's catalogue; a guard against a runaway loop.

export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE_ROWS, (i + 1) * PAGE_ROWS - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) break;
  }
  return { data: rows, error: null };
}
