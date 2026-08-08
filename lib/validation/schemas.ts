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
  isRentable: z.coerce.boolean().default(false),
  rentalRateHourly: z.coerce.number().min(0).nullable().optional(),
  rentalRateDaily: z.coerce.number().min(0).nullable().optional(),
  rentalRateWeekly: z.coerce.number().min(0).nullable().optional(),
  rentalRateMonthly: z.coerce.number().min(0).nullable().optional(),
  securityDeposit: z.coerce.number().min(0).default(0),
  isPharma: z.coerce.boolean().default(false),
  requiresPrescription: z.coerce.boolean().default(false),
  saltComposition: optionalText(200),
  rackLocation: optionalText(60),
  drugSchedule: z.enum(["otc", "h", "h1", "x", "g"]).nullable().optional(),
  unitsPerPack: z.coerce.number().min(1).nullable().optional(),
  looseUnitName: optionalText(30),
  hasWarranty: z.coerce.boolean().default(false),
  warrantyMonths: z.coerce.number().int().min(0).max(240).nullable().optional(),
  mrp: z.coerce.number().min(0).nullable().optional(),
  metalType: z.enum(["gold", "silver"]).nullable().optional(),
  purity: optionalText(20),
  makingChargeType: z.enum(["per_gram", "flat", "percent"]).nullable().optional(),
  makingChargeValue: z.coerce.number().min(0).nullable().optional(),
  wastagePercent: z.coerce.number().min(0).max(30).nullable().optional(),
  hallmarkNumber: optionalText(30),
  offerPrice: z.coerce.number().min(0).nullable().optional(),
  offerLabel: optionalText(40),
  showInCatalog: z.coerce.boolean().default(true),
  bulkMinQty: z.coerce.number().min(0).nullable().optional(),
  bulkPrice: z.coerce.number().min(0).nullable().optional(),
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
  businessType: z
    .enum(["grocery", "restaurant", "mart", "hardware", "pharmacy", "rental", "transport", "service", "salon", "jewellery", "clinic", "general"])
    .default("general"),
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
  managerPin: optionalText(12),
});
export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;

const lineItemSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  description: z.string().min(1),
  hsnCode: z.string().nullable().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().min(0),
  gstPercent: z.coerce.number().min(0).max(100),
  // How much to actually decrement from stock/batches, in pack units — only
  // differs from `quantity` when selling loose units off a pack (e.g. 3
  // tablets sold off a 10-tablet strip decrements 0.3 packs, not 3).
  // Falls back to `quantity` when omitted, so non-pharma items are unaffected.
  stockQuantity: z.coerce.number().min(0).nullable().optional(),
  // Batch details — only meaningful on a purchase line for a pharma
  // product; ignored everywhere else.
  batchNumber: optionalText(60),
  expiryDate: optionalText(10),
  mfgDate: optionalText(10),
});

export const paymentMethods = ["cash", "card", "upi", "online", "other"] as const;

export const billSchema = z.object({
  customerId: z.string().uuid().nullable(),
  items: z.array(lineItemSchema).min(1, "Add at least one product"),
  discountType: z.enum(["percent", "flat"]),
  discountValue: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(paymentMethods).default("cash"),
  doctorName: optionalText(120),
  patientName: optionalText(120),
  // Present only when a transport-charge line was added (Transport &
  // Materials business type) — used to log a vehicle trip record after
  // the bill is created, for vehicle-wise reporting.
  tripVehicleId: z.string().uuid().nullable().optional(),
  tripKm: z.coerce.number().min(0).nullable().optional(),
  tripDriverName: optionalText(80),
  tripLoadWeight: z.coerce.number().min(0).nullable().optional(),
  tripLoadUnit: optionalText(10),
  serviceProviderName: optionalText(80),
  exchangeMetal: z.enum(["gold", "silver"]).nullable().optional(),
  exchangeDescription: optionalText(120),
  exchangeGrossWeight: z.coerce.number().min(0).nullable().optional(),
  exchangePurityPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  exchangeRatePerGram: z.coerce.number().min(0).nullable().optional(),
  exchangeValue: z.coerce.number().min(0).nullable().optional(),
});
export type BillInput = z.infer<typeof billSchema>;

export const purchaseSchema = z.object({
  vendorId: z.string().uuid(),
  vendorInvoiceNumber: z.string().trim().min(1, "Enter the vendor's invoice number").max(60),
  purchaseDate: z.string().min(1),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
  paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(paymentMethods).default("cash"),
  itcEligible: z.boolean().default(true),
  reverseCharge: z.boolean().default(false),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const paymentSchema = z.object({
  partyId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  paymentMethod: z.enum(paymentMethods).default("cash"),
  note: z.string().trim().max(200).optional(),
});

export const staffInviteSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name is required").max(80),
  role: z.enum(["owner", "manager", "staff"]),
});

export const signupSchema = z.object({
  shopName: z.string().trim().min(1, "Shop name is required").max(120),
  businessType: z
    .enum(["grocery", "restaurant", "mart", "hardware", "pharmacy", "rental", "transport", "service", "salon", "jewellery", "clinic", "general"])
    .default("general"),
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
      ? Math.min(subtotal * (input.discountValue / 100), subtotal)
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

// ─── Rentals ────────────────────────────────────────────────────────────
export const rentalRateTypes = ["hourly", "daily", "weekly", "monthly"] as const;

export const rentalItemSchema = z.object({
  productId: z.string().uuid().nullable(),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  rateType: z.enum(rentalRateTypes),
  rate: z.coerce.number().min(0),
  duration: z.coerce.number().positive("Duration must be greater than 0"),
  gstPercent: z.coerce.number().min(0).max(100).default(0),
  depositPerUnit: z.coerce.number().min(0).default(0),
});
export type RentalItemInput = z.infer<typeof rentalItemSchema>;

export const rentalSchema = z.object({
  customerId: z.string().uuid().nullable(),
  startDate: z.string().min(1, "Pick a start date"),
  endDate: z.string().min(1, "Pick an end date"),
  items: z.array(rentalItemSchema).min(1, "Add at least one item"),
  deliveryRequired: z.boolean().default(false),
  deliveryAddress: optionalText(300),
  deliveryCharge: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(paymentMethods).default("cash"),
  notes: optionalText(300),
});
export type RentalInput = z.infer<typeof rentalSchema>;

/** Rental charges follow the same CGST/SGST vs IGST logic as a sale, but
 * the security deposit is excluded from the taxable value — it's a
 * refundable deposit, not consideration for a supply, so GST doesn't
 * apply to it. Delivery charge is added after tax as a pragmatic
 * simplification; a composite-supply treatment would tax it at the same
 * rate as the goods — worth a CA's review for high-value rental
 * businesses. */
export function calculateRentalTotals(input: {
  items: { quantity: number; rate: number; duration: number; gstPercent: number; depositPerUnit: number }[];
  deliveryCharge: number;
  paidAmount: number;
  supplyType: SupplyType;
}) {
  let subtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  let depositTotal = 0;

  const lines = input.items.map((item) => {
    const lineSubtotal = round2(item.quantity * item.rate * item.duration);
    subtotal = round2(subtotal + lineSubtotal);
    depositTotal = round2(depositTotal + item.quantity * item.depositPerUnit);
    const { cgst, sgst, igst } = splitTax(lineSubtotal, item.gstPercent, input.supplyType);
    cgstAmount = round2(cgstAmount + cgst);
    sgstAmount = round2(sgstAmount + sgst);
    igstAmount = round2(igstAmount + igst);
    return { lineSubtotal, cgst, sgst, igst, lineGst: round2(cgst + sgst + igst) };
  });

  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);
  const rentalTotal = round2(subtotal + gstAmount + input.deliveryCharge);
  const total = round2(rentalTotal + depositTotal);
  const paidAmount = round2(Math.min(input.paidAmount, total));
  const balanceAmount = round2(Math.max(0, total - paidAmount));

  return {
    subtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    depositTotal,
    rentalTotal,
    total,
    paidAmount,
    balanceAmount,
    lines,
  };
}
