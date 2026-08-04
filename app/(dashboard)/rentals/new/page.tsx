import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewRentalClient } from "./NewRentalClient";

export default async function NewRentalPage() {
  const session = await requireSession();

  if (!session.shopStateCode) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted">
          Add your shop&apos;s state under Settings before creating rentals — it&apos;s needed to
          work out CGST+SGST vs IGST on every rental invoice.
        </p>
        <Link href="/settings" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Go to Settings
        </Link>
      </div>
    );
  }

  const admin = createSupabaseAdminClient();
  const [{ data: products }, { data: customers }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, unit, gst_percent, stock_quantity, rental_rate_hourly, rental_rate_daily, rental_rate_weekly, rental_rate_monthly, security_deposit")
      .eq("shop_id", session.shopId)
      .eq("is_rentable", true)
      .order("name"),
    admin.from("customers").select("id, name, phone, state_code").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <NewRentalClient
      shopStateCode={session.shopStateCode}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        gstPercent: Number(p.gst_percent),
        stockQuantity: Number(p.stock_quantity),
        rentalRateHourly: p.rental_rate_hourly !== null ? Number(p.rental_rate_hourly) : null,
        rentalRateDaily: p.rental_rate_daily !== null ? Number(p.rental_rate_daily) : null,
        rentalRateWeekly: p.rental_rate_weekly !== null ? Number(p.rental_rate_weekly) : null,
        rentalRateMonthly: p.rental_rate_monthly !== null ? Number(p.rental_rate_monthly) : null,
        securityDeposit: Number(p.security_deposit),
      }))}
      customers={(customers ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        stateCode: c.state_code,
      }))}
    />
  );
}
