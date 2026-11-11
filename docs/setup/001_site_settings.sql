-- ============================================================================
-- Tonaliteh — site settings (run once in Supabase Dashboard → SQL Editor).
-- Safe to re-run. Adds ONE new table; does not touch existing tables or policies.
--
-- Stores: teacher Instagram / phone, group contact, card/payment details and
-- the motivational quote. Every value starts EMPTY — nothing is invented.
-- Reads: any signed-in user. Writes: only profiles.role in ('teacher','manager').
-- ============================================================================

create table if not exists public.site_settings (
  key text primary key check (key ~ '^[a-z_]{1,64}$'),
  value text not null default '' check (char_length(value) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

grant select, insert, update on public.site_settings to authenticated;
grant all on public.site_settings to service_role;

alter table public.site_settings enable row level security;

-- SECURITY DEFINER so the policy can read the caller's role without RLS recursion.
create or replace function public.tonaliteh_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and lower(role) in ('teacher', 'manager')
  )
$$;
revoke execute on function public.tonaliteh_is_staff() from public, anon;
grant execute on function public.tonaliteh_is_staff() to authenticated;

drop policy if exists "Site settings readable by signed-in users" on public.site_settings;
create policy "Site settings readable by signed-in users"
  on public.site_settings for select to authenticated using (true);

drop policy if exists "Staff add site settings" on public.site_settings;
create policy "Staff add site settings"
  on public.site_settings for insert to authenticated
  with check (public.tonaliteh_is_staff());

drop policy if exists "Staff update site settings" on public.site_settings;
create policy "Staff update site settings"
  on public.site_settings for update to authenticated
  using (public.tonaliteh_is_staff())
  with check (public.tonaliteh_is_staff());

-- No DELETE policy: settings are cleared by saving an empty value.

insert into public.site_settings (key, value) values
  ('teacher_display_name', ''),
  ('teacher_instagram_url', ''),
  ('teacher_phone', ''),
  ('motivational_quote', ''),
  ('motivational_quote_author', ''),
  ('group_phone', ''),
  ('group_address', ''),
  ('payment_card_number', ''),
  ('payment_card_holder', ''),
  ('payment_bank_name', ''),
  ('payment_iban', ''),
  ('payment_notes', '')
on conflict (key) do nothing;
