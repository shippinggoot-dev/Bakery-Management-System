-- Migration: Shopify integration settings
-- Run this in your Supabase SQL editor or via psql.

create table if not exists shopify_settings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null unique,
  shop_domain   text not null,
  access_token  text not null,
  shop_name     text,
  shop_email    text,
  is_connected  boolean not null default false,
  sync_products boolean not null default true,
  sync_orders   boolean not null default false,
  last_sync_at             timestamptz,
  last_customer_import_at  timestamptz,
  last_order_import_at     timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Row Level Security: each owner can only see and modify their own row
alter table shopify_settings enable row level security;

create policy "shopify_settings owner select"
  on shopify_settings for select
  using (owner_id = auth.uid());

create policy "shopify_settings owner insert"
  on shopify_settings for insert
  with check (owner_id = auth.uid());

create policy "shopify_settings owner update"
  on shopify_settings for update
  using (owner_id = auth.uid());

create policy "shopify_settings owner delete"
  on shopify_settings for delete
  using (owner_id = auth.uid());

grant select, insert, update, delete on shopify_settings to authenticated;

-- If the table already exists from a previous migration, add the new columns:
alter table shopify_settings
  add column if not exists last_customer_import_at timestamptz,
  add column if not exists last_order_import_at     timestamptz;
