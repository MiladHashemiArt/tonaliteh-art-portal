-- ============================================================================
-- OPTIONAL hardening — blocks role changes coming from the app.
-- Run only after reviewing your existing "update own profile" policy.
-- Requests from the app (JWT role 'authenticated' / 'anon') cannot change
-- profiles.role or insert a non-student role. Dashboard / SQL Editor are unaffected,
-- so staff promotion keeps working there.
-- ============================================================================

create or replace function public.tonaliteh_guard_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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
