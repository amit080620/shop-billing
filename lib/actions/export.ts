"use server";

import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ExportDataType = "bills" | "restaurant_orders" | "petty_cash" | "online_orders" | "customers" | "vendors" | "purchases";

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export async function exportReportAction(
  type: ExportDataType,
  from: string,
  to: string,
): Promise<{ error?: string; csv?: string; filename?: string; headers?: string[]; rows?: (string | number)[][] }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const fromTs = `${from}T00:00:00`;
  const toTs = `${to}T23:59:59.999`;

  if (type === "bills") {
    const { data } = await admin
      .from("bills")
      .select("invoice_number, created_at, total, paid_amount, credit_amount, status, customers ( name )")
      .eq("shop_id", session.shopId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true });
    const rows = (data ?? []).map((b) => {
      const c = Array.isArray(b.customers) ? b.customers[0] : b.customers;
      return [b.invoice_number, b.created_at, Number(b.total), Number(b.paid_amount), Number(b.credit_amount), b.status, c?.name ?? ""];
    });
    const headers = ["Invoice #", "Date", "Total", "Paid", "Credit", "Status", "Customer"];
    return {
      csv: toCsv(headers, rows),
      filename: `bills_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  if (type === "restaurant_orders") {
    const { data } = await admin
      .from("restaurant_orders")
      .select("order_number, settled_at, total, paid_amount, credit_amount, waiter_name, order_type")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", fromTs)
      .lte("settled_at", toTs)
      .order("settled_at", { ascending: true });
    const rows = (data ?? []).map((o) => [
      o.order_number,
      o.settled_at ?? "",
      Number(o.total),
      Number(o.paid_amount),
      Number(o.credit_amount),
      o.waiter_name ?? "",
      o.order_type ?? "",
    ]);
    const headers = ["Order #", "Settled at", "Total", "Paid", "Credit", "Waiter", "Type"];
    return {
      csv: toCsv(headers, rows),
      filename: `restaurant_orders_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  if (type === "petty_cash") {
    const { data } = await admin
      .from("petty_cash_entries")
      .select("description, amount, category, created_at")
      .eq("shop_id", session.shopId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true });
    const rows = (data ?? []).map((e) => [e.created_at, e.description, Number(e.amount), e.category ?? ""]);
    const headers = ["Date", "Description", "Amount", "Category"];
    return {
      csv: toCsv(headers, rows),
      filename: `petty_cash_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  if (type === "online_orders") {
    const { data } = await admin
      .from("catalog_order_requests")
      .select("customer_name, customer_phone, status, delivery_charge, created_at")
      .eq("shop_id", session.shopId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true });
    const rows = (data ?? []).map((o) => [o.created_at, o.customer_name, o.customer_phone, o.status, Number(o.delivery_charge)]);
    const headers = ["Date", "Customer", "Phone", "Status", "Delivery charge"];
    return {
      csv: toCsv(headers, rows),
      filename: `online_orders_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  if (type === "customers") {
    const { data } = await admin
      .from("customers")
      .select("name, phone, created_at")
      .eq("shop_id", session.shopId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true });
    const rows = (data ?? []).map((c) => [c.created_at, c.name, c.phone ?? ""]);
    const headers = ["Date added", "Name", "Phone"];
    return {
      csv: toCsv(headers, rows),
      filename: `new_customers_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  if (type === "vendors") {
    const { data } = await admin
      .from("vendors")
      .select("name, phone, created_at")
      .eq("shop_id", session.shopId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true });
    const rows = (data ?? []).map((v) => [v.created_at, v.name, v.phone ?? ""]);
    const headers = ["Date added", "Name", "Phone"];
    return {
      csv: toCsv(headers, rows),
      filename: `new_vendors_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  if (type === "purchases") {
    const { data } = await admin
      .from("purchases")
      .select("purchase_date, total, paid_amount, payable_amount, vendors ( name )")
      .eq("shop_id", session.shopId)
      .gte("purchase_date", from)
      .lte("purchase_date", to)
      .order("purchase_date", { ascending: true });
    const rows = (data ?? []).map((p) => {
      const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
      return [p.purchase_date, vendor?.name ?? "", Number(p.total), Number(p.paid_amount), Number(p.payable_amount)];
    });
    const headers = ["Date", "Vendor", "Total", "Paid", "Payable"];
    return {
      csv: toCsv(headers, rows),
      filename: `purchases_${from}_to_${to}.csv`,
      headers,
      rows,
    };
  }

  return { error: "Unknown report type" };
}
