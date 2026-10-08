-- Junk Poetry – Datenbank für junkpoetry.de
-- Lesen darf jede:r, schreiben nur Accounts, die in public.admins stehen.

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- keine Policies: über die API nicht les- oder schreibbar

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Konzerte ----------
create table if not exists public.concerts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time,
  city text not null,
  venue text not null default '',
  ticket_url text,
  status text not null default 'normal' check (status in ('normal', 'sold_out', 'free', 'tba')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists concerts_date_idx on public.concerts (date);

-- ---------- Releases (Hörprobe) ----------
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_url text,
  snippet_url text,
  snippet_start numeric not null default 0 check (snippet_start >= 0),
  snippet_length numeric not null default 12 check (snippet_length between 3 and 60),
  link_url text,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Plattform-Links ----------
create table if not exists public.platform_links (
  platform text primary key,
  label text not null,
  url text,
  visible boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Seiteneinstellungen (eine Zeile) ----------
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  hero_image_url text,
  instagram_url text,
  contact_email text,
  updated_at timestamptz not null default now()
);

-- ---------- Trigger ----------
do $$
declare t text;
begin
  foreach t in array array['concerts', 'releases', 'platform_links', 'site_settings'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['concerts', 'releases', 'platform_links', 'site_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read_all" on public.%I', t);
    execute format('drop policy if exists "admin_insert" on public.%I', t);
    execute format('drop policy if exists "admin_update" on public.%I', t);
    execute format('drop policy if exists "admin_delete" on public.%I', t);
    execute format('create policy "read_all" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin_insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admin_update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admin_delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- ---------- Storage: Fotos + Audio ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_admin_insert" on storage.objects;
drop policy if exists "media_admin_update" on storage.objects;
drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
create policy "media_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

-- ---------- Startinhalte ----------
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

insert into public.platform_links (platform, label, url, visible, sort_order) values
  ('spotify',      'Spotify',       'https://open.spotify.com/artist/5HGAjazeqE2p2roBVeAtCM',            true,  0),
  ('applemusic',   'Apple Music',   'https://music.apple.com/de/search?term=Katura%20Kollektiv',         true,  1),
  ('amazonmusic',  'Amazon Music',  'https://music.amazon.de/search/Katura%20Kollektiv',                  true,  2),
  ('tidal',        'Tidal',         'https://tidal.com/search?q=Katura%20Kollektiv',                      true,  3),
  ('deezer',       'Deezer',        'https://www.deezer.com/de/search/Katura%20Kollektiv',                true,  4),
  ('youtubemusic', 'YouTube Music', 'https://music.youtube.com/search?q=Katura%20Kollektiv',               true,  5),
  ('bandcamp',     'Bandcamp',      null,                                                                 false, 6),
  ('soundcloud',   'SoundCloud',    null,                                                                 false, 7)
on conflict (platform) do nothing;

insert into public.releases (title, snippet_url, snippet_start, snippet_length, link_url, is_featured, sort_order)
select 'Live Demo EP', 'assets/audio/platzhalter.mp3', 0, 12, 'https://open.spotify.com/album/70ShddcHZ79nznjIrz5NDt', true, 0
where not exists (select 1 from public.releases);
