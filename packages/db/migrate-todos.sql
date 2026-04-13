-- Migration: To-do list
-- Run this in your Supabase SQL editor or via psql.

create table if not exists todos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  title       text not null,
  description text,
  completed   boolean not null default false,
  due_date    text,
  priority    text not null default 'medium',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_todos_owner_id  on todos (owner_id);
create index if not exists idx_todos_completed on todos (completed);

-- Row Level Security
alter table todos enable row level security;

create policy "todos owner select" on todos for select using (owner_id = auth.uid());
create policy "todos owner insert" on todos for insert with check (owner_id = auth.uid());
create policy "todos owner update" on todos for update using (owner_id = auth.uid());
create policy "todos owner delete" on todos for delete using (owner_id = auth.uid());

grant select, insert, update, delete on todos to authenticated;
