-- Genuinely attach the tooth chart directly to a treatment plan, so
-- the printed quotation given to the patient can show visually which
-- teeth are being treated, not just a text list.
alter table treatment_plans add column if not exists dental_chart jsonb;
