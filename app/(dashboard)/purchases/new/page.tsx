import { hasPermission, requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/allRows";
import { getTranslator } from "@/lib/i18n/server";
import { wholesaleReady } from "@/lib/wholesaleData";
import { lastPurchases } from "@/lib/purchaseData";
import { defaultUnitFor, getUnitsForBusinessType } from "@/lib/businessType";
import { UNITS } from "@/lib/constants/states";
import { garmentSchemaReady } from "@/lib/garment/server";
import { isModuleEnabled } from "@/lib/modules";
import { NewPurchaseClient } from "./NewPurchaseClient";

/** Purchase entry: the vendor's bill line by line, with each item's last rate, stock and selling
 * rates beside it, so the rate list is set in the same place the cost comes in. */
export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { vendorId } = await searchParams;
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();
  // A garment shop (migration 0063 run) also gets each item's style, colour and size, its styles for
  // the size × colour grid, and — with godowns in its plan — the godowns goods can go into.
  const [withWholesale, garment] = await Promise.all([wholesaleReady(admin), session.businessType === "garment" ? garmentSchemaReady(admin) : false]);
  const columns = `id, name, hsn_code, is_pharma, barcode, unit, gst_percent, price, mrp, stock_quantity, track_inventory${withWholesale ? ", wholesale_price" : ""}${garment ? ", style_id, variant_colour, variant_size" : ""}`;
  type Row = { id: string; name: string; hsn_code: string | null; is_pharma: boolean; barcode: string | null; unit: string; gst_percent: number; price: number; mrp: number | null; stock_quantity: number; track_inventory: boolean; wholesale_price?: number | null; style_id?: string | null; variant_colour?: string | null; variant_size?: string | null };
  const godownsOn = garment && isModuleEnabled(session.enabledModules, "garment_godowns");

  const [{ data: vendors }, products, last, { data: recent }, styles, categories, godowns] = await Promise.all([
    admin.from("vendors").select("id, name, gstin, phone, state_code").eq("shop_id", session.shopId).order("name"),
    allRows((from, to) => admin.from("products").select(columns).eq("shop_id", session.shopId).order("name").order("id").range(from, to)),
    lastPurchases(admin, session.shopId),
    admin.from("purchases").select("vendor_id, vendor_invoice_number").eq("shop_id", session.shopId).order("created_at", { ascending: false }).limit(1000),
    garment ? admin.from("product_styles").select("id, name, code, brand, gst_percent").eq("shop_id", session.shopId).eq("is_active", true).order("name").then((r) => r.data ?? []) : [],
    garment ? admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("name").then((r) => r.data ?? []) : [],
    godownsOn ? admin.from("godowns").select("id, name, is_default").eq("shop_id", session.shopId).eq("is_active", true).order("is_default", { ascending: false }).order("name").then((r) => r.data ?? []) : [],
  ]);

  return (
    <NewPurchaseClient
      lang={lang}
      shopId={session.shopId}
      shopStateCode={session.shopStateCode}
      vendors={(vendors ?? []).map((v) => ({ id: v.id, name: v.name, gstin: v.gstin, phone: v.phone, stateCode: v.state_code }))}
      products={(products.data as unknown as Row[]).map((p) => {
        const l = last.get(p.id);
        return {
          id: p.id,
          name: p.name,
          hsnCode: p.hsn_code,
          isPharma: p.is_pharma,
          barcode: p.barcode,
          unit: p.unit,
          gstPercent: Number(p.gst_percent),
          price: Number(p.price),
          mrp: p.mrp != null ? Number(p.mrp) : null,
          wholesale: p.wholesale_price != null ? Number(p.wholesale_price) : null,
          stock: p.track_inventory ? Number(p.stock_quantity) : null,
          last: l ? { rate: l.rate, gstPercent: l.gstPercent, date: l.date, vendorId: l.vendorId } : null,
          ...(p.style_id ? { styleId: p.style_id, colour: p.variant_colour ?? null, size: p.variant_size ?? null } : {}),
        };
      })}
      garment={
        garment
          ? {
              styles: styles.map((s) => ({ id: s.id, name: s.name, code: s.code, brand: s.brand, gstPercent: Number(s.gst_percent) })),
              categories: categories.map((c) => ({ id: c.id, name: c.name })),
              // Picking a godown only makes sense with somewhere besides the shop floor.
              godowns: godowns.some((g) => g.is_default) && godowns.length > 1 ? godowns.map((g) => ({ id: g.id, name: g.name, isDefault: !!g.is_default })) : [],
            }
          : null
      }
      recentBills={(recent ?? []).map((r) => ({ vendorId: r.vendor_id, number: r.vendor_invoice_number.trim().toLowerCase() }))}
      units={getUnitsForBusinessType(session.businessType, UNITS)}
      defaultUnit={defaultUnitFor(session.businessType)}
      canChangeRates={hasPermission(session, "manage_products")}
      withWholesale={withWholesale}
      preselectedVendorId={vendorId ?? null}
    />
  );
}
