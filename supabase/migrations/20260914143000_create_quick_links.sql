-- DevilX Flow: Quick Links
-- Private workspace table. Not readable via the public/anon key.

create table if not exists public.quick_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quick_links_pinned_created_idx
  on public.quick_links (is_pinned desc, created_at desc);

create or replace function public.quick_links_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quick_links_set_updated_at on public.quick_links;

create trigger quick_links_set_updated_at
before update on public.quick_links
for each row
execute procedure public.quick_links_set_updated_at();

alter table public.quick_links enable row level security;
alter table public.quick_links force row level security;

revoke all on table public.quick_links from public;
revoke all on table public.quick_links from anon;

grant select, insert, update, delete on table public.quick_links to authenticated;
grant all on table public.quick_links to service_role;

drop policy if exists "quick_links_authenticated_select" on public.quick_links;
drop policy if exists "quick_links_authenticated_insert" on public.quick_links;
drop policy if exists "quick_links_authenticated_update" on public.quick_links;
drop policy if exists "quick_links_authenticated_delete" on public.quick_links;

-- Dashboard users signed in with Supabase Auth can manage their workspace links.
-- The anon/publishable key cannot read or write this table.
-- App CRUD goes through /api/quick-links using SUPABASE_SERVICE_ROLE_KEY
-- (same privileged server pattern as Razorpay webhooks).

create policy "quick_links_authenticated_select"
on public.quick_links
for select
to authenticated
using (true);

create policy "quick_links_authenticated_insert"
on public.quick_links
for insert
to authenticated
with check (true);

create policy "quick_links_authenticated_update"
on public.quick_links
for update
to authenticated
using (true)
with check (true);

create policy "quick_links_authenticated_delete"
on public.quick_links
for delete
to authenticated
using (true);
