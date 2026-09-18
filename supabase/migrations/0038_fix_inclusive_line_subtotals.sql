-- Data fix: GST-inclusive bill and rental lines stored the wrong line split.
--
-- For shops whose prices include GST, the billing engine saved each line's
-- GST-inclusive amount as line_subtotal and then added the GST again for
-- line_total. Printed invoices showed inflated line amounts (a ₹62 item as
-- ₹64.95) and GSTR-1, which sums line_subtotal as taxable value, overstated
-- taxable turnover. Bill-level totals were always correct.
--
-- The engine is fixed going forward. This rewrites the affected historical
-- lines: taxable base = old line_subtotal - GST, line_total = old
-- line_subtotal (the price the customer actually paid).
--
-- Safe to re-run: a corrected line has GST = taxable x rate, a broken one has
-- GST = taxable x rate / (1 + rate); only broken lines match the filter.

update bill_items bi
set
  line_total = bi.line_subtotal,
  line_subtotal = bi.line_subtotal - bi.line_gst
from bills b
where bi.bill_id = b.id
  and b.price_includes_gst = true
  and bi.gst_percent > 0
  and bi.line_gst > 0
  and abs(bi.line_total - (bi.line_subtotal + bi.line_gst)) <= 0.01
  and abs(bi.line_gst - round(bi.line_subtotal * bi.gst_percent / (100 + bi.gst_percent), 2)) <= 0.02
  and abs(bi.line_gst - round(bi.line_subtotal * bi.gst_percent / 100, 2)) > 0.02;

update rental_items ri
set
  line_total = ri.line_subtotal,
  line_subtotal = ri.line_subtotal - (ri.cgst_amount + ri.sgst_amount + ri.igst_amount)
from rentals r
where ri.rental_id = r.id
  and r.price_includes_gst = true
  and ri.gst_percent > 0
  and (ri.cgst_amount + ri.sgst_amount + ri.igst_amount) > 0
  and abs(ri.line_total - (ri.line_subtotal + ri.cgst_amount + ri.sgst_amount + ri.igst_amount)) <= 0.01
  and abs((ri.cgst_amount + ri.sgst_amount + ri.igst_amount) - round(ri.line_subtotal * ri.gst_percent / (100 + ri.gst_percent), 2)) <= 0.02
  and abs((ri.cgst_amount + ri.sgst_amount + ri.igst_amount) - round(ri.line_subtotal * ri.gst_percent / 100, 2)) > 0.02;
