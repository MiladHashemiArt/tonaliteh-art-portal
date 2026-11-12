-- ============================================================================
-- Tonaliteh — private national ID (run once in Supabase Dashboard → SQL Editor).
-- Review before running. Safe to re-run. Does not delete data or drop policies.
--
-- Why: profiles has no national_id column yet. Row-level security cannot hide
-- one column, and staff can already read student profiles. So the column is
-- added WITHOUT any Data API read/write grant; each user reads and writes only
-- their own value through two functions. Teachers, managers and other students
-- cannot read it from the app.
--
-- The app already reads profiles with an explicit column list, so the
-- column-level grants below keep every existing screen working.
-- ============================================================================

alter table public.profiles add column if not exists national_id text;

-- Reads: every existing column except national_id.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, phone, role, created_at, home_address) on public.profiles to authenticated;

-- Writes from the app: only the self-editable contact fields (this also blocks role changes).
-- Your existing "update own profile" / staff policies keep deciding WHICH rows may change.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, home_address) on public.profiles to authenticated;

create or replace function public.get_my_national_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select national_id from public.profiles where id = auth.uid()
$$;

create or replace function public.set_my_national_id(_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if _value !~ '^[0-9]{10}$' then
    raise exception 'national id must be 10 digits';
  end if;
  update public.profiles set national_id = _value where id = auth.uid();
end;
$$;

revoke execute on function public.get_my_national_id() from public, anon;
revoke execute on function public.set_my_national_id(text) from public, anon;
grant execute on function public.get_my_national_id() to authenticated;
grant execute on function public.set_my_national_id(text) to authenticated;

-- ============================================================================
-- CHECK ONLY (no changes): confirm the policies the new pages rely on exist.
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename in ('announcements', 'notifications', 'profiles');
-- Expected:
--   announcements: SELECT for authenticated; INSERT/UPDATE/DELETE for teacher/manager only.
--   notifications: SELECT and UPDATE where user_id = auth.uid().
--   profiles:      UPDATE own row (id = auth.uid()).
-- If notifications has no own-row UPDATE policy, "mark as read" shows a
-- permission message. Owner-side fix (own rows only):
--   grant update (read_at) on public.notifications to authenticated;
--   create policy "Users mark own notifications read" on public.notifications
--     for update to authenticated
--     using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ============================================================================
