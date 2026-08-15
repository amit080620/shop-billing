"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type SearchResult = {
  group: "Customers" | "Products" | "Bills" | "Tables" | "Orders";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function universalSearchAction(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const like = `%${q}%`;

  async function searchCustomers(): Promise<SearchResult[]> {
    const { data } = await admin
      .from("customers")
      .select("id, name, phone")
      .eq("shop_id", session.shopId)
      .or(`name.ilike.${like},phone.ilike.${like}`)
      .limit(6);
    return (data ?? []).map((c) => ({
      group: "Customers" as const,
      id: c.id,
      title: c.name,
      subtitle: c.phone ?? "",
      href: `/customers/${c.id}`,
    }));
  }

  async function searchProducts(): Promise<SearchResult[]> {
    const { data } = await admin
      .from("products")
      .select("id, name, barcode")
      .eq("shop_id", session.shopId)
      .or(`name.ilike.${like},barcode.ilike.${like}`)
      .limit(6);
    return (data ?? []).map((p) => ({
      group: "Products" as const,
      id: p.id,
      title: p.name,
      subtitle: p.barcode ?? "",
      href: `/products`,
    }));
  }

  async function searchBills(): Promise<SearchResult[]> {
    const { data } = await admin
      .from("bills")
      .select("id, invoice_number")
      .eq("shop_id", session.shopId)
      .ilike("invoice_number", like)
      .order("created_at", { ascending: false })
      .limit(6);
    return (data ?? []).map((b) => ({
      group: "Bills" as const,
      id: b.id,
      title: b.invoice_number,
      subtitle: "Bill",
      href: `/print/bill/${b.id}`,
    }));
  }

  async function searchTables(): Promise<SearchResult[]> {
    const { data } = await admin
      .from("restaurant_tables")
      .select("id, name")
      .eq("shop_id", session.shopId)
      .ilike("name", like)
      .limit(6);
    return (data ?? []).map((tb) => ({
      group: "Tables" as const,
      id: tb.id,
      title: tb.name,
      subtitle: "Table",
      href: `/restaurant`,
    }));
  }

  async function searchOrders(): Promise<SearchResult[]> {
    const { data } = await admin
      .from("restaurant_orders")
      .select("id, order_number")
      .eq("shop_id", session.shopId)
      .ilike("order_number", like)
      .order("created_at", { ascending: false })
      .limit(6);
    return (data ?? []).map((o) => ({
      group: "Orders" as const,
      id: o.id,
      title: o.order_number,
      subtitle: "Order",
      href: `/restaurant/orders/${o.id}`,
    }));
  }

  const queries = [searchCustomers(), searchProducts(), searchBills()];
  // Restaurant-only entities — only worth querying for shops that
  // actually have this module, so a grocery/pharmacy search stays fast
  // and doesn't hit tables that will always come back empty for them.
  if (session.businessType === "restaurant") {
    queries.push(searchTables(), searchOrders());
  }

  const results = await Promise.all(queries);
  return results.flat();
}

