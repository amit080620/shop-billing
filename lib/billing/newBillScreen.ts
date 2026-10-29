import "server-only";
import type { ComponentProps } from "react";
import { hasPermission, type SessionContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/allRows";
import type { Lang } from "@/lib/i18n/dictionary";
import { getBarcodeScanModeAction } from "@/lib/actions/settings";
import { salesSuggestions } from "@/lib/basketAffinity";
import { buyerSchemaReady } from "@/lib/gstBuyer";
import { quotationsReady } from "@/lib/quotationsData";
import { goldRatesFrom, loadRateRows, silverRateFrom } from "@/lib/metalRates";
import { goldSchemesReady, loadSchemes } from "@/lib/goldSchemeData";
import { todayIso } from "@/lib/dateHelpers";
import { salonExtrasReady } from "@/lib/salonExtras";
import { payrollReady } from "@/lib/payrollData";
import { isModuleEnabled } from "@/lib/modules";
import { recipesReady } from "@/lib/recipeData";
import { gapsReady } from "@/lib/gapsData";
import { mergeChallanLines } from "@/lib/challans";
import { wholesaleReady } from "@/lib/wholesaleData";
import type { NewBillClient } from "@/app/(dashboard)/bills/new/NewBillClient";

export type NewBillParams = { customer?: string; provider?: string; quote?: string; scheme?: string; challans?: string };
export type NewBillProps = ComponentProps<typeof NewBillClient>;
export type NewBillScreen = { props: NewBillProps; fastBillingEnabled: boolean };

/** Opened with nothing to fill in (no customer, quotation, scheme or challans): the screen can be
 * shown from the copy kept on the phone while a fresh one loads. */
export const isPlainNewBill = (p: NewBillParams) => !p.customer && !p.provider && !p.quote && !p.scheme && !p.challans;

/** Everything the New Bill screen shows, read for one shop. The shop must have its state set. */
export async function loadNewBillScreen(
  session: SessionContext & { shopStateCode: string },
  params: NewBillParams,
  lang: Lang,
): Promise<NewBillScreen> {
  const { customer: customerParam, provider: providerParam, quote: quoteParam, scheme: schemeParam, challans: challansParam } = params;
  const admin = createSupabaseAdminClient();
  const on = (m: Parameters<typeof isModuleEnabled>[1]) => isModuleEnabled(session.enabledModules, m);

  // Speed: which optional features are set up (each answered once per server, then remembered),
  // then every read this screen needs starts at once — not one after another, as it did.
  const [recipesOn, gapsOn, wsReady, quotesReady, b2bAvailable] = await Promise.all([
    recipesReady(admin),
    gapsReady(admin),
    wholesaleReady(admin),
    quotationsReady(admin),
    buyerSchemaReady(admin),
  ]);
  const barcodeScanModeP = getBarcodeScanModeAction();
  // Raw materials (migration 0050) are stock for the kitchen, never sold on a bill.
  const rawP = recipesOn ? admin.from("products").select("id").eq("shop_id", session.shopId).eq("is_raw_material", true) : null;
  // "Buy X get Y free" offers, so the counter sees the free units before the bill is made.
  const bxgyP = on("offers") && gapsOn ? admin.from("products").select("id, bxgy_buy, bxgy_free").eq("shop_id", session.shopId).not("bxgy_buy", "is", null) : null;
  // Wholesale (migration 0053): each item's wholesale rate, and each party's rate level and beat.
  const wholesaleP = wsReady
    ? Promise.all([
        admin.from("products").select("id, wholesale_price").eq("shop_id", session.shopId).not("wholesale_price", "is", null),
        admin.from("customers").select("id, price_level, beat").eq("shop_id", session.shopId).or("price_level.eq.wholesale,beat.not.is.null"),
      ])
    : null;
  // The weighing scale's label format, if the shop set one up.
  const scaleP = gapsOn ? admin.from("shops").select("scale_barcode_prefix, scale_barcode_mode, scale_code_digits").eq("id", session.shopId).single() : null;
  const extrasP = on("customer_prepaid") ? salonExtrasReady(admin) : Promise.resolve(false);

  const [{ data: products }, { data: customers }, { frequentProductIds, affinityMap }, { data: shop }, { data: vehicles }, rateRows] = await Promise.all([
    // Every item and customer, past the 1000 rows one query returns (lib/supabase/allRows).
    allRows((from, to) =>
      admin
        .from("products")
        .select("id, name, price, offer_price, gst_percent, hsn_code, barcode, unit, track_inventory, stock_quantity, low_stock_threshold, requires_prescription, units_per_pack, loose_unit_name, metal_type, purity, making_charge_type, making_charge_value, wastage_percent, bulk_min_qty, bulk_price, hallmark_number, salt_composition")
        .eq("shop_id", session.shopId)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    allRows((from, to) =>
      admin
        .from("customers")
        .select("id, name, phone, gstin, state_code, loyalty_points")
        .eq("shop_id", session.shopId)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    // "Frequently sold" quick-add chips (milk, bread… without typing) and "bought together" — the one
    // product each item most often shares a bill with, from THIS shop's own sales (shared with the
    // dashboard's matched-pair stock check). One read of the last 30 days, kept 10 minutes.
    salesSuggestions(admin, session.shopId),
    admin.from("shops").select("invoice_prefix, loyalty_redemption_value, fast_billing_enabled").eq("id", session.shopId).single(),
    admin.from("vehicles").select("id, name, rate_per_km").eq("shop_id", session.shopId).eq("is_active", true).order("name"),
    // Today's rates — for gold, one per karat (see lib/metalRates).
    session.businessType === "jewellery" ? loadRateRows(admin, session.shopId) : Promise.resolve([]),
  ]);


  // Opened from a gold saving scheme ("Buy jewellery with it"): its value pays for the bill.
  const schemeView =
    session.businessType === "jewellery" && schemeParam && /^[0-9a-f-]{36}$/i.test(schemeParam) && isModuleEnabled(session.enabledModules, "gold_schemes") && (await goldSchemesReady(admin))
      ? (await loadSchemes(admin, session.shopId, { id: schemeParam }))[0]
      : undefined;
  const fromScheme =
    schemeView && schemeView.scheme.status === "active" && schemeView.figures.value > 0
      ? { id: schemeView.scheme.id, number: schemeView.scheme.scheme_number, value: schemeView.figures.value, complete: schemeView.figures.complete, customerId: schemeView.scheme.customer_id }
      : null;

  const quotationsAvailable = on("quotations") && quotesReady;
  // Salon: who can be picked as the stylist — the people on the payroll list.
  const { data: stylistRows } =
    session.businessType === "salon" && isModuleEnabled(session.enabledModules, "staff_payroll") && (await payrollReady(admin))
      ? await admin.from("workers").select("name").eq("shop_id", session.shopId).eq("is_active", true).order("name")
      : { data: [] };
  const { data: quote } =
    quotationsAvailable && quoteParam && /^[0-9a-f-]{36}$/i.test(quoteParam)
      ? await admin.from("quotations").select("id, quote_number, customer_id, items, discount_type, discount_value, status, valid_until").eq("id", quoteParam).eq("shop_id", session.shopId).maybeSingle()
      : { data: null };
  const fromQuote =
    quote && quote.status === "open"
      ? {
          id: quote.id,
          number: quote.quote_number,
          lines: quote.items,
          discountType: quote.discount_type,
          discountValue: Number(quote.discount_value),
          // While it is valid the quoted prices stand (the server keeps them too).
          honourPrices: !!quote.valid_until && quote.valid_until >= todayIso(),
        }
      : null;

  // Billing delivery challans: their goods, added up, for their one customer, at today's prices.
  const challanIds = (challansParam ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  const challanRows =
    challanIds.length && on("delivery_challan") && gapsOn
      ? ((await admin.from("delivery_challans").select("id, challan_number, customer_id, items").eq("shop_id", session.shopId).eq("status", "open").in("id", challanIds)).data ?? [])
      : [];
  const challanCustomer = challanRows[0]?.customer_id ?? null;
  const rawIds = new Set(rawP ? ((await rawP).data ?? []).map((p) => p.id) : []);
  const bxgyOffers = new Map<string, { buy: number; free: number }>();
  for (const r of bxgyP ? ((await bxgyP).data ?? []) : []) if (r.bxgy_buy && r.bxgy_free) bxgyOffers.set(r.id, { buy: r.bxgy_buy, free: r.bxgy_free });
  const wholesaleOf = new Map<string, number>();
  const partyOf = new Map<string, { level: "retail" | "wholesale"; beat: string | null }>();
  if (wholesaleP) {
    const [{ data: wp }, { data: parties }] = await wholesaleP;
    for (const p of wp ?? []) wholesaleOf.set(p.id, Number(p.wholesale_price));
    for (const c of parties ?? []) partyOf.set(c.id, { level: c.price_level === "wholesale" ? "wholesale" : "retail", beat: c.beat });
  }
  const { data: scaleRow } = scaleP ? await scaleP : { data: null };
  const scaleBarcode = scaleRow?.scale_barcode_prefix ? { prefix: scaleRow.scale_barcode_prefix, mode: scaleRow.scale_barcode_mode === "price" ? ("price" as const) : ("weight" as const), codeDigits: Number(scaleRow.scale_code_digits) || 5 } : null;
  const ordersAvailable = wsReady && quotationsAvailable && session.businessType === "wholesale";
  const fromChallans =
    challanRows.length && !quote && challanRows.every((c) => c.customer_id === challanCustomer)
      ? {
          ids: challanRows.map((c) => c.id),
          numbers: challanRows.map((c) => c.challan_number),
          lines: mergeChallanLines(challanRows).map((l) => ({ productId: l.productId, description: l.name, hsnCode: null, quantity: l.quantity, stockQuantity: l.quantity, unitPrice: 0, gstPercent: 0 })),
          customerId: challanCustomer,
        }
      : null;


  const props: NewBillProps = {
    shopStateCode: session.shopStateCode,
    lang,
    barcodeScanMode: await barcodeScanModeP,
    b2bAvailable,
    loyaltyRedemptionValue: Number(shop?.loyalty_redemption_value ?? 1),
    shopContext: {
      shopId: session.shopId,
      shopName: session.shopName,
      shopStateCode: session.shopStateCode,
      staffId: session.userId,
      staffName: session.staffName,
      invoicePrefix: shop?.invoice_prefix ?? "INV",
      priceIncludesGst: session.priceIncludesGst,
      gstScheme: session.gstScheme,
      canDiscount: hasPermission(session, "give_discounts"),
    },
    products: (products ?? []).filter((p) => !rawIds.has(p.id)).map((p) => ({
      id: p.id,
      name: p.name,
      // An offer price, while one is set, is what the counter charges (the server charges the same).
      price: p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price),
      gstPercent: Number(p.gst_percent),
      hsnCode: p.hsn_code,
      barcode: p.barcode,
      unit: p.unit,
      trackInventory: p.track_inventory,
      stockQuantity: Number(p.stock_quantity),
      lowStockThreshold: Number(p.low_stock_threshold),
      requiresPrescription: p.requires_prescription,
      unitsPerPack: p.units_per_pack !== null ? Number(p.units_per_pack) : null,
      looseUnitName: p.loose_unit_name,
      metalType: p.metal_type,
      purity: p.purity,
      makingChargeType: p.making_charge_type,
      makingChargeValue: p.making_charge_value !== null ? Number(p.making_charge_value) : null,
      wastagePercent: p.wastage_percent !== null ? Number(p.wastage_percent) : null,
      bulkMinQty: p.bulk_min_qty !== null ? Number(p.bulk_min_qty) : null,
      bulkPrice: p.bulk_price !== null ? Number(p.bulk_price) : null,
      hallmarkNumber: p.hallmark_number,
      // Only a pharmacy looks for same-salt substitutes.
      salt: session.businessType === "pharmacy" ? p.salt_composition : null,
      bxgy: bxgyOffers.get(p.id) ?? null,
      wholesalePrice: wholesaleOf.get(p.id) ?? null,
    })),
    customers: (customers ?? []).map((c) => ({ ...c, priceLevel: partyOf.get(c.id)?.level ?? "retail", beat: partyOf.get(c.id)?.beat ?? null })),
    frequentProductIds,
    affinityMap,
    vehicles: (vehicles ?? []).map((v) => ({ id: v.id, name: v.name, ratePerKm: Number(v.rate_per_km) })),
    goldRates: goldRatesFrom(rateRows),
    silverRate: silverRateFrom(rateRows),
    businessType: session.businessType,
    initialCustomerId: (() => {
      const wanted = fromScheme ? fromScheme.customerId : fromQuote ? quote?.customer_id : fromChallans ? fromChallans.customerId : customerParam;
      return wanted && (customers ?? []).some((c) => c.id === wanted) ? wanted : null;
    })(),
    quotationsAvailable: quotationsAvailable && !fromScheme,
    fromQuote: fromScheme ? null : fromQuote,
    fromChallans: fromScheme ? null : fromChallans,
    scaleBarcode,
    ordersAvailable,
    fromScheme,
    stylists: (stylistRows ?? []).map((w) => w.name),
    extrasAvailable: await extrasP,
    initialProvider: providerParam?.slice(0, 80) ?? "",
  };
  return { props, fastBillingEnabled: !!shop?.fast_billing_enabled };
}
