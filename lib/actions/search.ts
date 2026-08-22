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
  { title: "Privacy notice", subtitle: "What data we collect and why", href: "/privacy-policy", keywords: ["privacy", "data", "dpdp"] },
  { title: "Audit log", subtitle: "Who did what, and when", href: "/audit-log", keywords: ["audit", "log", "history"] },
  { title: "Error log", subtitle: "Unexpected failures caught automatically", href: "/error-log", keywords: ["error", "bug", "crash"] },
  { title: "Birthdays", subtitle: "Wish customers, bring them back", href: "/birthdays", keywords: ["birthday", "wish"] },
  { title: "Reorder stock", subtitle: "Send low-stock items to a vendor", href: "/reorder", keywords: ["reorder", "restock", "low stock"] },
  { title: "Item requests", subtitle: "Customer asked, notify when it arrives", href: "/requests", keywords: ["request", "notify"] },
  { title: "Udhaar reminders", subtitle: "One-tap WhatsApp follow-ups", href: "/reminders", keywords: ["udhaar", "reminder", "credit"] },
  { title: "Send an offer", subtitle: "Broadcast a message to customers", href: "/offers", keywords: ["offer", "broadcast", "marketing"] },
  { title: "Festival planner", subtitle: "Upcoming festivals & stock-up reminders", href: "/festivals", keywords: ["festival", "diwali", "holi"] },
  { title: "Loyalty program", subtitle: "Reward regulars for coming back", href: "/loyalty-settings", keywords: ["loyalty", "points", "reward"] },
  { title: "Fast billing", subtitle: "Tap-to-add counter for busy hours", href: "/fast-billing-settings", keywords: ["fast billing", "quick billing", "counter"] },
  { title: "Invoice design", subtitle: "Tagline, footer, terms, accent color", href: "/invoice-settings", keywords: ["invoice design", "branding", "logo"] },
  { title: "Catalog orders", subtitle: "Review orders that came in", href: "/catalog-orders", keywords: ["catalog order", "online order"] },
  { title: "Offline billing", subtitle: "Keep billing with no connection", href: "/offline-bill", keywords: ["offline", "no internet"] },
  { title: "Stock audit", subtitle: "Count physical stock, reconcile mismatches", href: "/stock-audit", keywords: ["stock audit", "physical count"] },
  { title: "Warranty", subtitle: "Look up an item's warranty status", href: "/warranty", keywords: ["warranty", "guarantee"] },
  { title: "Team access", subtitle: "Read-only leads dashboard", href: "/admin/team-access", keywords: ["team", "viewer access"] },
  // Business-type-specific pages — harmless to index for everyone,
  // since only a shop that genuinely has that page would ever search
  // these terms in the first place.
  { title: "Tables", subtitle: "Restaurant table management", href: "/restaurant", keywords: ["table", "restaurant"] },
  { title: "Kitchen display", subtitle: "Live order tickets", href: "/restaurant-kds", keywords: ["kitchen", "kds", "kot"] },
  { title: "Combos", subtitle: "Bundle deals for the menu", href: "/restaurant/combos", keywords: ["combo", "bundle"] },
  { title: "Restaurant reports", subtitle: "Sales by item, table turnover", href: "/restaurant/reports", keywords: ["restaurant report"] },
  { title: "Service jobs", subtitle: "Repair job tracking", href: "/service", keywords: ["job", "repair", "service"] },
  { title: "New job", subtitle: "Receive an item for repair", href: "/service/new", keywords: ["new job", "receive repair"] },
  { title: "Service reports", subtitle: "Technician performance, turnaround", href: "/service/reports", keywords: ["service report"] },
  { title: "Salon appointments", subtitle: "Booking calendar", href: "/salon", keywords: ["salon", "appointment", "booking"] },
  { title: "Vehicles", subtitle: "Fleet & document expiry", href: "/transport/vehicles", keywords: ["vehicle", "fleet"] },
  { title: "Transport reports", subtitle: "Rounds, km covered", href: "/transport/reports", keywords: ["transport report"] },
  { title: "Gym members", subtitle: "Memberships & check-ins", href: "/gym/members", keywords: ["gym member", "membership"] },
  { title: "Gym leads", subtitle: "Prospective members", href: "/gym/leads", keywords: ["gym lead", "trial"] },
  { title: "Gym plans", subtitle: "Membership plan pricing", href: "/gym/plans", keywords: ["gym plan", "pricing"] },
  { title: "Gym attendance", subtitle: "Daily check-in log", href: "/gym/attendance", keywords: ["attendance", "check-in"] },
  { title: "Lab orders", subtitle: "Test orders & results", href: "/lab/orders", keywords: ["lab order", "test"] },
  { title: "Lab tests", subtitle: "Test catalog & pricing", href: "/lab/tests", keywords: ["lab test catalog"] },
  { title: "Clinic appointments", subtitle: "Booking calendar", href: "/clinic/appointments", keywords: ["clinic appointment"] },
  { title: "New prescription", subtitle: "Write a prescription", href: "/clinic/prescriptions/new", keywords: ["prescription", "rx"] },
  { title: "Medicine library", subtitle: "Saved medicines — no retyping", href: "/clinic/medicine-library", keywords: ["medicine library", "drug list"] },
  { title: "Treatment plans", subtitle: "Plan → quotation → bill", href: "/clinic/treatment-plans", keywords: ["treatment plan", "quotation", "dental plan"] },
  { title: "Medicine expiry", subtitle: "Batches expiring soon", href: "/pharmacy/expiry", keywords: ["expiry", "medicine"] },
  { title: "Write-offs", subtitle: "Expired/damaged stock removal", href: "/pharmacy/write-offs", keywords: ["write-off", "damaged stock"] },
  { title: "Doctors", subtitle: "Prescribing doctor directory", href: "/pharmacy/doctors", keywords: ["doctor"] },
  { title: "Schedule X register", subtitle: "Controlled substance register", href: "/pharmacy/schedule-x-register", keywords: ["schedule x"] },
  { title: "Jewellery rates", subtitle: "Today's gold & silver rate", href: "/jewellery/rates", keywords: ["gold rate", "silver rate"] },
  { title: "Old jewellery exchange", subtitle: "Exchange value tracking", href: "/jewellery/exchanges", keywords: ["exchange", "old gold"] },
  { title: "Rental history", subtitle: "Past & active rentals", href: "/rentals/history", keywords: ["rental history"] },
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

  async function searchServiceJobs(): Promise<SearchResult[]> {
    const { data } = await admin
      .from("service_jobs")
      .select("id, job_number, item_description, customer_name")
      .eq("shop_id", session.shopId)
      .or(
        `job_number.ilike.${like},item_description.ilike.${like},customer_name.ilike.${like},identifiers::text.ilike.${like}`,
      )
      .order("created_at", { ascending: false })
      .limit(6);
    return (data ?? []).map((j) => ({
      group: "Orders" as const,
      id: j.id,
      title: j.item_description,
      subtitle: `${j.customer_name} · #${j.job_number}`,
      href: `/service/${j.id}`,
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
  if (session.businessType === "service") {
    queries.push(searchServiceJobs());
  }

  const results = await Promise.all(queries);
  return [...results.flat(), ...searchStaticPages(q)];
}

