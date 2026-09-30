"use server";

import { redirect } from "next/navigation";
import { billLimitError } from "../planLimits";
import { revalidatePath } from "next/cache";
import { requireSession, hasPermission, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { billSchema, calculateTransactionTotals, type BillInput } from "../validation/schemas";
import { determineSupplyType, financialYearFor, isPastGstPeriod, round2 } from "../gst";
import { logAuditEvent } from "../audit";
import { findOrCreateCustomerByPhone, awardLoyaltyPoints } from "./customers";
import { invalidateCache } from "../cache";
import { buyerSchemaReady, stateFromGstin, type Buyer } from "../gstBuyer";
import { todayIso } from "../dateHelpers";
import { priceLines } from "../billPricing";
import { goldSchemesReady, loadSchemes } from "../goldSchemeData";
import { asCashMethod, recordCashMovement } from "../cashMovements";
import { formatMoney } from "../format";
import { undoBillUsage } from "../billUndo";
import { settleChallansForBill } from "../challanData";
import { freeFollowUp } from "../followUp";
import { gapsReady } from "../gapsData";
import { loadPackages, packageUsable, salonExtrasReady, walletBalance } from "../salonExtras";
import { addDaysIso } from "../dateHelpers";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";
import { dishesWithRecipes, recipesReady, takeForSale } from "../recipeData";

export type ActionState = { error?: string } | null;

/** The actual bill-creation logic, shared by the normal online form
 * submission and the offline-sync path — one source of truth for invoice
 * numbering, GST calculation, and stock decrement, so the two can never
 * silently drift apart. */
export async function createBillCore(
  session: SessionContext,
  parsedData: BillInput,
): Promise<{ billId: string; invoiceNumber: string } | { error: string }> {
  // Plan limit first: a bill that can't be created shouldn't consume an
  // invoice number or touch stock.
  const overLimit = await billLimitError(session);
  if (overLimit) return { error: overLimit };

  const { customerId, items, discountType, discountValue, paidAmount, paymentMethod, doctorName, patientName, tripVehicleId, tripKm, tripDriverName, tripLoadWeight, tripLoadUnit, serviceProviderName, exchangeMetal, exchangeDescription, exchangeGrossWeight, exchangePurityPercent, exchangeRatePerGram, exchangeValue, redeemedPoints, b2b, buyerName, buyerGstin, buyerAddress } = parsedData;

  const admin = createSupabaseAdminClient();

  // A gold saving scheme used in this bill: what the customer paid into it (plus the bonus once
  // every instalment is in) pays for the jewellery, like cash already in hand.
  let scheme: { id: string; number: string; value: number } | null = null;
  if (parsedData.goldSchemeId) {
    if (!isModuleEnabled(session.enabledModules, "gold_schemes")) return { error: moduleLockMessage("gold_schemes") };
    const [view] = await loadSchemes(admin, session.shopId, { id: parsedData.goldSchemeId });
    if (!view || view.scheme.status !== "active") return { error: "This gold scheme can't be used — it is closed or already used." };
    if (view.scheme.customer_id && view.scheme.customer_id !== customerId) return { error: "Bill the scheme's own customer to use their scheme." };
    if (view.figures.value <= 0) return { error: "Nothing has been paid into this scheme yet." };
    scheme = { id: view.scheme.id, number: view.scheme.scheme_number, value: view.figures.value };
  }

  // Packages and prepaid balance (migration 0048): sessions taken from the customer's packages go
  // on the bill at ₹0, and money from their prepaid balance pays for it like cash already in hand.
  const extrasReady = await salonExtrasReady(admin);
  const walletAmount = round2(parsedData.walletAmount ?? 0);
  const sessionsWanted = new Map<string, number>();
  for (const i of items) if (i.packageId) sessionsWanted.set(i.packageId, (sessionsWanted.get(i.packageId) ?? 0) + Number(i.quantity));
  if (sessionsWanted.size || walletAmount > 0) {
    if (!isModuleEnabled(session.enabledModules, "customer_prepaid")) return { error: moduleLockMessage("customer_prepaid") };
    if (!extrasReady) return { error: "Packages and prepaid balance need a one-time database update — ask the owner to run migration 0048." };
    if (!customerId) return { error: "Pick the customer — packages and prepaid balance belong to someone." };
  }
  const packages = new Map((sessionsWanted.size ? await loadPackages(admin, session.shopId, { ids: [...sessionsWanted.keys()] }) : []).map((p) => [p.id, p]));
  for (const [id, wanted] of sessionsWanted) {
    const p = packages.get(id);
    if (!p || p.customerId !== customerId) return { error: "That package belongs to another customer." };
    if (!packageUsable(p) || !Number.isInteger(wanted) || wanted > p.left) {
      return { error: p.cancelled ? `${p.name} was cancelled.` : p.expired ? `${p.name} ran out on ${p.expiresOn}.` : `${p.name}: ${p.left} session(s) left.` };
    }
  }
  if (walletAmount > 0 && customerId) {
    const balance = await walletBalance(admin, session.shopId, customerId);
    if (walletAmount > balance + 0.005) return { error: `The prepaid balance is only ${formatMoney(balance)}.` };
  }
  // A session from a package is charged nothing — its price was paid when the package was sold.
  const itemsToPrice = items.map((i) => {
    const p = i.packageId ? packages.get(i.packageId) : undefined;
    return p ? { ...i, productId: null, description: `${p.serviceName} (package)`, unitPrice: 0, gstPercent: 0, priceOverride: false } : i;
  });

  // Old-gold/silver exchange is money-equivalent handed over at the
  // counter — it counts toward what's "paid", same as cash, without
  // touching the taxable value of the new item being sold. A scheme's value likewise, and prepaid
  // balance used.
  // Its worth is worked out here from weight, purity and rate (fine weight to the milligram),
  // not taken from the screen as sent.
  const exchangeNetWeight =
    exchangeGrossWeight && exchangeGrossWeight > 0 ? Math.round(exchangeGrossWeight * ((exchangePurityPercent ?? 100) / 100) * 1000) / 1000 : 0;
  const exchangeWorth =
    exchangeMetal && exchangeNetWeight > 0 && exchangeRatePerGram && exchangeRatePerGram > 0 ? round2(exchangeNetWeight * exchangeRatePerGram) : (exchangeValue ?? 0);
  const effectivePaidAmount = round2(paidAmount + exchangeWorth + (scheme?.value ?? 0) + walletAmount);

  // The "Give discounts" switch on a staff account means something: without it, the only money
  // off a bill is the customer's own loyalty points, at exactly what they are worth. (It used to
  // be checked only for hotel stays — any staff could give any discount everywhere else.)
  if (discountValue > 0 && !hasPermission(session, "give_discounts")) {
    let pointsWorth = 0;
    if (discountType === "flat" && customerId && redeemedPoints && redeemedPoints > 0) {
      const { data: loyalty } = await admin.from("shops").select("loyalty_redemption_value").eq("id", session.shopId).single();
      pointsWorth = Math.floor(redeemedPoints) * Number(loyalty?.loyalty_redemption_value ?? 0);
    }
    if (discountType !== "flat" || discountValue - pointsWorth > 0.5) {
      return { error: "You don't have permission to give a discount — ask the owner." };
    }
  }

  // Verify every product id actually belongs to this shop, and price every line from the
  // catalogue rather than trusting client values (those only drive the on-screen preview).
  // Billing a quotation that is still valid: the prices it promised stand, even if the catalogue
  // has changed since.
  let quoted: Map<string, { unitPrice: number; loose: boolean }> | undefined;
  if (parsedData.quotationId) {
    const { data: quote } = await admin.from("quotations").select("items, status, valid_until").eq("id", parsedData.quotationId).eq("shop_id", session.shopId).maybeSingle();
    if (quote && quote.status === "open" && (!quote.valid_until || quote.valid_until >= todayIso())) {
      quoted = new Map(
        quote.items.filter((l) => l.productId).map((l) => [l.productId as string, { unitPrice: Number(l.unitPrice), loose: Number(l.stockQuantity) !== Number(l.quantity) }]),
      );
    }
  }
  const priced = await priceLines(session, admin, itemsToPrice, quoted);
  if ("error" in priced) return { error: priced.error ?? "One or more products could not be verified" };
  const { productMap } = priced;

  // A package sold on this bill ("5 hair spa sessions"): the customer gets its sessions once the
  // bill is made — so there has to be a customer.
  const plans = new Map<string, { sessions: number; validityDays: number | null; serviceId: string | null; serviceName: string }>();
  if (extrasReady && productMap.size) {
    const { data: planRows } = await admin
      .from("products")
      .select("id, name, package_service_id, package_sessions, package_validity_days")
      .eq("shop_id", session.shopId)
      .in("id", [...productMap.keys()])
      .not("package_sessions", "is", null);
    const serviceIds = [...new Set((planRows ?? []).map((p) => p.package_service_id).filter((id): id is string => !!id))];
    const { data: services } = serviceIds.length ? await admin.from("products").select("id, name").in("id", serviceIds) : { data: [] };
    for (const p of planRows ?? []) {
      if (p.package_sessions == null || !(Number(p.package_sessions) > 0)) continue;
      plans.set(p.id, {
        sessions: Number(p.package_sessions),
        validityDays: p.package_validity_days,
        serviceId: p.package_service_id,
        serviceName: (services ?? []).find((s) => s.id === p.package_service_id)?.name ?? p.name,
      });
    }
  }
  if (plans.size) {
    if (!isModuleEnabled(session.enabledModules, "customer_prepaid")) return { error: moduleLockMessage("customer_prepaid") };
    if (!customerId) return { error: "A package belongs to a customer — pick the customer first." };
    if (items.some((i) => i.productId && plans.has(i.productId) && !Number.isInteger(Number(i.quantity)))) return { error: "Sell packages in whole numbers." };
  }

  const needsPrescription = items.some((item) => item.productId && productMap.get(item.productId)?.requires_prescription);
  if (needsPrescription && (!doctorName || !patientName)) {
    return { error: "One or more items need a prescription — enter the doctor's and patient's name." };
  }

  // A medicine whose stock is only in expired batches can't be sold. (A medicine with no batches
  // recorded at all is left alone — the shop simply doesn't track its batches.)
  const pharmaIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id && !!productMap.get(id)?.is_pharma && !!productMap.get(id)?.track_inventory))];
  if (pharmaIds.length) {
    const today = todayIso();
    const { data: batchRows } = await admin.from("medicine_batches").select("product_id, quantity, expiry_date").in("product_id", pharmaIds).gt("quantity", 0);
    for (const id of pharmaIds) {
      const rows = (batchRows ?? []).filter((b) => b.product_id === id);
      if (!rows.length) continue;
      const usable = rows.filter((b) => !b.expiry_date || b.expiry_date >= today).reduce((s, b) => s + Number(b.quantity), 0);
      const expired = rows.filter((b) => b.expiry_date && b.expiry_date < today).reduce((s, b) => s + Number(b.quantity), 0);
      const wanted = items.filter((i) => i.productId === id).reduce((s, i) => s + Number(i.stockQuantity ?? i.quantity), 0);
      if (expired > 0 && wanted > usable) {
        const name = productMap.get(id)?.name ?? "A medicine";
        return { error: usable > 0 ? `${name}: only ${usable} left within expiry — ${expired} more has expired and can't be sold. Write off the expired batch.` : `${name}: all the stock left has expired and can't be sold. Write off the expired batch under Pharmacy → Expiry.` };
      }
    }
  }

  let customer: { name: string; gstin: string | null; address: string | null; state: string | null; state_code: string | null } | null = null;
  if (customerId) {
    const { data } = await admin
      .from("customers")
      .select("id, name, gstin, address, state, state_code")
      .eq("id", customerId)
      .eq("shop_id", session.shopId)
      .single();
    if (!data) return { error: "Customer not found" };
    customer = data;
  }

  if (!session.shopStateCode) {
    return {
      error: "Add your shop's state in Settings before billing — needed to work out CGST/SGST vs IGST.",
    };
  }

  // Who the invoice is made out to. With the B2B switch on, the business typed in (it can differ
  // from the customer, e.g. their employer); switched off, a plain B2C sale even for a customer who
  // has a GSTIN; not given at all (offline sync, other modules), the customer as before.
  const buyer: Buyer | null =
    b2b && buyerName && buyerGstin
      ? { name: buyerName, gstin: buyerGstin, address: buyerAddress ?? (customer?.gstin === buyerGstin ? customer.address : null), state: stateFromGstin(buyerGstin).name, stateCode: stateFromGstin(buyerGstin).code }
      : customer
        ? customer.gstin && b2b !== false
          ? // A registered buyer's state is the one its GSTIN is registered in, whatever the
            // customer's address field says — that decides IGST vs CGST + SGST.
            { name: customer.name, gstin: customer.gstin, address: customer.address, state: stateFromGstin(customer.gstin).name ?? customer.state, stateCode: stateFromGstin(customer.gstin).code }
          : { name: customer.name, gstin: null, address: customer.address, state: customer.state, stateCode: customer.state_code }
        : null;

  // Place of supply: the B2B buyer's registered state, else the customer's state (walk-in: local).
  const supplyType = determineSupplyType(session.shopStateCode, buyer?.stateCode ?? null);

  // Priced above (priceLines): catalogue prices, offer / bulk / loose, and 0% GST for a
  // composition dealer, who is legally barred from charging GST on an invoice at all.
  const verifiedItems = priced.lines;
  // A clinic's free follow-up: a consultation within the window after a paid one is ₹0.
  if (session.businessType === "clinic" && customerId) {
    const follow = await freeFollowUp(admin, session.shopId, customerId);
    if (follow) {
      for (const line of verifiedItems) {
        if (line.productId && follow.productIds.includes(line.productId) && line.unitPrice > 0) {
          line.unitPrice = 0;
          line.productName = `${line.productName} (free follow-up)`;
        }
      }
    }
  }

  const totals = calculateTransactionTotals({
    items: verifiedItems,
    discountType,
    discountValue,
    paidAmount: effectivePaidAmount,
    supplyType,
    priceMode: session.priceIncludesGst ? "inclusive" : "exclusive",
  });
  // A scheme is used whole: the jewellery must be worth at least its value (checked before the
  // invoice number is taken).
  // Prepaid balance pays only what the bill comes to (after old gold and a scheme).
  if (walletAmount > 0 && walletAmount > Math.max(0, totals.total - exchangeWorth - (scheme?.value ?? 0)) + 0.005) {
    return { error: `Only ${formatMoney(Math.max(0, totals.total - exchangeWorth - (scheme?.value ?? 0)))} of the prepaid balance can go on this bill.` };
  }
  if (scheme && totals.total + 0.005 < scheme.value) {
    return { error: `The scheme is worth ${formatMoney(scheme.value)} — pick jewellery worth at least that much.` };
  }

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber, error: numberError } = await admin.rpc(
    "next_invoice_number",
    { p_shop_id: session.shopId, p_financial_year: financialYear },
  );
  if (numberError || issuedNumber == null) {
    return { error: "Could not generate an invoice number. Please try again." };
  }
  const invoiceNumber = `${financialYear}/${String(issuedNumber).padStart(5, "0")}`;

  // Auto-tag the bill with whichever branch this staff member is
  // assigned to — the owner (or unassigned staff) end up with a null
  // branch_id, which reports treat as "unassigned/shop-wide", not an error.
  const { data: staffRow } = await admin.from("staff").select("branch_id").eq("id", session.userId).single();

  const { data: bill, error: billError } = await admin
    .from("bills")
    .insert({
      shop_id: session.shopId,
      customer_id: customerId,
      staff_id: session.userId,
      branch_id: staffRow?.branch_id ?? null,
      invoice_number: invoiceNumber,
      financial_year: financialYear,
      subtotal: totals.subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      payment_method: paymentMethod,
      discount_amount: totals.discountAmount,
      taxable_amount: totals.taxableAmount,
      price_includes_gst: session.priceIncludesGst,
      supply_type: supplyType,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      round_off_amount: totals.roundOffAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
      doctor_name: needsPrescription ? doctorName : null,
      patient_name: needsPrescription ? patientName : null,
      service_provider_name: serviceProviderName ?? null,
      // Frozen here so a later edit of the customer never changes an invoice already issued.
      ...((await buyerSchemaReady(admin))
        ? { buyer_name: buyer?.name ?? null, buyer_gstin: buyer?.gstin ?? null, buyer_address: buyer?.address ?? null, buyer_state: buyer?.state ?? null, buyer_state_code: buyer?.stateCode ?? null }
        : {}),
    })
    .select("id")
    .single();

  if (billError || !bill) return { error: "Could not create bill" };

  const buildRows = () => verifiedItems.map((item, i) => {
    const line = totals.lines[i];
    let warrantyExpiresOn: string | null = null;
    if (item.warrantyMonths) {
      // From today's date in India (the server's UTC date is yesterday before 5:30 am IST).
      const [y, m, d] = todayIso().split("-").map(Number);
      const expiry = new Date(Date.UTC(y, m - 1 + item.warrantyMonths, d));
      // 31 Jan + 1 month is the last day of February, not 3 March.
      if (expiry.getUTCDate() !== d) expiry.setUTCDate(0);
      warrantyExpiresOn = expiry.toISOString().slice(0, 10);
    }
    return {
      bill_id: bill.id,
      product_id: item.productId,
      product_name: item.productName,
      hsn_code: item.hsnCode,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      gst_percent: item.gstPercent,
      warranty_months: item.warrantyMonths,
      mrp: item.mrp,
      warranty_expires_on: warrantyExpiresOn,
      line_subtotal: line.lineSubtotal,
      cgst_amount: line.cgst,
      sgst_amount: line.sgst,
      igst_amount: line.igst,
      line_gst: line.lineGst,
      line_total: round2(line.lineSubtotal + line.lineGst),
      // Who did the line (when not the bill's stylist), and the package a ₹0 session came from.
      ...(extrasReady ? { provider_name: items[item.sourceIndex]?.providerName ?? null, package_id: items[item.sourceIndex]?.packageId ?? null } : {}),
    };
  });
  // Anything going wrong here must not leave a bill with no lines behind.
  let billItemsRows: ReturnType<typeof buildRows>;
  try {
    billItemsRows = buildRows();
  } catch (e) {
    console.error("Could not build bill items", e);
    await admin.from("bills").delete().eq("id", bill.id);
    return { error: "Could not save bill items" };
  }

  const { error: itemsError } = await admin.from("bill_items").insert(billItemsRows);
  if (itemsError) {
    // Roll back the orphaned bill header so we don't leave partial data.
    await admin.from("bills").delete().eq("id", bill.id);
    return { error: "Could not save bill items" };
  }

  // Transport & Materials business type — a bill that included a
  // transport-charge line also logs the underlying trip, so Vehicles gets
  // an accurate rounds/km/earnings history. Best-effort: the bill itself
  // is already valid either way.
  if (tripVehicleId && tripKm && tripKm > 0) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id, rate_per_km")
      .eq("id", tripVehicleId)
      .eq("shop_id", session.shopId)
      .single();
    if (vehicle) {
      await admin.from("transport_trips").insert({
        shop_id: session.shopId,
        vehicle_id: vehicle.id,
        customer_id: customerId,
        bill_id: bill.id,
        staff_id: session.userId,
        km: tripKm,
        rate_per_km: Number(vehicle.rate_per_km),
        transport_charge: round2(tripKm * Number(vehicle.rate_per_km)),
        driver_name: tripDriverName ?? null,
        load_weight: tripLoadWeight ?? null,
        load_unit: tripLoadUnit ?? null,
      });
    }
  }

  // Jewellery — old gold/silver exchange record, for the shop's own
  // melting/refining bookkeeping. Best-effort: the bill itself is
  // already valid and correctly totalled either way.
  if (exchangeMetal && exchangeGrossWeight && exchangeGrossWeight > 0 && exchangeWorth > 0) {
    await admin.from("jewellery_exchanges").insert({
      shop_id: session.shopId,
      bill_id: bill.id,
      metal_type: exchangeMetal,
      description: exchangeDescription ?? null,
      gross_weight: exchangeGrossWeight,
      purity_percent: exchangePurityPercent ?? 100,
      net_weight: exchangeNetWeight,
      rate_per_gram: exchangeRatePerGram ?? 0,
      exchange_value: exchangeWorth,
      customer_id: customerId,
      staff_id: session.userId,
    });
  }

  // Stock decrement — best-effort (the bill is already committed at this
  // point, so a failure here doesn't roll back the sale, just logs for
  // review). Pharma items draw from the earliest-expiring batch(es) first
  // (FEFO); everything else just decrements the product's aggregate stock
  // as before. Different items are genuinely independent of each other
  // (different products, no shared state), so they run concurrently
  // rather than one-at-a-time — the FEFO batch loop for pharma items
  // stays sequential WITHIN itself since it tracks a running
  // "remaining" counter across a single product's own batches.
  const recipesOn = isModuleEnabled(session.enabledModules, "recipe_stock");
  const recipeDishes = recipesOn ? await dishesWithRecipes(admin, session.shopId, [...productMap.keys()]) : new Set<string>();
  if (recipeDishes.size) {
    await takeForSale(admin, {
      shopId: session.shopId,
      staffId: session.userId,
      billId: bill.id,
      lines: verifiedItems.filter((i) => i.productId && recipeDishes.has(i.productId)).map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
      alsoItems: false,
    });
  }
  // Goods that already left stock with the delivery challans being billed are not taken again.
  const challanOut = new Map<string, number>();
  if (parsedData.challanIds?.length && (await gapsReady(admin))) {
    const { data: out } = await admin.from("delivery_challans").select("items, stock_taken").eq("shop_id", session.shopId).eq("status", "open").in("id", parsedData.challanIds);
    for (const c of out ?? []) if (c.stock_taken) for (const l of c.items) if (l.productId) challanOut.set(l.productId, round2((challanOut.get(l.productId) ?? 0) + Number(l.quantity)));
  }
  const toTake = verifiedItems.map((item) => {
    const out = item.productId ? (challanOut.get(item.productId) ?? 0) : 0;
    const covered = Math.min(out, item.stockQuantity);
    if (covered > 0) challanOut.set(item.productId as string, round2(out - covered));
    return round2(item.stockQuantity - covered);
  });
  await Promise.all(
    verifiedItems.map(async (item, index) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      if (!product?.track_inventory || recipeDishes.has(product.id)) return;
      if (!(toTake[index] > 0)) return;

      if (product.is_pharma) {
        // Earliest expiry first, never an expired batch (checked above before billing).
        const { data: batches } = await admin
          .from("medicine_batches")
          .select("id, quantity")
          .eq("product_id", product.id)
          .gt("quantity", 0)
          .or(`expiry_date.is.null,expiry_date.gte.${todayIso()}`)
          .order("expiry_date", { ascending: true });

        let remaining = item.stockQuantity;
        let firstBatchId: string | null = null;
        for (const batch of batches ?? []) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(batch.quantity));
          const { error: batchError } = await admin
            .from("medicine_batches")
            .update({ quantity: round2(Number(batch.quantity) - take) })
            .eq("id", batch.id);
          if (batchError) {
            console.error("Could not update batch stock", batch.id, batchError);
            continue;
          }
          if (!firstBatchId) firstBatchId = batch.id;
          remaining = round2(remaining - take);
        }
        if (firstBatchId) {
          await admin.from("bill_items").update({ batch_id: firstBatchId }).eq("bill_id", bill.id).eq("product_id", product.id);
        }
      }

      // Atomic — the decrement happens inside the database as one UPDATE,
      // not read-then-write from application code, so two concurrent
      // sales of the same product can never both read the same stale
      // stock value and silently oversell.
      const { error: stockError } = await admin.rpc("decrement_stock", { p_product_id: product.id, p_quantity: toTake[index] });
      if (stockError) console.error("Could not update stock for product", product.id, stockError);
    }),
  );
  await invalidateCache(`ray:cache:products:${session.shopId}`);

  // Loyalty points — best-effort, same non-blocking pattern as the
  // stock decrement above.
  await awardLoyaltyPoints(admin, session.shopId, customerId, totals.paidAmount);

  // Points redemption — best-effort, mirrors the earning hook above.
  // The redeem_loyalty_points RPC itself floors at 0, so this can
  // never push a customer's balance negative even in a rare race
  // between two bills redeeming around the same time.
  if (customerId && redeemedPoints && redeemedPoints > 0) {
    const { error: redeemError } = await admin.rpc("redeem_loyalty_points", {
      p_customer_id: customerId,
      p_points: Math.floor(redeemedPoints),
    });
    if (redeemError) console.error("Could not redeem loyalty points", customerId, redeemError);
  }

  // The scheme is used up in this bill. Its instalments were counted as money in on the days they
  // were paid (and a bonus is never money in), so their value comes off today's takings.
  if (scheme) {
    await admin
      .from("gold_schemes")
      .update({ status: "redeemed", redeemed_bill_id: bill.id, redeemed_at: new Date().toISOString() })
      .eq("id", scheme.id)
      .eq("shop_id", session.shopId);
    await recordCashMovement(admin, {
      shopId: session.shopId,
      staffId: session.userId,
      kind: "advance_applied",
      source: "gold_scheme",
      sourceId: scheme.id,
      method: asCashMethod(paymentMethod),
      amount: -scheme.value,
      note: `Scheme ${scheme.number} used in invoice ${invoiceNumber}`,
      billId: bill.id,
    });
  }

  if (extrasReady && customerId) {
    // Sessions taken from packages.
    if (sessionsWanted.size) {
      const { error: usesError } = await admin
        .from("package_uses")
        .insert([...sessionsWanted].map(([packageId, quantity]) => ({ shop_id: session.shopId, package_id: packageId, bill_id: bill.id, quantity })));
      if (usesError) console.error("Could not record package sessions", bill.id, usesError);
    }
    // Packages sold: the customer now has their sessions. One session is worth the package's
    // price before GST over its sessions — what a stylist's commission is paid on when it is used.
    const today = todayIso();
    const sold = verifiedItems
      .map((item, i) => ({ item, i, plan: item.productId ? plans.get(item.productId) : undefined }))
      .filter((x) => x.plan)
      .map(({ item, i, plan }) => {
        const sessions = plan!.sessions * Math.round(Number(item.quantity));
        return {
          shop_id: session.shopId,
          customer_id: customerId,
          plan_product_id: item.productId,
          name: item.productName,
          service_product_id: plan!.serviceId,
          service_name: plan!.serviceName,
          sessions_total: sessions,
          session_value: round2(totals.lines[i].lineSubtotal / sessions),
          sold_bill_id: bill.id,
          starts_on: today,
          expires_on: plan!.validityDays ? addDaysIso(today, plan!.validityDays) : null,
        };
      });
    if (sold.length) {
      const { error: soldError } = await admin.from("customer_packages").insert(sold);
      if (soldError) console.error("Could not record packages sold", bill.id, soldError);
    }
    // Prepaid balance used: off the balance, and off today's takings (it was money in when paid).
    if (walletAmount > 0) {
      const { error: walletError } = await admin.from("wallet_entries").insert({
        shop_id: session.shopId,
        customer_id: customerId,
        kind: "spend",
        money: 0,
        credit: -walletAmount,
        bill_id: bill.id,
        payment_method: asCashMethod(paymentMethod),
        note: `Invoice ${invoiceNumber}`,
        staff_id: session.userId,
      });
      if (walletError) console.error("Could not record prepaid balance used", bill.id, walletError);
      await recordCashMovement(admin, {
        shopId: session.shopId,
        staffId: session.userId,
        kind: "advance_applied",
        source: "wallet",
        sourceId: customerId,
        method: asCashMethod(paymentMethod),
        amount: -walletAmount,
        note: `Prepaid balance used in invoice ${invoiceNumber}`,
        billId: bill.id,
      });
    }
  }

  return { billId: bill.id, invoiceNumber };
}

/** Genuinely resolves a customer for Fast Billing's Udhar (credit)
 * flow — finds them by phone if they've bought here before (never
 * creates a duplicate for a returning credit customer), or creates a
 * fresh record. A credit sale genuinely needs someone to recover
 * payment from, which is the whole reason this capture happens only
 * when Udhar is genuinely selected, not on every fast-billing sale. */
export async function resolveFastBillingCustomerAction(
  name: string,
  phone: string,
): Promise<{ customerId?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!phone.trim()) return { error: "A mobile number is genuinely needed to track udhar for recovery" };

  const result = await findOrCreateCustomerByPhone(admin, session.shopId, phone, name || "Udhar customer");
  if (!result) return { error: "Could not save customer details" };
  return { customerId: result.id };
}

export async function createBillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Invalid submission" };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Invalid submission" };
  }

  const parsed = billSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const result = await createBillCore(session, parsed.data);
  if ("error" in result) return { error: result.error };

  // Made from a quotation: it now points to this bill (and can't be billed twice).
  if (parsed.data.quotationId) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("quotations")
      .update({ status: "converted", bill_id: result.billId })
      .eq("id", parsed.data.quotationId)
      .eq("shop_id", session.shopId)
      .eq("status", "open");
  }
  // Made from delivery challans: they point to this bill now.
  if (parsed.data.challanIds?.length) {
    await settleChallansForBill(createSupabaseAdminClient(), session.shopId, parsed.data.challanIds, result.billId);
  }

  redirect(`/print/bill/${result.billId}?new=1`);
}

/** Called by the offline-sync engine — same core logic as createBillAction,
 * but returns a plain result instead of redirecting, since the sync loop
 * processes a whole queue of bills in one pass and can't navigate away
 * partway through. */
export async function syncOfflineBillAction(
  payload: unknown,
): Promise<{ billId: string; invoiceNumber: string } | { error: string }> {
  const session = await requireSession();

  const parsed = billSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  return createBillCore(session, parsed.data);
}

/**
 * Voids a bill rather than editing it — a filed GST invoice number should
 * never be silently rewritten after the fact, since it may already be
 * reflected in a filed GSTR-1. Voiding preserves the original invoice
 * (for audit purposes) while excluding it from every balance/report
 * calculation, and restores any stock that was decremented at sale time.
 * Owner-only: this affects financial and compliance records.
 */
export async function voidBillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (!hasPermission(session, "void_bills")) return { error: "You don't have permission to void bills — ask the owner." };
  const billId = formData.get("billId");
  const reason = formData.get("reason");
  if (typeof billId !== "string" || typeof reason !== "string" || !reason.trim()) {
    return { error: "Enter a reason for voiding this bill" };
  }

  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select("id, status, created_at")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status === "voided") return { error: "This bill is already voided" };
  if (isPastGstPeriod(bill.created_at)) {
    return { error: "This bill is from an earlier month, which may already be filed with the government — voiding it now would silently change that month's GST reports. Process a Return (credit note) instead; it keeps a proper record of the correction." };
  }

  // Restore stock for any tracked products on this bill before marking it voided.
  const { data: items } = await admin
    .from("bill_items")
    .select("product_id, quantity")
    .eq("bill_id", billId);

  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
  if (productIds.length > 0) {
    const { data: products } = await admin
      .from("products")
      .select("id, track_inventory, stock_quantity")
      .in("id", productIds);
    const productMap = new Map((products ?? []).map((p) => [p.id, p]));

    // A dish sold by its recipe took its raw materials, not itself (they go back with the void
    // below) — known from the kitchen's ledger having this bill in it.
    const { count: recipeUse } = (await recipesReady(admin))
      ? await admin.from("kitchen_usage").select("id", { count: "exact", head: true }).eq("bill_id", billId)
      : { count: 0 };
    const recipeDishes = (recipeUse ?? 0) > 0 ? await dishesWithRecipes(admin, session.shopId, productIds) : new Set<string>();
    // Genuinely independent per item (different products, atomic RPC),
    // so restoring them concurrently is safe and faster than one-at-a-time.
    await Promise.all(
      (items ?? []).map(async (item) => {
        if (!item.product_id || recipeDishes.has(item.product_id)) return;
        const product = productMap.get(item.product_id);
        if (!product?.track_inventory) return;
        await admin.rpc("increment_stock", { p_product_id: item.product_id, p_quantity: Number(item.quantity) });
      }),
    );
    await invalidateCache(`ray:cache:products:${session.shopId}`);
  }

  const { error } = await admin
    .from("bills")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: session.userId,
      void_reason: reason.trim(),
    })
    .eq("id", billId);

  if (error) {
    console.error("Could not void bill", error);
    return { error: "Could not void bill" };
  }
  // A gold scheme, package session, prepaid balance or advance it used is given back.
  await undoBillUsage(admin, session.shopId, billId);

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "bill_voided",
    entityType: "bill",
    entityId: billId,
    details: { reason: reason.trim() },
  });

  revalidatePath("/");
  revalidatePath(`/print/bill/${billId}`);
  revalidatePath("/customers");
  revalidatePath("/reminders");
  return null;
}

/** A genuine post-creation edit — distinct from Void. Only quantities on
 * existing line items are editable (not adding/removing which products
 * are on the bill), which keeps the recalculation and stock-adjustment
 * logic safe and predictable while covering the most common real-world
 * mistake: a wrong quantity typed in a hurry. The invoice number and
 * created_at never change — this keeps the GST invoice sequence intact —
 * but who/when/why is recorded on the bill for a clear audit trail. */
export async function editBillQuantitiesAction(
  billId: string,
  lineUpdates: { billItemId: string; newQuantity: number }[],
  reason: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!hasPermission(session, "edit_bills")) return { error: "You don't have permission to edit bills — ask the owner." };
  if (!reason.trim()) return { error: "Enter a reason for this edit" };

  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select("id, shop_id, status, created_at, discount_type, discount_value, supply_type, paid_amount, price_includes_gst")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status !== "active") return { error: "Can't edit a voided bill" };
  if (isPastGstPeriod(bill.created_at)) {
    return { error: "This bill is from an earlier month, which may already be filed with the government — editing it now would silently change that month's GST reports. Process a Return (credit note) for the wrong quantity instead, then bill the correct one fresh." };
  }

  const { data: items } = await admin
    .from("bill_items")
    .select("id, product_id, quantity, unit_price, gst_percent")
    .eq("bill_id", billId);
  if (!items || items.length === 0) return { error: "No items on this bill" };

  // A bill that used (or sold) a package, prepaid balance or a gold scheme is tied to it: changing
  // its quantities would leave the two disagreeing. Void it and bill again instead.
  const tiedUp = await Promise.all([
    (await salonExtrasReady(admin))
      ? Promise.all([
          admin.from("package_uses").select("id", { count: "exact", head: true }).eq("bill_id", billId),
          admin.from("customer_packages").select("id", { count: "exact", head: true }).eq("sold_bill_id", billId),
          admin.from("wallet_entries").select("id", { count: "exact", head: true }).eq("bill_id", billId),
        ]).then((r) => r.some((x) => (x.count ?? 0) > 0))
      : false,
    (await goldSchemesReady(admin))
      ? admin.from("gold_schemes").select("id", { count: "exact", head: true }).eq("redeemed_bill_id", billId).then((r) => (r.count ?? 0) > 0)
      : false,
  ]);
  if (tiedUp.some(Boolean)) return { error: "This bill used a package, prepaid balance or gold scheme — void it and make it again instead of changing quantities." };

  const updateByItemId = new Map(lineUpdates.map((u) => [u.billItemId, u.newQuantity]));
  for (const u of lineUpdates) {
    if (!u.newQuantity || u.newQuantity <= 0) return { error: "Quantity must be greater than 0" };
  }

  // Stock delta: restore each item's OLD quantity, then deduct the NEW
  // one — net effect is correct whether the edit increases or decreases
  // quantity, without needing a separate "was already restored" flag.
  // Different line items are genuinely independent, so this runs
  // concurrently rather than one item's DB round-trip at a time.
  await Promise.all(
    items.map(async (item) => {
      const newQty = updateByItemId.get(item.id);
      if (newQty === undefined || newQty === Number(item.quantity) || !item.product_id) return;

      const { data: product } = await admin.from("products").select("track_inventory").eq("id", item.product_id).single();
      if (product?.track_inventory) {
        const delta = Number(item.quantity) - newQty; // positive = give stock back, negative = take more
        if (delta > 0) await admin.rpc("increment_stock", { p_product_id: item.product_id, p_quantity: delta });
        else if (delta < 0) await admin.rpc("decrement_stock", { p_product_id: item.product_id, p_quantity: Math.abs(delta) });
      }
    }),
  );
  await invalidateCache(`ray:cache:products:${session.shopId}`);

  const updatedItems = items.map((item) => ({
    ...item,
    quantity: updateByItemId.get(item.id) ?? Number(item.quantity),
  }));

  const totals = calculateTransactionTotals({
    items: updatedItems.map((i) => ({ quantity: Number(i.quantity), unitPrice: Number(i.unit_price), gstPercent: Number(i.gst_percent) })),
    discountType: bill.discount_type,
    discountValue: Number(bill.discount_value),
    paidAmount: Number(bill.paid_amount),
    supplyType: bill.supply_type,
    priceMode: bill.price_includes_gst ? "inclusive" : "exclusive",
  });

  // Rewrite every line, not just the edited ones: the bill-level discount
  // is spread across all lines, so one quantity change moves every line's
  // taxable value and GST — which the printed invoice and GSTR-1 read.
  await Promise.all(
    updatedItems.map((i, idx) => {
      const line = totals.lines[idx];
      return admin
        .from("bill_items")
        .update({
          quantity: i.quantity,
          line_subtotal: line.lineSubtotal,
          cgst_amount: line.cgst,
          sgst_amount: line.sgst,
          igst_amount: line.igst,
          line_gst: line.lineGst,
          line_total: round2(line.lineSubtotal + line.lineGst),
        })
        .eq("id", i.id);
    }),
  );

  const { error } = await admin
    .from("bills")
    .update({
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      taxable_amount: totals.taxableAmount,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      round_off_amount: totals.roundOffAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
      edited_at: new Date().toISOString(),
      edited_by: session.userId,
      edit_reason: reason.trim(),
    })
    .eq("id", billId);
  if (error) {
    console.error("Could not save bill edit", error);
    return { error: "Could not save changes" };
  }

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "bill_quantities_edited",
    entityType: "bill",
    entityId: billId,
    details: { reason: reason.trim(), changes: lineUpdates },
  });

  revalidatePath(`/print/bill/${billId}`);
  return {};
}
