create extension if not exists pgcrypto;

create table leads (
  id uuid primary key default gen_random_uuid(),
  place_id text unique,
  slug text unique,
  business_name text not null,
  address text,
  phone text,
  website text,
  source text,
  review_summary text,
  places_photo_url text,
  raw jsonb not null default '{}'::jsonb,
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  customer_name text,
  customer_email text,
  phone text,
  status text not null default 'draft',
  payment_method text,
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) not null,
  slug text not null unique,
  template text not null,
  config jsonb not null default '{}'::jsonb,
  preview_url text,
  production_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table revisions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references sites(id) not null,
  request_text text not null,
  config_diff jsonb,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  stripe_event_id text unique,
  status text not null,
  amount_yen integer,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  order_id uuid references orders(id),
  site_id uuid references sites(id),
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  site_id uuid references sites(id),
  kind text not null,
  provider text not null,
  prompt text,
  output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table generation_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  site_id uuid references sites(id),
  step text not null,
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index leads_excluded_idx on leads(excluded);
create index orders_status_idx on orders(status);
create index sites_order_id_idx on sites(order_id);
create index revisions_site_id_idx on revisions(site_id);
create index payments_order_id_idx on payments(order_id);
create index events_name_created_at_idx on events(name, created_at);
create index ai_artifacts_order_id_idx on ai_artifacts(order_id);
create index generation_logs_order_id_idx on generation_logs(order_id);
