import { describe, expect, it } from "vitest";
import { PAGE_ROWS, allRows } from "../supabase/allRows";

describe("allRows", () => {
  it("reads past the 1000 rows one query returns, a page at a time, without gaps or repeats", async () => {
    const table = Array.from({ length: 2345 }, (_, i) => i);
    const asked: [number, number][] = [];
    const { data, error } = await allRows(async (from, to) => {
      asked.push([from, to]);
      return { data: table.slice(from, Math.min(to + 1, from + PAGE_ROWS)), error: null };
    });
    expect(error).toBeNull();
    expect(data).toEqual(table);
    expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops at an error, handing back what it had", async () => {
    let n = 0;
    const r = await allRows(async () => (n++ === 0 ? { data: Array(PAGE_ROWS).fill(1), error: null } : { data: null, error: "boom" }));
    expect(r.data).toHaveLength(PAGE_ROWS);
    expect(r.error).toBe("boom");
  });
});
