import { z } from "zod";
import { GSTIN_REGEX, splitTax, round2, type SupplyType } from "../gst";

/** Normalizes null/undefined/"" (and whitespace-only strings) to `undefined`
 * BEFORE validation, so it doesn't matter whether a value is missing from
 * FormData entirely (→ null), present but blank (→ ""), or never sent
 * (→ undefined) — all three are treated the same. This is what the old
 * `.optional().or(z.literal(""))` pattern got wrong: formData.get() returns
 * `null` for a field that isn't in the form at all, which matched neither
 * branch and fell through to Zod's generic "Invalid input" error. */
function optionalText(max: number, min?: { value: number; message: string }) {
  const base = min
    ? z.string().trim().min(min.value, min.message).max(max)
    : z.string().trim().max(max);
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v ?? undefined),
    base.optional(),
  );
}

const optionalGstin = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v ?? undefined),
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN_REGEX, "Enter a valid 15-character GSTIN")
    .optional(),
).transform((v) => v ?? null);

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(120),
  price: z.coerce.number().min(0, "Price can't be negative"),
  gstPercent: z.coerce.number().min(0).max(100).default(0),
  hsnCode: optionalText(20),
  barcode: optionalText(64),
  unit: z.string().trim().max(20).default("NOS"),
  categoryId: z.string().uuid().nullable().optional(),
  trackInventory: z.coerce.boolean().default(false),
  stockQuantity: z.coerce.number().min(0).default(0),
  lowStockThreshold: z.coerce.number().min(0).default(0),
});
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(60),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const partySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: optionalText(20, { value: 6, message: "Enter a valid phone number" }),
  gstin: optionalGstin,
  address: optionalText(300),
  stateCode: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v ?? undefined),
    z.string().trim().length(2, "Select a state").optional(),
  ).transform((v) => v ?? null),
});
export const customerSchema = partySchema.extend({
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
});
export type CustomerInput = z.infer<typeof customerSchema>;
export const vendorSchema = partySchema;
export type VendorInput = z.infer<typeof vendorSchema>;

export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
export const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export const shopSettingsSchema = z.object({
  name: z.string().trim().min(1, "Shop name is required").max(120),
  legalName: optionalText(160),
  gstin: optionalGstin,
  gstScheme: z.enum(["regular", "composition"]).default("regular"),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(80),
  stateCode: z.string().trim().length(2, "Select a state"),
  pincode: optionalText(10),
  invoicePrefix: z.string().trim().max(10).default("INV"),
  upiId: optionalText(60),
});
export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;

const lineItemSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  description: z.string().min(1),
  hsnCode: z.string().nullable().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().min(0),
  gstPercent: z.coerce.number().min(0).max(100),
});

export const paymentMethods = ["cash", "card", "upi", "online", "other"] as const;

export const billSchema = z.object({
  customerId: z.string().uuid().nullable(),
  items: z.array(lineItemSchema).min(1, "Add at least one product"),
  discountType: z.enum(["percent", "flat"]),
  discountValue: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(paymentMethods).default("cash"),
});
export type BillInput = z.infer<typeof billSchema>;

export const purchaseSchema = z.object({
  vendorId: z.string().uuid(),
  vendorInvoiceNumber: z.string().trim().min(1, "Enter the vendor's invoice number").max(60),
  purchaseDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
  paidAmount: z.coerce.number().min(0),
  itcEligible: z.boolean().default(true),
  reverseCharge: z.boolean().default(false),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const paymentSchema = z.object({
  partyId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  note: z.string().trim().max(200).optional(),
});

export const staffInviteSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name is required").max(80),
  role: z.enum(["owner", "staff"]),
});

export const signupSchema = z.object({
  shopName: z.string().trim().min(1, "Shop name is required").max(120),
  ownerName: z.string().trim().min(1, "Your name is required").max(80),
  email: z.string().trim().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required"),
});

/** Shared calculation core for both sales (bills) and purchases — discount
 * applied proportionally before GST, then each line's tax is split into
 * CGST+SGST (same state as shop) or IGST (different state), never both. */
export function calculateTransactionTotals(input: {
  items: { quantity: number; unitPrice: number; gstPercent: number }[];
  discountType: "percent" | "flat";
  discountValue: number;
  paidAmount: number;
  supplyType: SupplyType;
}) {
  const subtotal = round2(
    input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  );

  const discountAmount = round2(
    input.discountType === "percent"
      ? subtotal * (input.discountValue / 100)
      : Math.min(input.discountValue, subtotal),
  );

  const taxableAmount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? taxableAmount / subtotal : 1;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  const lines = input.items.map((item) => {
    const lineSubtotal = round2(item.quantity * item.unitPrice * discountRatio);
    const { cgst, sgst, igst } = splitTax(lineSubtotal, item.gstPercent, input.supplyType);
    cgstAmount = round2(cgstAmount + cgst);
    sgstAmount = round2(sgstAmount + sgst);
    igstAmount = round2(igstAmount + igst);
    return { lineSubtotal, cgst, sgst, igst, lineGst: round2(cgst + sgst + igst) };
  });

  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);
  const total = round2(taxableAmount + gstAmount);
  const paidAmount = round2(Math.min(input.paidAmount, total));
  const balanceAmount = round2(total - paidAmount);

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    total,
    paidAmount,
    balanceAmount,
    lines,
  };
}

/** @deprecated kept as a thin wrapper so existing intra-state-only call
 * sites keep working; prefer calculateTransactionTotals directly. */
export function calculateBillTotals(input: {
  items: { quantity: number; unitPrice: number; gstPercent: number }[];
  discountType: "percent" | "flat";
  discountValue: number;
  paidAmount: number;
}) {
  const r = calculateTransactionTotals({ ...input, supplyType: "intra" });
  return {
    subtotal: r.subtotal,
    discountAmount: r.discountAmount,
    gstAmount: r.gstAmount,
    total: r.total,
    paidAmount: r.paidAmount,
    creditAmount: r.balanceAmount,
  };
}

export const itemRequestSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1, "Customer name is required").max(120),
  customerPhone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  itemDescription: z.string().trim().min(1, "Describe the item").max(300),
  advanceAmount: z.coerce.number().min(0).default(0),
  expectedDate: optionalText(20),
  notes: optionalText(300),
});
export type ItemRequestInput = z.infer<typeof itemRequestSchema>;
