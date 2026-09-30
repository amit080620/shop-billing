import type { SessionContext } from "./auth";
import { hasPermission } from "./auth";
import type { createSupabaseAdminClient } from "./supabase/admin";
import { isLooseLine, productLinePrice } from "./linePrice";
import { isModuleEnabled } from "./modules";
import { gapsReady } from "./gapsData";
import { freeUnits, type Bxgy } from "./bxgy";
import { wholesalePrices, type PriceLevel } from "./wholesaleData";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LineInput = {
  productId?: string | null;
  description: string;
  hsnCode?: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  stockQuantity?: number | null;
  priceOverride?: boolean;
};

const PRODUCT_COLUMNS =
  "id, name, price, offer_price, units_per_pack, bulk_min_qty, bulk_price, gst_percent, hsn_code, track_inventory, stock_quantity, is_pharma, requires_prescription, has_warranty, warranty_months, mrp";

/** The lines of a bill (or a quotation) as the shop really sells them: every catalogue item
 * checked to belong to this shop, priced from the catalogue — offer price, bulk rate, a loose
 * unit's share of the pack — never from what the browser sent (a spoken rate only for staff who
 * may give discounts), and at 0% GST for a composition dealer. One place, so a quotation and the
 * bill made from it can't disagree. */
export async function priceLines(
  session: SessionContext,
  admin: Admin,
  items: LineInput[],
  /** Prices promised in a still-valid quotation this bill is made from (product → price, and
   * whether it was quoted loose): honoured over today's catalogue price. */
  quoted?: Map<string, { unitPrice: number; loose: boolean }>,
  /** Split buy-X-get-Y free units onto their own ₹0 line (a bill does; a quotation quotes the plain price). */
  opts: { freeLines?: boolean; priceLevel?: PriceLevel } = {},
) {
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const { data: dbProducts, error } = productIds.length
    ? await admin.from("products").select(PRODUCT_COLUMNS).eq("shop_id", session.shopId).in("id", productIds)
    : { data: [], error: null };
  if (error || !dbProducts || dbProducts.length !== productIds.length) return { error: "One or more products could not be verified" as const };
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  // "Buy X get Y free" offers on these items (Offers, migration 0052).
  const offers = new Map<string, Bxgy>();
  if (opts.freeLines !== false && productIds.length && isModuleEnabled(session.enabledModules, "offers") && (await gapsReady(admin))) {
    const { data: rows } = await admin.from("products").select("id, bxgy_buy, bxgy_free").in("id", productIds).not("bxgy_buy", "is", null);
    for (const r of rows ?? []) if (r.bxgy_buy && r.bxgy_free) offers.set(r.id, { buy: r.bxgy_buy, free: r.bxgy_free });
  }

  // A wholesale party pays each item's wholesale rate, where it has one.
  const wholesale = opts.priceLevel === "wholesale" ? await wholesalePrices(admin, productIds) : new Map<string, number>();

  const isComposition = session.gstScheme === "composition";
  const priced = items.map((item, sourceIndex) => {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    const loose = product ? isLooseLine(product, item) : false;
    const overridden = !!product && item.priceOverride === true && item.unitPrice > 0 && hasPermission(session, "give_discounts");
    const promise = product ? quoted?.get(product.id) : undefined;
    const quotedPrice = promise && promise.loose === loose ? promise.unitPrice : null;
    return {
      // Which of the given items this line came from (a free line shares its paid line's item).
      sourceIndex,
      productId: product?.id ?? null,
      productName: product?.name ?? item.description,
      hsnCode: product?.hsn_code ?? item.hsnCode ?? null,
      quantity: item.quantity,
      stockQuantity: product && loose ? round2(item.quantity / Number(product.units_per_pack)) : product ? item.quantity : (item.stockQuantity ?? item.quantity),
      unitPrice: overridden
        ? item.unitPrice
        : quotedPrice != null
          ? quotedPrice
          : product && wholesale.has(product.id)
            ? loose && Number(product.units_per_pack) > 1
              ? round2(wholesale.get(product.id)! / Number(product.units_per_pack))
              : wholesale.get(product.id)!
            : product
              ? productLinePrice(product, { quantity: item.quantity, loose })
              : item.unitPrice,
      gstPercent: isComposition ? 0 : product ? Number(product.gst_percent) : item.gstPercent,
      warrantyMonths: product?.has_warranty ? product.warranty_months : null,
      mrp: product?.mrp ? Number(product.mrp) : null,
      // A buy-X-get-Y offer applies to whole packs sold at the catalogue price.
      free: product && !loose && !overridden && quotedPrice == null ? freeUnits(item.quantity, offers.get(product.id)) : 0,
      offer: product ? offers.get(product.id) : undefined,
    };
  });
  // The free ones go on their own ₹0 line, so the invoice shows plainly what was given free.
  const lines = priced.flatMap(({ free, offer, ...line }) => {
    if (!free || !offer) return [line];
    const paid = round2(line.quantity - free);
    return [
      { ...line, quantity: paid, stockQuantity: paid },
      { ...line, productName: `${line.productName} (free — buy ${offer.buy} get ${offer.free})`, quantity: free, stockQuantity: free, unitPrice: 0 },
    ];
  });
  return { productMap, lines };
}
