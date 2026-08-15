# Shop Billing — GST-Compliant Billing & Purchase SaaS

A mobile-first billing app for Indian small businesses covering **both sides
of GST**: sales (output GST you charge) and purchases (input GST / ITC you
pay), with reports laid out the same way the GST portal organizes GSTR-1 and
GSTR-3B. Multi-staff, multi-tenant by design — any shop can sign up
independently.

Loosely modelled on what Vyapar/Marg ERP cover for a small retailer's basic
plan: catalog with HSN + GST%, party ledgers (customers *and* vendors),
GST-correct invoicing, and compliance reports. See **Scope & limitations**
below for what's deliberately not included.

## Stack

- **Next.js 15** (App Router, Turbopack), single app.
- **Supabase** — Postgres + Auth. All writes go through **Server Actions**
  using the service-role client, with `shop_id` ownership checked on every
  query — each signed-up shop is a fully isolated tenant.
- **Tailwind CSS 4**.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor**, paste all of `supabase/schema.sql`, run it.
3. From **Project Settings → API**, copy the Project URL, `anon` key, and
   `service_role` key (keep the service key private — never expose it to
   the browser).

## 2. Configure environment variables

```bash
cp .env.local.example .env.local
```
Fill in the three Supabase values.

## 3. Match the Vercel region to Supabase

Edit `vercel.json` — set the region closest to your Supabase project (default
`bom1` / Mumbai).

## 4. Run locally

```bash
npm install
npm run dev
```
Visit `/signup` to create your shop and owner login.

## 5. First-time setup inside the app

1. **More → GST & shop profile** — enter your shop's state (required before
   any billing works — it's what decides CGST+SGST vs IGST), GSTIN if
   registered, and GST scheme (Regular/Composition).
2. **More → Products** — add products with HSN/SAC code, unit, price, and
   GST%.
3. **More → Vendors** — add suppliers, with their GSTIN + state if known.
4. Start billing from **Sell**, and log incoming stock from **Buy**.

## How the GST logic works

- **Place of supply**: if the other party's state matches your shop's state,
  tax splits into **CGST + SGST** (half the rate each); if it's a different
  state, the full rate goes to **IGST**. This is computed fresh on every
  bill/purchase from the state on file — never hand-entered.
- **Invoice numbering**: sequential per shop per Indian financial year
  (Apr–Mar), issued atomically via a Postgres function
  (`next_invoice_number`) so two staff billing at once never collide or skip
  a number — a GST filing requirement.
- **B2B vs B2C**: a customer with a GSTIN on file is B2B (itemized in GSTR-1
  Table 4); without one, they're B2C (consolidated in Table 7, or Table 5 if
  it's a single inter-state invoice over ₹2.5 lakh).
- **HSN summary**: every bill line snapshots the product's HSN code and GST%
  at the time of sale, so it stays accurate even if you edit the product
  later — and rolls up into GSTR-1's mandatory Table 12.

## Basic inventory

Products → tick "Track stock for this product" to opt a product into stock
tracking (off by default — most small shops don't need it for everything).
Once tracked: stock decreases automatically on every sale, increases on
every purchase, and the product list shows a "Low stock" flag once quantity
drops to your set threshold. This is intentionally simple (no reservations,
no multi-location, no batch/expiry tracking) — a real stock ledger with
audit history would be a natural next step if you outgrow this.

## Item requests ("customer asked, we didn't have it")

More → Item requests. When someone asks for something you don't currently
stock: log their name/phone (existing customer or just typed in), what they
asked for, and optionally an advance payment taken. When it arrives, tap
"Mark available" — a WhatsApp button appears with a pre-filled message
("your item has arrived, come collect it," including a note about the
advance if one was taken). Tap "Mark collected" once they've picked it up.

## Invoicing extras

- **Shop logo**: More → GST & shop profile → upload a PNG/JPG/WEBP/SVG (under
  2MB). Shows in the dashboard header and on every printed invoice.
- **Payment method**: chosen on the Complete Ticket screen (Cash/Card/UPI/
  Online/Other), saved per bill, shown on the printed invoice next to "Paid."
- **Send invoice on WhatsApp**: right after generating an invoice, a green
  "Send invoice on WhatsApp" button sits above Print — opens WhatsApp with
  the invoice summary (number, total, paid, balance due) pre-filled to the
  customer's number. Requires the customer to have a phone on file; walk-in
  sales won't show this button.
- **Udhaar reminders** (More → Udhaar reminders, or tap "Outstanding credit"
  on the dashboard): every customer with a balance, sorted highest-first,
  each with a one-tap WhatsApp reminder link. This is a **manual, one-tap-
  per-customer** workflow, not automatic sending — WhatsApp's `wa.me` links
  can only pre-fill text; a human still has to tap Send inside WhatsApp. Truly
  automatic recurring reminders (no tap required) need the paid WhatsApp
  Business Platform (Meta Business verification + per-conversation pricing),
  which is a separate business/infra decision, not something addable in code
  alone.

## Reports (Reports tab)

- **GSTR-1** — B2B, B2C Large, B2C Small (consolidated), HSN summary, and
  document (invoice number) summary. Each table has its own CSV export.
- **GSTR-3B** — outward tax liability, reverse-charge inward supplies, ITC
  available (from your purchase register), and a simplified net-payable
  estimate.
- **Purchase register** — every purchase for the period with its
  CGST/SGST/IGST split and ITC-eligibility flag; this is your self-maintained
  equivalent of GSTR-2B, since actual GSTN reconciliation needs GSP/ASP API
  access this app doesn't have.
- Both the dashboard Home screen and GSTR-3B show a **net GST payable**
  figure combining what you owe from sales against what you can claim back
  from purchases — the "two-sided" view you asked for.

## What this is *not*

Being upfront about the edges of a "basic version," since this is a
compliance-adjacent tool:

- **No e-filing.** Reports are laid out like the portal's tables and export
  to CSV, but nothing here submits to the GST portal — that requires a
  licensed GSP/ASP and GSTN API access, which is a separate business
  registration, not something addable in code alone. Use these numbers for
  manual entry, upload via the government's offline utility, or hand to
  your CA.
- **GSTR-3B net payable is simplified.** It nets Output − Input per tax head
  (CGST/SGST/IGST separately). Real GST law allows cross-utilising credit
  between heads in a specific order (e.g. spare IGST credit can offset
  CGST/SGST liability) — this app flags that rather than guessing at it,
  since getting a cash-payable figure wrong has real penalty consequences.
- **Composition scheme isn't implemented.** If your shop is Composition
  (fixed 1%/5%/6% turnover tax, no ITC), GSTR-1/3B don't apply to you at
  all — you'd file CMP-08 quarterly instead, which this version doesn't
  build. The Settings toggle exists so you can flag it, but the reports
  underneath are Regular-scheme only for now.
- **No reverse-charge automation beyond a flag.** RCM purchases are tallied
  separately in GSTR-3B, but liability computation/payment isn't automated.
- **No e-invoicing (IRN/QR) or e-way bills.** Both need direct integration
  with government systems (IRP/e-way bill portal) beyond this app's scope.
- **No inventory/stock tracking, multi-branch, or barcode scanning** —
  common in Vyapar/Marg's fuller plans, not built here. The schema (products,
  bill_items, purchase_items) would support adding a stock-ledger module
  later without a rearchitecture.
- **Credit/debit notes (sales returns) aren't modeled** — table 9 of GSTR-1
  (CDNR/CDNUR) is therefore always empty; returns currently have no
  dedicated flow.

## Multi-staff & multi-tenant

The person who signs up becomes the shop's `owner`; **More → Staff** lets an
owner create additional logins (`staff` or `owner` role) scoped to the same
shop. Because every table is `shop_id`-scoped and any visitor can `/signup`
their own shop, the app is already structurally multi-tenant — a genuine SaaS
product would additionally need a subscription/billing layer (e.g. Razorpay
subscriptions) to charge those tenants, which isn't built here but would
layer on cleanly on top of the existing `shops` table.
