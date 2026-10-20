-- Public, read-only closet. Run once after schema.sql:
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run. It's safe to run again.
--
-- Anyone can browse the owner's lookbook, closet and photos. Only the owner, signed in, can add,
-- edit or delete. Visitors get read access only; uploads and deletes stay owner-only.

-- Whose closet is public. Exactly one row.
create table if not exists public.site_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users (id) on delete cascade
);
alter table public.site_owner enable row level security;
revoke all on public.site_owner from anon, authenticated;

-- The owner is the project's only user. If there's ever more than one, set it by email instead:
--   insert into public.site_owner (user_id) select id from auth.users where email = 'you@example.com'
--   on conflict (singleton) do update set user_id = excluded.user_id;
do $$
begin
  if not exists (select 1 from public.site_owner) then
    if (select count(*) from auth.users) <> 1 then
      raise exception 'Expected exactly one user. Set the owner by email (see the comment above).';
    end if;
    insert into public.site_owner (user_id) select id from auth.users;
  end if;
end $$;

create or replace function public.site_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select user_id from public.site_owner where singleton $$;
revoke all on function public.site_owner_id() from public;
grant execute on function public.site_owner_id() to anon, authenticated;

-- Visitors can read the owner's outfits, items and tags (reads only).
grant select on public.outfits, public.items, public.outfit_items to anon;

drop policy if exists "Anyone can view the owner's outfits" on public.outfits;
create policy "Anyone can view the owner's outfits" on public.outfits
  for select to anon, authenticated
  using (owner_id = (select public.site_owner_id()));

drop policy if exists "Anyone can view the owner's items" on public.items;
create policy "Anyone can view the owner's items" on public.items
  for select to anon, authenticated
  using (owner_id = (select public.site_owner_id()));

drop policy if exists "Anyone can view the owner's outfit tags" on public.outfit_items;
create policy "Anyone can view the owner's outfit tags" on public.outfit_items
  for select to anon, authenticated
  using (owner_id = (select public.site_owner_id()));

-- Visitors can view (sign links for) photos in the owner's folder. The bucket stays private:
-- photos are only reachable through short-lived signed links, never a permanent public URL.
drop policy if exists "Anyone can view the owner's closet photos" on storage.objects;
create policy "Anyone can view the owner's closet photos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select public.site_owner_id())::text);
