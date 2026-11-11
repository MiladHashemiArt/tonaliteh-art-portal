-- ============================================================================
-- Tonaliteh — one-time setup (run once in Supabase Dashboard → SQL Editor).
-- Safe to re-run. Does NOT drop tables or weaken existing RLS policies.
--
-- 1. Adds a private, nullable profiles.national_id column.
--    Column privileges hide it from every normal read; the student reads/writes
--    their own value, and only managers can read a student's value, through
--    the functions below.
-- 2. Stops the app from changing profiles.role (no self-promotion, no client
--    role changer). Roles change only from the Dashboard / SQL Editor.
-- 3. Adds public.app_settings (contact, payment details, motivational quote)
--    with RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. national_id (private)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists national_id text;

-- Replace table-wide SELECT/UPDATE with column lists that exclude national_id.
-- (RLS still decides WHICH rows each user can see/update; this decides WHICH columns.)
revoke select, update on public.profiles from anon, authenticated;
grant select (id, full_name, phone, role, created_at, home_address)
  on public.profiles to authenticated;
-- role and national_id are intentionally NOT updatable from the app.
grant update (full_name, phone, home_address) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Role helper used by the policies/functions below (SECURITY DEFINER avoids RLS recursion).
create or replace function public.tonaliteh_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(role, 'student')) from public.profiles where id = auth.uid()
$$;
revoke execute on function public.tonaliteh_my_role() from public, anon;
grant execute on function public.tonaliteh_my_role() to authenticated;

create or replace function public.get_my_national_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select national_id from public.profiles where id = auth.uid()
$$;

create or replace function public.set_my_national_id(_national_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(_national_id, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v is not null and v !~ '^[0-9]{10}$' then
    raise exception 'national id must be 10 digits';
  end if;
  update public.profiles set national_id = v where id = auth.uid();
end;
$$;

create or replace function public.get_student_national_id(_student_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.tonaliteh_my_role() not in ('manager', 'admin') then
    raise exception 'only management can view national id';
  end if;
  return (select national_id from public.profiles where id = _student_id);
end;
$$;

revoke execute on function public.get_my_national_id() from public, anon;
revoke execute on function public.set_my_national_id(text) from public, anon;
revoke execute on function public.get_student_national_id(uuid) from public, anon;
grant execute on function public.get_my_national_id() to authenticated;
grant execute on function public.set_my_national_id(text) to authenticated;
grant execute on function public.get_student_national_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Role guard (defense in depth on top of the column grants above)
-- ---------------------------------------------------------------------------
create or replace function public.tonaliteh_guard_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Requests from the app carry the 'authenticated' / 'anon' JWT role.
  -- Dashboard / SQL Editor / service role are unaffected.
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and lower(coalesce(new.role, 'student')) <> 'student' then
      raise exception 'public sign-up cannot choose a staff role';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'role changes are not allowed from the app';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tonaliteh_guard_profile_role on public.profiles;
create trigger tonaliteh_guard_profile_role
  before insert or update on public.profiles
  for each row execute function public.tonaliteh_guard_profile_role();

-- ---------------------------------------------------------------------------
-- 3. app_settings
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key check (key ~ '^[a-z_]{1,64}$'),
  value text not null default '' check (char_length(value) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

alter table public.app_settings enable row level security;

drop policy if exists "Settings readable by signed-in users" on public.app_settings;
create policy "Settings readable by signed-in users"
  on public.app_settings for select to authenticated using (true);

drop policy if exists "Quote readable on welcome page" on public.app_settings;
create policy "Quote readable on welcome page"
  on public.app_settings for select to anon
  using (key in ('motivational_quote', 'motivational_quote_author'));

drop policy if exists "Teachers edit contact and quote" on public.app_settings;
create policy "Teachers edit contact and quote"
  on public.app_settings for update to authenticated
  using (public.tonaliteh_my_role() = 'teacher' and key in (
    'teacher_display_name', 'teacher_instagram_url', 'teacher_phone',
    'motivational_quote', 'motivational_quote_author'))
  with check (public.tonaliteh_my_role() = 'teacher' and key in (
    'teacher_display_name', 'teacher_instagram_url', 'teacher_phone',
    'motivational_quote', 'motivational_quote_author'));

drop policy if exists "Teachers add contact and quote" on public.app_settings;
create policy "Teachers add contact and quote"
  on public.app_settings for insert to authenticated
  with check (public.tonaliteh_my_role() = 'teacher' and key in (
    'teacher_display_name', 'teacher_instagram_url', 'teacher_phone',
    'motivational_quote', 'motivational_quote_author'));

drop policy if exists "Managers edit all settings" on public.app_settings;
create policy "Managers edit all settings"
  on public.app_settings for update to authenticated
  using (public.tonaliteh_my_role() in ('manager', 'admin'))
  with check (public.tonaliteh_my_role() in ('manager', 'admin'));

drop policy if exists "Managers add settings" on public.app_settings;
create policy "Managers add settings"
  on public.app_settings for insert to authenticated
  with check (public.tonaliteh_my_role() in ('manager', 'admin'));

-- Empty rows so edits are plain updates. No real values are invented here.
insert into public.app_settings (key, value) values
  ('teacher_display_name', 'محمد فرزانه'),
  ('teacher_instagram_url', ''),
  ('teacher_phone', ''),
  ('motivational_quote', 'هنر، دیدنِ آن چیزی است که دیگران از کنارش می‌گذرند.'),
  ('motivational_quote_author', ''),
  ('group_phone', ''),
  ('group_address', ''),
  ('payment_card_number', ''),
  ('payment_card_holder', ''),
  ('payment_bank_name', ''),
  ('payment_iban', ''),
  ('payment_notes', '')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Check afterwards (read-only):
--   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
-- ============================================================================
