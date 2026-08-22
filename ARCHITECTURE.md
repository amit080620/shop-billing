# Architecture Guide

This is a genuine map of how the codebase is organized, for anyone picking
this project up for the first time. It complements README.md (which covers
*what the product does* and *how to deploy it*) — this file covers *how the
code itself is structured*.

## Directory map

```
app/
  (dashboard)/          Everything behind login — the main app shell.
    page.tsx            App entry point — redirects straight into billing
                         (Fast Billing or Normal Billing), never shows a
                         dashboard by default. The full stats dashboard
                         lives at /dashboard, one tap away via the header.
    layout.tsx           Shared shell: top header (shop name + Dashboard/
                         More icons), bottom nav (mobile), desktop sidebar.
    BottomNav.tsx        Exports `tabsFor(businessType, ...)` — the single
                         source of truth for which 5 tabs each business
                         type gets. Read this before changing navigation.
    [feature]/           One folder per feature screen (products, bills,
                         customers, reports, etc.) — each typically has a
                         Server Component page.tsx (data fetching) plus a
                         Client Component *Client.tsx (interactivity).
  book/[token]/          Public, unauthenticated booking page.
  shop/[token]/          Public, unauthenticated storefront/catalog.
  print/                 Print-preview pages — see "Print system" below.

lib/
  actions/              Server Actions ("use server") — the only place
                         that's allowed to write to the database. Every
                         file here is organized by feature (bills.ts,
                         products.ts, customers.ts, ...).
  validation/schemas.ts  Zod schemas + calculateTransactionTotals() — the
                         SINGLE canonical billing/GST/discount calculation
                         engine. Never duplicate this logic elsewhere.
  print/                 Dual print system — see below.
  ocr/                   Offline OCR pipeline — see below.
  supabase/              Supabase client factories + generated DB types.
  i18n/                  Translation dictionary + helpers (en/hi/mr).

supabase/
  schema.sql             The full baseline schema for a brand-new DB.
  migrations/000N_*.sql  Incremental migrations for an EXISTING DB.
  ALL_PENDING_MIGRATIONS.sql   All migrations concatenated — convenience
                         file for applying everything at once. Keep this
                         in sync when adding a new migration (see below).
```

## The billing engine — one canonical source of truth

`lib/validation/schemas.ts` -> `calculateTransactionTotals()` is the ONLY
place GST, discount, and rounding math happens. Normal Billing, Fast
Billing, and the print renderers all call into `createBillCore()` in
`lib/actions/bills.ts`, which itself calls `calculateTransactionTotals()`.

**If you're tempted to compute a total, subtotal, or GST amount anywhere
else -- don't. Route through the existing engine instead.** This is
covered by `lib/validation/__tests__/calculateTransactionTotals.test.ts`.

## Print system

Two genuinely separate renderers, sharing the same underlying bill data:

- `lib/print/ThermalRenderer.tsx` + `lib/print/textGrid.ts` -- a real
  character-grid layout (not CSS flexbox) so a long item name can never
  visually misalign the Qty/Rate/Amount columns on a printed receipt.
- `lib/print/A4Renderer.tsx` -- Apple-typography-inspired, spacious,
  genuinely different visual language from the thermal receipt.
- `lib/escpos.ts` -- raw ESC/POS byte builder for actual Bluetooth
  printing, using the *same* `textGrid.ts` functions as the on-screen
  thermal preview, so what you see is genuinely what prints.

## OCR system (100% offline, no AI API)

`lib/ocr/` -- Tesseract.js pipeline: `preprocess.ts` (deskew -> resize ->
sharpen -> adaptive lighting) -> `tesseract.ts` (PSM-tuned recognition) ->
`lineGrouping.ts` (word-coordinate line reconstruction) -> `parser.ts`
(digit-confusion correction). `lib/fuzzyMatch.ts` catches OCR near-misses
against a shop's own existing product names.

## Business-type-specific logic

`businessType` on the `shops` table drives:
- Which bottom-nav tabs render (`BottomNav.tsx` -> `tabsFor()`)
- Which Home-dashboard variant renders (`app/(dashboard)/dashboard/page.tsx`
  has one `*Home()` component per business type)
- Terminology (`lib/businessType.ts` -> `getTerminology()`)

When adding a new business type, search for an existing one (e.g.
`"gym"`) across these files to find every place it needs to be threaded
through -- there's no single central registry (a known area for future
refactoring).

## Testing

`npm test` runs the Vitest suite (`npm run test:watch` for watch mode).
Coverage as of now: the billing engine, Zod validation schemas, the
thermal print grid algorithm, OCR fuzzy-matching, phone-number parsing,
and WhatsApp link building -- all genuinely pure logic with no database
dependency. Server Actions that hit the database are not yet covered by
automated tests (would need a mocked/test Supabase instance) -- this is a
known, honest gap.

When you fix a real bug, add a regression test for it in the matching
`__tests__/` folder -- several existing tests exist specifically because a
real user-reported bug was found and fixed (see the phone-input and
WhatsApp-link tests for examples of this pattern).

## Adding a new database migration

1. Add a new `supabase/migrations/00NN_description.sql` file (use
   `if not exists` everywhere so it's safely re-runnable).
2. Add the same statements to `supabase/schema.sql` (the baseline for a
   brand-new database) so a fresh signup and an existing upgraded shop
   both end up with the same schema.
3. Regenerate/hand-edit `lib/supabase/database.types.ts` to match (Row,
   Insert, and Update variants for any new/changed columns).
4. Append the new migration to `ALL_PENDING_MIGRATIONS.sql`.

## Genuine known gaps (honest, not hidden)

- No automated tests for Server Actions themselves (only pure logic).
- No formal security audit; DPDP-Act consent scaffolding exists but is
  not a substitute for legal review.
- No centralized business-type registry -- adding a new one means
  touching several files by hand (see above).
- `xlsx` (used for Excel export) has known unpatched vulnerabilities
  upstream -- worth revisiting if a safer alternative appears.
