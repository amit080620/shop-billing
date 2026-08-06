import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTerminology } from "@/lib/businessType";
import { ProductsClient } from "./ProductsClient";

export default async function ProductsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const terminology = getTerminology(session.businessType);

  const [{ data: products }, { data: categories }] = await Promise.all([
    admin
      .from("products")
      .select(
        "id, name, price, gst_percent, hsn_code, barcode, unit, category_id, track_inventory, stock_quantity, low_stock_threshold, is_rentable, rental_rate_hourly, rental_rate_daily, rental_rate_weekly, rental_rate_monthly, security_deposit, is_pharma, requires_prescription, salt_composition, rack_location, drug_schedule, units_per_pack, loose_unit_name, categories ( name )",
      )
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("categories")
      .select("id, name")
      .eq("shop_id", session.shopId)
      .order("name"),
  ]);

  return (
    <ProductsClient
      initialProducts={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        gstPercent: Number(p.gst_percent),
        hsnCode: p.hsn_code,
        barcode: p.barcode,
        unit: p.unit,
        trackInventory: p.track_inventory,
        stockQuantity: Number(p.stock_quantity),
        lowStockThreshold: Number(p.low_stock_threshold),
        categoryId: p.category_id,
        isRentable: p.is_rentable,
        rentalRateHourly: p.rental_rate_hourly !== null ? Number(p.rental_rate_hourly) : null,
        rentalRateDaily: p.rental_rate_daily !== null ? Number(p.rental_rate_daily) : null,
        rentalRateWeekly: p.rental_rate_weekly !== null ? Number(p.rental_rate_weekly) : null,
        rentalRateMonthly: p.rental_rate_monthly !== null ? Number(p.rental_rate_monthly) : null,
        securityDeposit: Number(p.security_deposit),
        isPharma: p.is_pharma,
        requiresPrescription: p.requires_prescription,
        saltComposition: p.salt_composition,
        rackLocation: p.rack_location,
        drugSchedule: p.drug_schedule,
        unitsPerPack: p.units_per_pack !== null ? Number(p.units_per_pack) : null,
        looseUnitName: p.loose_unit_name,
        categoryName: Array.isArray(p.categories)
          ? p.categories[0]?.name
          : (p.categories as { name: string } | null)?.name ?? null,
      }))}
      categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
      terminology={terminology}
    />
  );
}
