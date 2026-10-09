-- Linea schema. Spec section 2.1.
-- Every state column is written only through applyEvent() in src/domain via the services.

create extension if not exists pgcrypto;

-- Enums -----------------------------------------------------------------------

create type product_family as enum ('HEA', 'HEB', 'IPE');
create type material_grade as enum ('S235', 'S355', 'S460');
create type commercial_status as enum ('draft', 'quoted', 'negotiating', 'agreed', 'declined', 'withdrawn', 'superseded');
create type technical_status as enum ('not_required', 'pending', 'feasible', 'not_feasible');
create type request_status as enum ('open', 'on_hold', 'rejected', 'converted');
create type quotation_status as enum ('draft', 'sent', 'superseded');
create type check_status as enum ('pending', 'feasible', 'not_feasible', 'waived');

-- Reference data ------------------------------------------------------------------

create table catalog_profiles (
  family product_family not null,
  size integer not null,
  kg_per_m numeric(8, 2) not null,
  primary key (family, size)
);

create table catalog_materials (
  grade material_grade primary key,
  eur_per_kg_base numeric(8, 4) not null
);

create table feasibility_rules (
  id text primary key,
  family product_family,
  size_min integer,
  size_max integer,
  material material_grade,
  max_length_mm integer,
  min_quantity integer,
  not_offered boolean not null default false,
  note text not null
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  segment text not null default '',
  country text not null default '',
  created_at timestamptz not null default now()
);

create table legacy_quotes (
  quote_id text primary key,
  quote_date date not null,
  customer text not null,
  product text not null,
  material text not null,
  quantity integer not null,
  production_cost numeric(12, 2) not null,
  quoted_price numeric(12, 2) not null,
  margin numeric(6, 4) not null,
  outcome text not null check (outcome in ('WON', 'LOST')),
  revision integer not null,
  source text not null check (source in ('given', 'generated'))
);

create index legacy_quotes_customer_idx on legacy_quotes (customer);
create index legacy_quotes_product_idx on legacy_quotes (product, material);

-- Transactional data ------------------------------------------------------------

create table requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  customer_id uuid not null references customers (id),
  title text not null default '',
  source_text text not null default '',
  open_questions jsonb not null default '[]'::jsonb,
  stated_date date,
  requested_delivery_date date,
  delivery_hint text,
  status request_status not null default 'open',
  hold_reason text,
  owner text not null default '',
  received_at timestamptz not null default now(),
  order_id uuid,
  created_at timestamptz not null default now()
);

create index requests_received_at_idx on requests (received_at desc);

create table quotations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  revision_no integer not null,
  status quotation_status not null default 'draft',
  valid_until date,
  cover_text text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, revision_no)
);

create table lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  line_no integer not null,
  family product_family not null,
  size integer not null,
  material material_grade not null,
  length_mm integer not null,
  quantity integer not null,
  notes text not null default '',
  commercial_status commercial_status not null default 'draft',
  technical_status technical_status not null default 'not_required',
  alternative_of_line_id uuid references lines (id),
  cost_estimate numeric(12, 2),
  unit_price numeric(12, 2),
  reference_ids text[] not null default '{}',
  agreed_in_quotation_id uuid references quotations (id),
  created_at timestamptz not null default now(),
  unique (request_id, line_no)
);

create index lines_request_idx on lines (request_id);

create table quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations (id) on delete cascade,
  line_id uuid not null references lines (id) on delete cascade,
  line_no integer not null,
  family product_family not null,
  size integer not null,
  material material_grade not null,
  length_mm integer not null,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  total_price numeric(12, 2) not null,
  cost_estimate numeric(12, 2) not null,
  margin numeric(6, 4) not null,
  price_memo text,
  reference_ids text[] not null default '{}',
  subject_to_feasibility boolean not null default false,
  created_at timestamptz not null default now(),
  unique (quotation_id, line_id)
);

create table customer_responses (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations (id) on delete cascade,
  raw_text text not null,
  interpretation jsonb,
  approved_by text,
  approved_at timestamptz,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

create table feasibility_checks (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines (id) on delete cascade,
  status check_status not null default 'pending',
  requested_by text not null,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  notes text,
  rule_hits jsonb not null default '[]'::jsonb,
  alternative jsonb,
  created_at timestamptz not null default now()
);

create index feasibility_checks_status_idx on feasibility_checks (status, requested_at);

create table orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests (id) on delete cascade,
  order_ref text not null unique,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table requests
  add constraint requests_order_id_fkey foreign key (order_id) references orders (id) on delete set null;

create table events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  line_id uuid references lines (id) on delete cascade,
  actor_role text not null check (actor_role in ('sales', 'ops', 'customer', 'system')),
  actor_name text not null default '',
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_request_idx on events (request_id, created_at desc);

-- AI traces and replay cache ----------------------------------------------------

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  step text not null,
  mode text not null check (mode in ('live', 'replay', 'revised')),
  model text not null,
  request_id uuid,
  line_id uuid,
  input jsonb not null,
  raw_output text,
  output jsonb,
  checks jsonb not null default '[]'::jsonb,
  latency_ms integer not null,
  tokens_in integer,
  tokens_out integer,
  accepted boolean,
  edited boolean,
  created_at timestamptz not null default now()
);

create index ai_runs_step_idx on ai_runs (step, created_at desc);

create table ai_replay (
  step text not null,
  input_hash text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  primary key (step, input_hash)
);
