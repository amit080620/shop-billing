import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseAdmin } from "./mockSupabase";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createBillCore } from "../bills";
import type { SessionContext } from "@/lib/auth";

const mockSession: SessionContext = {
  userId: "staff-1",
  email: "owner@example.com",
  shopId: "shop-1",
  shopName: "Test Shop",
  staffName: "Test Owner",
  role: "owner",
  permissions: [],
  shopStateCode: "27",
  shopGstin: "27ABCDE1234F1Z5",
  shopLogoUrl: null,
  shopUpiId: null,
  gstScheme: "regular",
  priceIncludesGst: false,
  businessType: "grocery",
  businessTypeLocked: false,
  enabledModules: null,
};

const genuineProduct = {
  id: "prod-1",
  name: "Test Product",
  price: 100,
  gst_percent: 18,
  hsn_code: "1234",
  track_inventory: false,
  stock_quantity: 0,
  is_pharma: false,
  requires_prescription: false,
  has_warranty: false,
  warranty_months: null,
  mrp: null,
};

describe("createBillCore — genuine Server Action test using a mocked Supabase client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("genuinely creates a simple single-item retail bill successfully", async () => {
    const mockAdmin = createMockSupabaseAdmin({
      from: {
        products: { data: [genuineProduct], error: null },
        staff: { data: { branch_id: null }, error: null },
        bills: { data: { id: "bill-1" }, error: null },
        bill_items: { data: null, error: null },
        shops: { data: { loyalty_points_per_100: 0 }, error: null },
      },
      rpc: {
        next_invoice_number: { data: 1, error: null },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await createBillCore(mockSession, {
      customerId: null,
      items: [
        {
          productId: "prod-1",
          description: "Test Product",
          hsnCode: "1234",
          quantity: 1,
          unitPrice: 100,
          gstPercent: 18,
          stockQuantity: 1,
        },
      ],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 118,
      paymentMethod: "cash",
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.billId).toBe("bill-1");
      expect(result.invoiceNumber).toContain("00001");
    }
  });

  it("genuinely returns an error when a product can't be verified against this shop's catalog", async () => {
    const mockAdmin = createMockSupabaseAdmin({
      from: {
        products: { data: [], error: null },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await createBillCore(mockSession, {
      customerId: null,
      items: [
        {
          productId: "prod-does-not-exist",
          description: "Ghost Product",
          hsnCode: null,
          quantity: 1,
          unitPrice: 100,
          gstPercent: 18,
          stockQuantity: 1,
        },
      ],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 118,
      paymentMethod: "cash",
    });

    expect("error" in result).toBe(true);
  });

  it("genuinely returns an error when invoice-number generation fails", async () => {
    const mockAdmin = createMockSupabaseAdmin({
      from: {
        products: { data: [genuineProduct], error: null },
      },
      rpc: {
        next_invoice_number: { data: null, error: { message: "genuine simulated failure" } },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await createBillCore(mockSession, {
      customerId: null,
      items: [
        {
          productId: "prod-1",
          description: "Test Product",
          hsnCode: "1234",
          quantity: 1,
          unitPrice: 100,
          gstPercent: 18,
          stockQuantity: 1,
        },
      ],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 118,
      paymentMethod: "cash",
    });

    expect("error" in result).toBe(true);
  });
});
