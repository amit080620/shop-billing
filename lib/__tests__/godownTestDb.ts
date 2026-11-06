// The tables 0060, 0061 and 0063 need, as production has them, on PGlite, with those three migrations
// applied: the base for database tests of features built on the godown ledger. Copied from
// garmentGodowns.db.test.ts, which keeps its own copy.
import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

export const SHOP = "00000000-0000-0000-0000-00000000000a";
export const OTHER = "00000000-0000-0000-0000-00000000000b";
export const read = (f: string) => readFileSync(path.join(__dirname, "../../supabase/migrations", f), "utf8");

export async function newGodownDb(): Promise<PGlite> {
  const d = new PGlite();
  await d.exec(`
    create role anon; create role authenticated; create role service_role;
    create table shops (id uuid primary key, name text, business_type text not null default 'garment', block_oversell boolean not null default false);
    create table categories (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table branches (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table products (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), name text not null,
      stock_quantity numeric(12, 3) not null default 0, track_inventory boolean not null default true, is_pharma boolean not null default false,
      barcode text, unit text not null default 'PCS'
    );
    create table medicine_batches (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null, product_id uuid not null references products(id),
      expiry_date date not null default '2099-12-31', quantity numeric(12, 3) not null default 0
    );
    create table bills (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), status text not null default 'active',
      customer_id uuid, staff_id uuid, voided_at timestamptz, voided_by uuid, void_reason text,
      payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
      subtotal numeric(12, 2) not null default 0, discount_amount numeric(12, 2) not null default 0, taxable_amount numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0, igst_amount numeric(12, 2) not null default 0,
      gst_amount numeric(12, 2) not null default 0, round_off_amount numeric(12, 2) not null default 0,
      total numeric(12, 2) not null default 0, paid_amount numeric(12, 2) not null default 0, credit_amount numeric(12, 2) not null default 0,
      edited_at timestamptz, edited_by uuid, edit_reason text
    );
    create table bill_items (
      id uuid primary key default gen_random_uuid(), bill_id uuid not null references bills(id) on delete cascade, product_id uuid,
      product_name text not null default 'Item', quantity numeric(12, 3) not null, unit_price numeric(12, 2) not null default 10,
      gst_percent numeric(5, 2) not null default 0, hsn_code text, line_subtotal numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0, igst_amount numeric(12, 2) not null default 0,
      line_gst numeric(12, 2) not null default 0, line_total numeric(12, 2) not null default 0, batch_id uuid references medicine_batches(id)
    );
    create table returns (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), bill_id uuid not null references bills(id),
      customer_id uuid, staff_id uuid, return_number text not null default 'CN/1', financial_year text not null default '2026-27', reason text,
      subtotal numeric(12, 2) not null default 0, cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0, total numeric(12, 2) not null default 0,
      refund_method text not null default 'cash' check (refund_method in ('cash', 'card', 'upi', 'online', 'other', 'credit_adjustment')),
      created_at timestamptz not null default now()
    );
    create table payments (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), customer_id uuid not null, staff_id uuid,
      amount numeric(12, 2) not null, payment_method text not null, note text
    );
    create table return_items (
      id uuid primary key default gen_random_uuid(), return_id uuid not null references returns(id) on delete cascade,
      bill_item_id uuid not null references bill_items(id), product_id uuid, product_name text not null default 'Item',
      quantity numeric(12, 3) not null, unit_price numeric(12, 2) not null default 0, gst_percent numeric(5, 2) not null default 0,
      line_subtotal numeric(12, 2) not null default 0, cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0, line_total numeric(12, 2) not null default 0
    );
    create table recipe_lines (id uuid primary key default gen_random_uuid(), shop_id uuid not null, dish_id uuid not null, ingredient_id uuid not null, quantity numeric(12, 4) not null default 1);
    create table kitchen_usage (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null, ingredient_id uuid not null,
      kind text not null default 'sale', quantity numeric(12, 4) not null default 1, bill_id uuid, staff_id uuid, created_at timestamptz not null default now()
    );
    create table vendors (id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), name text not null default 'Vendor');
    create table purchases (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), vendor_id uuid not null references vendors(id),
      purchase_date date not null default current_date, payable_amount numeric(12, 2) not null default 0, created_at timestamptz not null default now()
    );
    create table purchase_items (
      id uuid primary key default gen_random_uuid(), purchase_id uuid not null references purchases(id), product_id uuid,
      quantity numeric(12, 3) not null, free_quantity numeric(12, 3) not null default 0, unit_price numeric(12, 2) not null, gst_percent numeric(5, 2) not null default 0
    );
    create table purchase_payments (id uuid primary key default gen_random_uuid(), shop_id uuid not null, vendor_id uuid not null, amount numeric(12, 2) not null);
    create function public.decrement_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$ select 1; $fn$;
    create function public.increment_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$ select 1; $fn$;
    insert into shops (id, name) values ('${SHOP}', 'Shop'), ('${OTHER}', 'Other');
  `);
  await d.exec(read("0060_stock_guard.sql"));
  await d.exec(read("0061_bill_payments.sql"));
  await d.exec(read("0063_garment_godowns.sql"));
  return d;
}
