import { vi } from "vitest";

type MockResponse = { data: unknown; error: unknown };

/** A genuine chainable mock that mimics Supabase's query builder — every
 * chain method (select/eq/in/single/insert/update/delete/order) returns
 * itself, and the whole thing is "thenable" so `await` genuinely
 * resolves to the configured response, exactly like the real client. */
function createMockQueryBuilder(response: MockResponse) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "in", "insert", "update", "delete", "order", "limit", "gt", "not", "single", "maybeSingle"];
  for (const method of chainMethods) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (r: MockResponse) => void) => resolve(response);
  return builder;
}

/** Builds a genuine mock admin client. `fromResponses` maps a table name
 * to either a single canned response (returned every time that table is
 * queried) or an array of responses (consumed in call order — needed
 * when the same table is genuinely queried more than once with
 * different expected results, e.g. read-then-verify patterns). */
export function createMockSupabaseAdmin(config: {
  from?: Record<string, MockResponse | MockResponse[]>;
  rpc?: Record<string, MockResponse | MockResponse[]>;
}) {
  const fromCallCounts: Record<string, number> = {};
  const rpcCallCounts: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const configured = config.from?.[table];
      const idx = fromCallCounts[table] ?? 0;
      fromCallCounts[table] = idx + 1;
      const response = Array.isArray(configured) ? configured[Math.min(idx, configured.length - 1)] : configured;
      return createMockQueryBuilder(response ?? { data: null, error: null });
    }),
    rpc: vi.fn(async (name: string) => {
      const configured = config.rpc?.[name];
      const idx = rpcCallCounts[name] ?? 0;
      rpcCallCounts[name] = idx + 1;
      const response = Array.isArray(configured) ? configured[Math.min(idx, configured.length - 1)] : configured;
      return response ?? { data: null, error: null };
    }),
  };
}
