# Print System — Billing Critical

Screen UI and printed documents are separate systems.

## Thermal 58mm
- page width: 58mm
- margins: 2–3mm
- body: 10–11px equivalent
- compact line height
- no background colors
- no shadows
- monochrome-safe
- hide navigation, dialogs, buttons, animations

## Thermal 80mm
- page width: 80mm
- margins: 3–4mm
- body: 10–12px equivalent
- compact tables and totals

## A4
- size: A4
- margins: 10–12mm
- invoice body 10–12pt
- header hierarchy 14–20pt
- avoid splitting invoice rows where possible
- repeat table header on page breaks

## CSS requirements
Use dedicated print classes and `@media print`.
Use `@page` for paper size/margins.
All interactive UI must be hidden in print.
Never rely on screen gradients/shadows for printed meaning.
Logo, GST fields, invoice number/date, customer, line items, taxes, totals, payment status and footer must remain printable.

Claude must inspect the existing print implementation before changing it.
Do not alter existing billing calculations.
