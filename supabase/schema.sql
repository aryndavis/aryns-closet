-- Database and photo storage for Aryn's Closet.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Every row and every photo belongs to the signed-in user; Row Level Security means each user can only
-- see or change their own outfits, items, and photos.

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  photo_path text not null check (char_length(photo_path) <= 300),
  worn_on date not null default current_date,
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('top', 'jacket', 'bottom', 'dress', 'shoes', 'accessory')),
  name text not null default '' check (char_length(name) <= 120),
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9a-f]{6}$'),
  color_name text not null default '' check (char_length(color_name) <= 40),
  cutout_path text check (cutout_path is null or char_length(cutout_path) <= 300),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

-- Which pieces appear in which outfit photo.
create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (outfit_id, item_id)
);

create index if not exists outfits_owner_id_idx on public.outfits (owner_id);
create index if not exists items_owner_id_idx on public.items (owner_id);
create index if not exists outfit_items_owner_id_idx on public.outfit_items (owner_id);
create index if not exists outfit_items_item_id_idx on public.outfit_items (item_id);

alter table public.outfits enable row level security;
alter table public.items enable row level security;
alter table public.outfit_items enable row level security;

-- Signed-out visitors get nothing.
revoke all on public.outfits, public.items, public.outfit_items from anon;

drop policy if exists "Owners manage their outfits" on public.outfits;
create policy "Owners manage their outfits" on public.outfits
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and photo_path like (select auth.uid())::text || '/%');

drop policy if exists "Owners manage their items" on public.items;
create policy "Owners manage their items" on public.items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (cutout_path is null or cutout_path like (select auth.uid())::text || '/%'));

drop policy if exists "Owners manage their outfit tags" on public.outfit_items;
create policy "Owners manage their outfit tags" on public.outfit_items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.outfits o where o.id = outfit_id and o.owner_id = (select auth.uid()))
    and exists (select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid()))
  );

-- Private photo bucket: 10 MB max per file, images only. Files live under "<user id>/…".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('closet', 'closet', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners read their closet photos" on storage.objects;
create policy "Owners read their closet photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owners upload closet photos" on storage.objects;
create policy "Owners upload closet photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owners delete their closet photos" on storage.objects;
create policy "Owners delete their closet photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
