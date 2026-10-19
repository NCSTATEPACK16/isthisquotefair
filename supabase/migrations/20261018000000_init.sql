-- IsThisQuoteFair — initial schema (PRD §9).
-- Principles: no vendor names, no images, no PII columns. RLS on every table.
-- Edge functions use the service_role key, which bypasses RLS; anon/authenticated get only
-- what the policies below allow (default deny).

-- ───────────────────────── enums ─────────────────────────
create type public.service_category as enum ('auto', 'hvac', 'plumbing', 'electrical', 'vet', 'telecom');
create type public.service_unit     as enum ('job', 'hour', 'each', 'month');
create type public.confidence_level as enum ('low', 'medium', 'high');
create type public.check_outcome    as enum ('success', 'insufficient_data', 'extract_failed', 'validation_blocked', 'error');
create type public.subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'incomplete');
create type public.invoice_total_bucket as enum ('lt_100', '100_249', '250_499', '500_999', '1000_2499', '2500_4999', 'gte_5000');

-- ───────────────────────── taxonomy_keys ─────────────────────────
-- Seeded from /taxonomy/*.yaml via supabase/seed.sql (pnpm taxonomy:build).
create table public.taxonomy_keys (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$'),
  category   public.service_category not null,
  label      text not null,
  unit       public.service_unit not null,
  check (split_part(key, '.', 1) = category::text)
);
alter table public.taxonomy_keys enable row level security;
-- Non-sensitive reference data: readable by the app.
create policy taxonomy_keys_read on public.taxonomy_keys for select to anon, authenticated using (true);

-- ───────────────────────── price_benchmarks ─────────────────────────
-- One row per grounding run (key + county). Cache hit = newest row with expires_at > now().
create table public.price_benchmarks (
  id           bigint generated always as identity primary key,
  key          text not null references public.taxonomy_keys(key) on update cascade,
  county_fips  char(5) not null check (county_fips ~ '^\d{5}$'),
  low          numeric(10,2) not null check (low > 0),
  typical      numeric(10,2) not null,
  high         numeric(10,2) not null,
  -- [{ "url": "...", "low": n, "typical": n, "high": n }, ...]
  source_urls  jsonb not null check (jsonb_typeof(source_urls) = 'array' and jsonb_array_length(source_urls) > 0),
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  check (low <= typical and typical <= high),
  check (expires_at > fetched_at)
);
create index price_benchmarks_lookup on public.price_benchmarks (key, county_fips, expires_at desc);
alter table public.price_benchmarks enable row level security;
-- No policies: service role only.

-- ───────────────────────── contributed_items ─────────────────────────
-- Opt-in, anonymized line items. Deliberately no user/session/vendor/check link (§9 Deletion).
create table public.contributed_items (
  id                    bigint generated always as identity primary key,
  key                   text not null references public.taxonomy_keys(key) on update cascade,
  county_fips           char(5) not null check (county_fips ~ '^\d{5}$'),
  zip5                  char(5) check (zip5 ~ '^\d{5}$'),
  service_month         date not null check (extract(day from service_month) = 1),
  unit_price            numeric(10,2) not null check (unit_price >= 0),
  qty                   numeric(10,3) not null default 1 check (qty > 0),
  labor_hours           numeric(6,2) check (labor_hours >= 0),
  labor_rate            numeric(8,2) check (labor_rate >= 0),
  line_total            numeric(10,2) not null,
  invoice_total_bucket  public.invoice_total_bucket,
  -- Day precision only, so arrival order can't be joined to check_events timestamps.
  contributed_at        date not null default current_date
);
create index contributed_items_lookup on public.contributed_items (key, county_fips, service_month desc);
alter table public.contributed_items enable row level security;
-- No policies: service role only. Public aggregates (Phase 3) will go through a view/RPC with n ≥ 10.

-- ───────────────────────── check_events ─────────────────────────
-- Operational row for every check, opt-in or not (§9, open decision §15.2). No prices, no items.
create table public.check_events (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  category       public.service_category,
  county_fips    char(5) check (county_fips ~ '^\d{5}$'),
  model          text not null,
  input_tokens   integer not null default 0 check (input_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  searches       integer not null default 0 check (searches >= 0),
  cost_usd       numeric(10,5) not null default 0 check (cost_usd >= 0),
  latency_ms     integer not null default 0 check (latency_ms >= 0),
  outcome        public.check_outcome not null,
  confidence     public.confidence_level,
  used_fallback  boolean not null default false,
  opted_in       boolean not null default false
);
create index check_events_created_at on public.check_events (created_at desc);
alter table public.check_events enable row level security;
-- No policies: service role only.

-- ───────────────────────── check_tokens ─────────────────────────
-- Paid single checks / packs. The client holds the raw token; we store only its SHA-256.
create table public.check_tokens (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         bytea not null unique check (octet_length(token_hash) = 32),
  stripe_session_id  text not null unique,
  credits_remaining  smallint not null check (credits_remaining >= 0),
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);
alter table public.check_tokens enable row level security;
-- No policies: service role only.

-- Atomically spends one credit. Returns true if a credit was available. Service role only.
create function public.consume_check_credit(p_token_hash bytea)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with spent as (
    update public.check_tokens
       set credits_remaining = credits_remaining - 1
     where token_hash = p_token_hash
       and credits_remaining > 0
       and expires_at > now()
    returning 1
  )
  select exists (select 1 from spent);
$$;
revoke all on function public.consume_check_credit(bytea) from public, anon, authenticated;

-- ───────────────────────── subscribers ─────────────────────────
create table public.subscribers (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id  text not null unique,
  status              public.subscription_status not null,
  period_end          timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.subscribers enable row level security;
create policy subscribers_read_own on public.subscribers for select to authenticated
  using ((select auth.uid()) = user_id);
-- Writes: stripe-webhook (service role) only.

-- ───────────────────────── saved_checks ─────────────────────────
-- Monthly-plan history. `result` is the validated verdict JSON (no vendor, no PII, no image).
create table public.saved_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  result      jsonb not null check (jsonb_typeof(result) = 'object')
);
create index saved_checks_user on public.saved_checks (user_id, created_at desc);
alter table public.saved_checks enable row level security;
create policy saved_checks_read_own on public.saved_checks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy saved_checks_delete_own on public.saved_checks for delete to authenticated
  using ((select auth.uid()) = user_id);
-- Inserts: pipeline (service role) after validation.

-- Belt and braces: no table-level grants beyond what policies need.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.taxonomy_keys to anon, authenticated;
grant select on public.subscribers to authenticated;
grant select, delete on public.saved_checks to authenticated;
