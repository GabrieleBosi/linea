-- Phase 4, P1 step price_memo. The memo Sales keeps on a line, copied into the quotation line
-- snapshot at send time (spec 2.1 QuotationLine.price_memo). Nullable: most lines have none.
alter table public.lines add column if not exists price_memo text;
