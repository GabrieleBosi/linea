-- Prototype-only policies. Spec section 12.4.
-- Row Level Security is on for every table. The browser uses the anon key:
--   transactional tables: select, insert, update.
--   reference tables and AI tables: select only.
-- The service role (Netlify functions and scripts) bypasses RLS and is the only
-- writer of ai_runs and ai_replay, and the only deleter (demo reset).

-- Reference tables: read only for anon.
alter table catalog_profiles enable row level security;
alter table catalog_materials enable row level security;
alter table feasibility_rules enable row level security;
alter table customers enable row level security;
alter table legacy_quotes enable row level security;

create policy "anon reads catalog_profiles" on catalog_profiles for select to anon using (true);
create policy "anon reads catalog_materials" on catalog_materials for select to anon using (true);
create policy "anon reads feasibility_rules" on feasibility_rules for select to anon using (true);
create policy "anon reads customers" on customers for select to anon using (true);
create policy "anon reads legacy_quotes" on legacy_quotes for select to anon using (true);

-- Transactional tables: anon reads, inserts and updates. No delete.
alter table requests enable row level security;
alter table lines enable row level security;
alter table quotations enable row level security;
alter table quotation_lines enable row level security;
alter table customer_responses enable row level security;
alter table feasibility_checks enable row level security;
alter table orders enable row level security;
alter table events enable row level security;

create policy "anon reads requests" on requests for select to anon using (true);
create policy "anon inserts requests" on requests for insert to anon with check (true);
create policy "anon updates requests" on requests for update to anon using (true) with check (true);

create policy "anon reads lines" on lines for select to anon using (true);
create policy "anon inserts lines" on lines for insert to anon with check (true);
create policy "anon updates lines" on lines for update to anon using (true) with check (true);

create policy "anon reads quotations" on quotations for select to anon using (true);
create policy "anon inserts quotations" on quotations for insert to anon with check (true);
create policy "anon updates quotations" on quotations for update to anon using (true) with check (true);

create policy "anon reads quotation_lines" on quotation_lines for select to anon using (true);
create policy "anon inserts quotation_lines" on quotation_lines for insert to anon with check (true);
create policy "anon updates quotation_lines" on quotation_lines for update to anon using (true) with check (true);

create policy "anon reads customer_responses" on customer_responses for select to anon using (true);
create policy "anon inserts customer_responses" on customer_responses for insert to anon with check (true);
create policy "anon updates customer_responses" on customer_responses for update to anon using (true) with check (true);

create policy "anon reads feasibility_checks" on feasibility_checks for select to anon using (true);
create policy "anon inserts feasibility_checks" on feasibility_checks for insert to anon with check (true);
create policy "anon updates feasibility_checks" on feasibility_checks for update to anon using (true) with check (true);

create policy "anon reads orders" on orders for select to anon using (true);
create policy "anon inserts orders" on orders for insert to anon with check (true);
create policy "anon updates orders" on orders for update to anon using (true) with check (true);

create policy "anon reads events" on events for select to anon using (true);
create policy "anon inserts events" on events for insert to anon with check (true);

-- AI tables: anon reads (trace drawer, design pages). Only the service role writes.
alter table ai_runs enable row level security;
alter table ai_replay enable row level security;

create policy "anon reads ai_runs" on ai_runs for select to anon using (true);
create policy "anon reads ai_replay" on ai_replay for select to anon using (true);
