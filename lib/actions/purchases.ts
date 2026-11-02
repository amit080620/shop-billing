"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, requireArea, hasPermission } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { purchaseSchema, calculateTransactionTotals } from "../validation/schemas";
import { determineSupplyType, round2 } from "../gst";
import { partyStateCode } from "../gstBuyer";
import { findDuplicateProductAI } from "./duplicateCheck";
import { invalidateCache } from "../cache";
import { moveStock } from "../stockMoves";
import { wholesaleReady } from "../wholesaleData";
import { rateChanges } from "../purchaseMath";
import { defaultUnitFor } from "../businessType";
import { UNITS } from "../constants/states";

export type ActionState = { error?: string } | null;

export type LowStockReorderItem = {
  productId: string;
  name: string;
  unit: string;
  hsnCode: string | null;
  currentStock: number;
  lowStockThreshold: number;
  suggestedQuantity: number;
  lastUnitPrice: number | null;
  dailyConsumption: number | null;
  daysUntilStockout: number | null;
  predictiveOnly: boolean;
};

/** Everything either already below its low-stock threshold OR headed
 * there soon — genuinely predictive, not just a static number
 * comparison. Daily consumption is computed from actual sales over
 * the last 30 days (bill_items), so "Rice sells ~5kg/day and you
 * have 12kg left" catches a real problem 2-3 days before a plain
 * threshold check ever would, while the item might still look
 * perfectly fine on paper. Also includes a sensible reorder quantity
 * (enough to get back to double the threshold) and the last price
 * actually paid, so a purchase created from this list starts
 * pre-filled instead of blank. */
export async function getLowStockReorderItemsAction(): Promise<LowStockReorderItem[]> {
  const session = await requireSession();
  requireArea(session, "purchases");
  const admin = createSupabaseAdminClient();

  const { data: products } = await admin
    .from("products")
    .select("id, name, unit, hsn_code, stock_quantity, low_stock_threshold")
    .eq("shop_id", session.shopId)
    .eq("track_inventory", true)
    .order("name");

  if (!products || products.length === 0) return [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [{ data: recentBills }, { data: recentPurchases }] = await Promise.all([
    admin.from("bills").select("id").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", thirtyDaysAgo.toISOString()),
    admin
      .from("purchase_items")
      .select("product_id, unit_price, purchases!inner ( purchase_date, shop_id )")
      .in(
        "product_id",
        products.map((p) => p.id),
      )
      .eq("purchases.shop_id", session.shopId)
      .order("purchase_date", { foreignTable: "purchases", ascending: false }),
  ]);

  const billIds = (recentBills ?? []).map((b) => b.id);
  const soldByProduct = new Map<string, number>();
  if (billIds.length > 0) {
    const { data: soldItems } = await admin.from("bill_items").select("product_id, quantity").in("bill_id", billIds);
    for (const item of soldItems ?? []) {
      if (!item.product_id) continue;
      soldByProduct.set(item.product_id, (soldByProduct.get(item.product_id) ?? 0) + Number(item.quantity));
    }
  }

  // First row per product after the desc-ordered query above is its
  // most recent purchase — Map.set on an already-present key is a
  // no-op-preventer here since we only want the FIRST (most recent).
  const lastPriceByProduct = new Map<string, number>();
  for (const row of recentPurchases ?? []) {
    if (row.product_id && !lastPriceByProduct.has(row.product_id)) {
      lastPriceByProduct.set(row.product_id, Number(row.unit_price));
    }
  }

  const withPrediction = products.map((p) => {
    const threshold = Number(p.low_stock_threshold);
    const current = Number(p.stock_quantity);
    const soldLast30Days = soldByProduct.get(p.id) ?? 0;
    const dailyConsumption = soldLast30Days > 0 ? soldLast30Days / 30 : null;
    const daysUntilStockout = dailyConsumption && dailyConsumption > 0 ? current / dailyConsumption : null;
    const belowThreshold = current <= threshold;
    // "Predictive-only" catch: not below threshold YET, but genuinely
    // on track to run out within a week at the current selling pace —
    // worth surfacing before it becomes a real stockout.
    const predictiveRisk = !belowThreshold && daysUntilStockout !== null && daysUntilStockout <= 7;

    return {
      productId: p.id,
      name: p.name,
      unit: p.unit,
      hsnCode: p.hsn_code,
      currentStock: current,
      lowStockThreshold: threshold,
      suggestedQuantity: Math.max(1, Math.ceil(threshold * 1.5 - current)),
      lastUnitPrice: lastPriceByProduct.get(p.id) ?? null,
      dailyConsumption: dailyConsumption ? Math.round(dailyConsumption * 10) / 10 : null,
      daysUntilStockout: daysUntilStockout !== null ? Math.max(0, Math.round(daysUntilStockout)) : null,
      predictiveOnly: predictiveRisk,
      include: belowThreshold || predictiveRisk,
    };
  });

  return withPrediction
    .filter((p) => p.include)
    .sort((a, b) => (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring `include` off deliberately: it's an internal filtering flag, not part of the returned shape
    .map(({ include, ...rest }) => rest);
}

export async function createPurchaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  requireArea(session, "purchases");

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Invalid submission" };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Invalid submission" };
  }

  const parsed = purchaseSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { vendorId, vendorInvoiceNumber, purchaseDate, items, paidAmount, paymentMethod, itcEligible, reverseCharge, updateRates, allowDuplicate } =
    parsed.data;

  const admin = createSupabaseAdminClient();

  const { data: vendor, error: vendorError } = await admin
    .from("vendors")
    .select("id, state_code, gstin")
    .eq("id", vendorId)
    .eq("shop_id", session.shopId)
    .single();
  if (vendorError || !vendor) return { error: "Vendor not found" };

  if (!session.shopStateCode) {
    return {
      error: "Add your shop's state in Settings before recording purchases — needed to work out CGST/SGST vs IGST.",
    };
  }

  // The same vendor's bill entered twice doubles the stock and what is owed — asked first.
  if (!allowDuplicate) {
    const { data: same } = await admin
      .from("purchases")
      .select("purchase_date")
      .eq("shop_id", session.shopId)
      .eq("vendor_id", vendorId)
      .ilike("vendor_invoice_number", vendorInvoiceNumber.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1);
    if (same?.length) {
      return { error: `Bill #${vendorInvoiceNumber} from this vendor is already recorded (${same[0].purchase_date}). If it really is another bill, tick "It's a different bill" and save again.` };
    }
  }

  const withWholesale = await wholesaleReady(admin);
  // Rates move only for staff allowed to change items (the rate list's own rule); the purchase saves either way.
  const mayChangeRates = updateRates && hasPermission(session, "manage_products");
  const productColumns = withWholesale
    ? "id, name, hsn_code, track_inventory, stock_quantity, is_pharma, price, mrp, gst_percent, barcode, wholesale_price"
    : "id, name, hsn_code, track_inventory, stock_quantity, is_pharma, price, mrp, gst_percent, barcode";
  type DbProduct = { id: string; name: string; hsn_code: string | null; track_inventory: boolean; stock_quantity: number; is_pharma: boolean; price: number; mrp: number | null; gst_percent: number; barcode: string | null; wholesale_price?: number | null };

  // Products referenced by id are looked up for a name/HSN snapshot and their rates — price/GST
  // for a purchase come from the vendor's own bill, not our catalog.
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const { data: dbProducts } = productIds.length
    ? await admin.from("products").select(productColumns).eq("shop_id", session.shopId).in("id", productIds)
    : { data: [] };
  const productMap = new Map(((dbProducts ?? []) as unknown as DbProduct[]).map((p) => [p.id, p]));

  // A purchase line with no matching product yet — a genuinely new item, whether typed by hand or
  // read off a scanned/spoken vendor bill — becomes a real Product right here, so it can be sold.
  // It starts at the selling rate typed on the line (or its MRP); only with neither does it start at
  // the purchase rate, to be marked up from the rate list. Every existing name is checked first, so
  // "Mobile iPhone" bought today doesn't duplicate an "iPhone Mobile" already in the catalog.
  const { data: allProductNames } = await admin.from("products").select("id, name").eq("shop_id", session.shopId).limit(2000); // safety cap, same reasoning as products.ts
  const units = new Set(UNITS);

  const duplicatesAvoided: { typedAs: string; matchedTo: string; viaAI: boolean }[] = [];
  const resolvedItems = await Promise.all(
    items.map(async (item) => {
      if (item.productId && productMap.has(item.productId)) return item;

      const existingMatch = await findDuplicateProductAI(item.description, allProductNames ?? []);
      if (existingMatch) {
        const existingProduct =
          productMap.get(existingMatch.id) ??
          ((await admin.from("products").select(productColumns).eq("id", existingMatch.id).single()).data as unknown as DbProduct | null);
        if (existingProduct) {
          productMap.set(existingProduct.id, existingProduct);
          duplicatesAvoided.push({ typedAs: item.description, matchedTo: existingMatch.name, viaAI: existingMatch.viaAI });
          return { ...item, productId: existingProduct.id };
        }
      }

      const unit = item.unit && units.has(item.unit.toUpperCase()) ? item.unit.toUpperCase() : defaultUnitFor(session.businessType);
      let barcode = item.barcode?.trim() || null;
      if (barcode) {
        const { data: taken } = await admin.from("products").select("id").eq("shop_id", session.shopId).eq("barcode", barcode).limit(1);
        if (taken?.length) barcode = null;
      }
      const startPrice = item.saleRate || item.mrp || item.unitPrice;
      const { data: newProduct, error: newProductError } = await admin
        .from("products")
        .insert({
          shop_id: session.shopId,
          name: item.description.trim(),
          price: startPrice,
          mrp: item.mrp || null,
          ...(withWholesale && item.wholesaleRate ? { wholesale_price: item.wholesaleRate } : {}),
          gst_percent: item.gstPercent,
          hsn_code: item.hsnCode,
          unit,
          barcode,
          track_inventory: true,
          stock_quantity: 0,
          low_stock_threshold: 0,
        })
        .select(productColumns)
        .single();
      if (newProductError || !newProduct) return item; // best-effort — falls back to the old purchase-only-line behavior if this genuinely fails
      const created = newProduct as unknown as DbProduct;
      productMap.set(created.id, created);
      await invalidateCache(`ray:cache:products:${session.shopId}`);
      return { ...item, productId: created.id, createdHere: true };
    }),
  );

  // The rate list follows the purchase: the MRP, retail and wholesale rates typed on a line replace
  // the item's (only those typed and different). A missing HSN is filled from the vendor's bill, and
  // a GST-registered shop's item with no GST rate takes the bill's.
  let ratesUpdated = 0;
  if (mayChangeRates) {
    const done = new Set<string>();
    for (const item of resolvedItems) {
      if (!item.productId || done.has(item.productId) || ("createdHere" in item && item.createdHere)) continue;
      const product = productMap.get(item.productId);
      if (!product) continue;
      done.add(product.id);
      const change = rateChanges(
        { mrp: product.mrp != null ? Number(product.mrp) : null, price: Number(product.price), wholesale: product.wholesale_price != null ? Number(product.wholesale_price) : null },
        { mrp: item.mrp ?? null, price: item.saleRate ?? null, wholesale: withWholesale ? (item.wholesaleRate ?? null) : null },
      );
      const patch: { mrp?: number; price?: number; wholesale_price?: number; hsn_code?: string; gst_percent?: number } = {};
      if (change.mrp !== undefined) patch.mrp = change.mrp;
      if (change.price !== undefined) patch.price = change.price;
      if (change.wholesale !== undefined) patch.wholesale_price = change.wholesale;
      if (!product.hsn_code && item.hsnCode) patch.hsn_code = item.hsnCode;
      if (session.shopGstin && Number(product.gst_percent) === 0 && item.gstPercent > 0) patch.gst_percent = item.gstPercent;
      if (!Object.keys(patch).length) continue;
      const { error } = await admin.from("products").update(patch).eq("id", product.id).eq("shop_id", session.shopId);
      if (error) continue;
      if (change.mrp !== undefined || change.price !== undefined || change.wholesale !== undefined) ratesUpdated += 1;
      productMap.set(product.id, { ...product, ...(patch as Partial<DbProduct>) });
    }
    if (ratesUpdated) await invalidateCache(`ray:cache:products:${session.shopId}`);
  }

  // Loss-prevention, not silent merging: buying the SAME product at a higher rate than before is
  // normal, but selling the new stock at the OLD price loses money on every piece. A sale price
  // (after any update above) that leaves under 5% over the new cost is flagged.
  const priceAlerts: { productName: string; newCost: number; currentSalePrice: number }[] = [];
  for (const item of resolvedItems) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    if (!product) continue;
    const currentSalePrice = Number(product.price);
    if (currentSalePrice > 0 && item.unitPrice >= currentSalePrice * 0.95) {
      priceAlerts.push({ productName: product.name, newCost: item.unitPrice, currentSalePrice });
    }
  }

  // The vendor's GSTIN state decides it, the same as on the vendor's own invoice.
  const supplyType = determineSupplyType(session.shopStateCode, partyStateCode(vendor));

  const lineInputs = resolvedItems.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    gstPercent: item.gstPercent,
  }));

  const totals = calculateTransactionTotals({
    items: lineInputs,
    discountType: "flat",
    discountValue: 0,
    paidAmount,
    supplyType,
  });

  const { data: purchase, error: purchaseError } = await admin
    .from("purchases")
    .insert({
      shop_id: session.shopId,
      vendor_id: vendorId,
      staff_id: session.userId,
      vendor_invoice_number: vendorInvoiceNumber,
      purchase_date: purchaseDate,
      subtotal: totals.subtotal,
      taxable_amount: totals.taxableAmount,
      supply_type: supplyType,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      payment_method: paymentMethod,
      payable_amount: totals.balanceAmount,
      itc_eligible: itcEligible,
      reverse_charge: reverseCharge,
    })
    .select("id")
    .single();

  if (purchaseError || !purchase) return { error: "Could not save purchase" };

  const purchaseItemsRows = resolvedItems.map((item, i) => {
    const line = totals.lines[i];
    const product = item.productId ? productMap.get(item.productId) : undefined;
    return {
      purchase_id: purchase.id,
      product_id: item.productId ?? null,
      description: product?.name ?? item.description,
      hsn_code: item.hsnCode ?? product?.hsn_code ?? null,
      quantity: item.quantity,
      free_quantity: item.freeQuantity ?? 0,
      unit_price: item.unitPrice,
      gst_percent: item.gstPercent,
      line_subtotal: line.lineSubtotal,
      cgst_amount: line.cgst,
      sgst_amount: line.sgst,
      igst_amount: line.igst,
      line_gst: line.lineGst,
      line_total: round2(line.lineSubtotal + line.lineGst),
    };
  });

  const { error: itemsError } = await admin.from("purchase_items").insert(purchaseItemsRows);
  if (itemsError) {
    await admin.from("purchases").delete().eq("id", purchase.id);
    return { error: "Could not save purchase items" };
  }

  // What came in goes on the shelf (paid and free units) — the tracked items all together, in one go.
  const received = await moveStock(admin, {
    shopId: session.shopId,
    staffId: session.userId,
    source: "purchase",
    sourceId: purchase.id,
    give: resolvedItems.flatMap((item) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      return product?.track_inventory ? [{ productId: product.id, quantity: item.quantity + (item.freeQuantity ?? 0) }] : [];
    }),
    allowShort: false,
  });
  if (!received.ok) console.error("Could not put a purchase's goods in stock", purchase.id, received.error);

  // For pharma products where batch details were filled in on this purchase line, record the batch
  // too — the stock increment above already covers the aggregate number, so this only adds the batch
  // record, it doesn't touch stock_quantity again.
  await Promise.all(
    resolvedItems.map(async (item) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      if (!product?.is_pharma || !item.batchNumber || !item.expiryDate) return;
      const { error: batchError } = await admin.from("medicine_batches").insert({
        shop_id: session.shopId,
        product_id: product.id,
        batch_number: item.batchNumber,
        expiry_date: item.expiryDate,
        mfg_date: item.mfgDate || null,
        quantity: item.quantity + (item.freeQuantity ?? 0),
        purchase_price: item.unitPrice,
      });
      if (batchError) console.error("Could not record batch for product", product.id, batchError);
    }),
  );

  if (duplicatesAvoided.length > 0) {
    console.log("Purchase: matched to existing products instead of creating duplicates", duplicatesAvoided);
  }

  revalidatePath("/purchases");
  if (ratesUpdated || resolvedItems.some((i) => "createdHere" in i && i.createdHere)) {
    revalidatePath("/products/rates");
    revalidatePath("/bills/new");
  }
  const redirectUrl = new URL(`/purchases/${purchase.id}`, "https://placeholder.local");
  redirectUrl.searchParams.set("saved", "1");
  if (ratesUpdated) redirectUrl.searchParams.set("rates", String(ratesUpdated));
  if (updateRates && !mayChangeRates) redirectUrl.searchParams.set("ratesSkipped", "1");
  if (priceAlerts.length > 0) {
    redirectUrl.searchParams.set("priceAlerts", encodeURIComponent(JSON.stringify(priceAlerts.slice(0, 20))));
  }
  redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
}

/** Genuinely a separate dataset from payments — purchase transactions,
 * each showing what was bought, from whom, and what's still owed on
 * it specifically (never merged with the payments list). */
export async function listPurchasesAction(): Promise<
  { id: string; vendorName: string; purchaseDate: string; billNumber: string; total: number; paidAmount: number; outstanding: number; paymentMethod: string }[]
> {
  const session = await requireSession();
  requireArea(session, "purchases");
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("purchases")
    .select("id, purchase_date, vendor_invoice_number, total, paid_amount, payment_method, vendors ( name )")
    .eq("shop_id", session.shopId)
    .order("purchase_date", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => {
    const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
    return {
      id: p.id,
      vendorName: vendor?.name ?? "Unknown supplier",
      purchaseDate: p.purchase_date,
      billNumber: p.vendor_invoice_number,
      total: Number(p.total),
      paidAmount: Number(p.paid_amount),
      outstanding: Number(p.total) - Number(p.paid_amount),
      paymentMethod: p.payment_method,
    };
  });
}

/** Genuinely a separate dataset from purchases — every payment made
 * to a supplier, regardless of which purchase it was against. */
export async function listPurchasePaymentsAction(): Promise<
  { id: string; vendorName: string; amount: number; paymentMethod: string; note: string | null; createdAt: string }[]
> {
  const session = await requireSession();
  requireArea(session, "purchases");
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("purchase_payments")
    .select("id, amount, payment_method, note, created_at, vendors ( name )")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => {
    const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
    return {
      id: p.id,
      vendorName: vendor?.name ?? "Unknown supplier",
      amount: Number(p.amount),
      paymentMethod: p.payment_method,
      note: p.note,
      createdAt: p.created_at,
    };
  });
}
