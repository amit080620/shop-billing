import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseAdmin } from "./mockSupabase";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import { importMedicineLibraryRowsAction } from "../clinic";

const mockSession = { shopId: "shop-1", userId: "staff-1" } as Awaited<ReturnType<typeof requireSession>>;

describe("importMedicineLibraryRowsAction — genuine regression test for the real reported bug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSession).mockResolvedValue(mockSession);
  });

  it("genuinely never crashes when a cell is a raw NUMBER (exactly what Excel/SheetJS produces for numeric columns)", async () => {
    const mockAdmin = createMockSupabaseAdmin({
      from: { shop_medicine_library: { data: null, error: null } },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const rows = [
      ["name", "price", "manufacturer_name"],
      // Genuinely a raw number for price — this is exactly what broke
      // the old code, which called .trim() directly on every cell.
      ["Augmentin 625 Duo Tablet", 223.42, "Glaxo SmithKline"],
    ];

    const result = await importMedicineLibraryRowsAction(rows as unknown as string[][]);
    expect(result.error).toBeUndefined();
    expect(result.imported).toBe(1);
  });

  it("genuinely handles a completely empty cell without crashing", async () => {
    const mockAdmin = createMockSupabaseAdmin({
      from: { shop_medicine_library: { data: null, error: null } },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const rows = [
      ["name", "price"],
      ["Paracetamol", null],
    ];

    const result = await importMedicineLibraryRowsAction(rows as unknown as string[][]);
    expect(result.error).toBeUndefined();
    expect(result.imported).toBe(1);
  });

  it("genuinely rejects a file with no recognizable name column", async () => {
    const rows = [["foo", "bar"], ["x", "y"]];
    const result = await importMedicineLibraryRowsAction(rows);
    expect(result.error).toBeDefined();
    expect(result.imported).toBe(0);
  });

  it("genuinely rejects an empty file", async () => {
    const result = await importMedicineLibraryRowsAction([["name"]]);
    expect(result.error).toBeDefined();
  });
});
