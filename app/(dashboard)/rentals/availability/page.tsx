import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { CalendarSearch } from "lucide-react";

export default async function RentalAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; month?: string }>;
}) {
  const session = await requireSession();
  const { productId, month } = await searchParams;
  const admin = createSupabaseAdminClient();

  const { data: products } = await admin
    .from("products")
    .select("id, name, stock_quantity")
    .eq("shop_id", session.shopId)
    .eq("is_rentable", true)
    .order("name");

  const selectedProduct = productId ? (products ?? []).find((p) => p.id === productId) : products?.[0];

  const now = new Date();
  const [monthYear, monthNum] = month ? month.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const monthStart = new Date(monthYear, monthNum - 1, 1);
  const monthEnd = new Date(monthYear, monthNum, 0);

  let bookings: { startDate: string; endDate: string; quantity: number; customerName: string; status: string }[] = [];
  if (selectedProduct) {
    const { data: items } = await admin
      .from("rental_items")
      .select("quantity, rentals!inner ( id, start_date, end_date, status, customers ( name ) )")
      .eq("product_id", selectedProduct.id)
      .in("rentals.status", ["booked", "active"])
      .lte("rentals.start_date", monthEnd.toISOString())
      .gte("rentals.end_date", monthStart.toISOString());

    bookings = (items ?? []).map((item) => {
      const rental = Array.isArray(item.rentals) ? item.rentals[0] : item.rentals;
      const customer = rental && Array.isArray(rental.customers) ? rental.customers[0] : (rental?.customers as { name: string } | null);
      return {
        startDate: rental?.start_date ?? "",
        endDate: rental?.end_date ?? "",
        quantity: Number(item.quantity),
        customerName: customer?.name ?? "Walk-in",
        status: rental?.status ?? "",
      };
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Availability calendar"
        subtitle="See which days an item is already booked, at a glance."
        icon={<CalendarSearch size={18} strokeWidth={1.8} />}
      />
      <Link href="/rentals" className="text-sm text-muted">
        ← Rentals
      </Link>

      {(!products || products.length === 0) ? (
        <p className="text-sm text-muted">No rentable items yet — mark an item as rentable in Products first.</p>
      ) : (
        <AvailabilityCalendar
          products={products.map((p) => ({ id: p.id, name: p.name, stockQuantity: Number(p.stock_quantity) }))}
          selectedProductId={selectedProduct?.id ?? products[0].id}
          year={monthYear}
          month={monthNum}
          bookings={bookings}
        />
      )}
    </div>
  );
}
