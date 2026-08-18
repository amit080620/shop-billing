"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type SearchResult = {
  group: "Customers" | "Products" | "Bills" | "Tables" | "Orders" | "Pages";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

// Genuine app destinations — settings, quick actions, and common pages
// that aren't database records but people still expect to find by
// typing their name ("theme", "sell", "language" etc.).
const STATIC_PAGES: { title: string; subtitle: string; href: string; keywords: string[] }[] = [
  { title: "Language", subtitle: "English, Hindi, Marathi", href: "/more", keywords: ["language", "hindi", "marathi", "bhasha"] },
  { title: "Theme", subtitle: "Light or dark mode", href: "/more", keywords: ["theme", "dark", "light", "mode"] },
  { title: "Accent color", subtitle: "Blue, Saffron, Gray", href: "/more", keywords: ["accent", "color", "colour", "blue", "saffron"] },
  { title: "Text color", subtitle: "Black, Navy, Charcoal, Slate", href: "/more", keywords: ["text color", "text colour"] },
  { title: "New Bill", subtitle: "Sell / create a bill", href: "/bills/new", keywords: ["sell", "new bill", "billing", "invoice"] },
  { title: "All bills", subtitle: "Browse & reprint past bills", href: "/bills/all", keywords: ["bills", "reprint", "invoice history"] },
  { title: "Purchases", subtitle: "Buy stock from a vendor", href: "/purchases/new", keywords: ["buy", "purchase", "stock in"] },
  { title: "Products", subtitle: "Add and manage items", href: "/products", keywords: ["product", "item", "inventory", "stock"] },
  { title: "Scan menu", subtitle: "Add items from a photo", href: "/products/scan-menu", keywords: ["scan menu", "camera", "ocr"] },
  { title: "Customers", subtitle: "Ledger and credit", href: "/customers", keywords: ["customer", "udhaar", "credit"] },
  { title: "Vendors", subtitle: "Suppliers and payables", href: "/vendors", keywords: ["vendor", "supplier", "payable"] },
  { title: "Staff", subtitle: "Manage staff & permissions", href: "/staff", keywords: ["staff", "employee", "permission"] },
  { title: "Reports", subtitle: "Daily summary, GST filing", href: "/reports", keywords: ["report", "gst", "gstr"] },
  { title: "Insights", subtitle: "Fast movers & dead stock", href: "/insights", keywords: ["insight", "fast mover", "dead stock", "analytics"] },
  { title: "Export data", subtitle: "Download as Excel or PDF", href: "/reports/export", keywords: ["export", "excel", "csv", "pdf", "download"] },
  { title: "Petty cash", subtitle: "Small day-to-day expenses", href: "/petty-cash", keywords: ["petty cash", "expense"] },
  { title: "Settings", subtitle: "Shop details, GST profile", href: "/settings", keywords: ["settings", "gst profile", "shop details"] },
  { title: "Catalog link", subtitle: "Online ordering setup", href: "/catalog-settings", keywords: ["catalog", "online order", "online menu"] },
  { title: "Menu PDF", subtitle: "Downloadable clickable menu", href: "/catalog-settings/menu-pdf", keywords: ["menu pdf", "download menu"] },
  { title: "Branches", subtitle: "Manage multiple locations", href: "/branches", keywords: ["branch", "location"] },
  { title: "Help & support", subtitle: "Guides and contact", href: "/help", keywords: ["help", "support", "guide"] },
];

function searchStaticPages(query: string): SearchResult[] {
  const q = query.toLowerCase();
  return STATIC_PAGES.filter(
    (p) => p.title.toLowerCase().includes(q) || p.keywords.some((k) => k.includes(q)),
  )
    .slice(0, 6)
    .map((p) => ({ group: "Pages" as const, id: p.href + p.title, title: p.title, subtitle: p.subtitle, href: p.href }));
}

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
  return [...results.flat(), ...searchStaticPages(q)];
}

