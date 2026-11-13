-- ============================================================================
-- Tonaliteh — notify teacher and manager when a new STUDENT profile is created.
-- Run in Supabase Dashboard → SQL Editor, AFTER reviewing step 0.
-- Adds one function, one trigger and one partial unique index. Does not change
-- or delete any existing row, table, policy or RLS setting. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) CHECK FIRST (read-only). Run these and read the results before step 1.
-- ---------------------------------------------------------------------------
-- a) Existing triggers on profiles — if one already notifies staff about new
--    students, DO NOT run step 1 (you would get two notifications per signup).
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- b) What handle_new_user() writes (role / full_name):
--   select pg_get_functiondef('public.handle_new_user'::regproc);
--
-- c) notifications.related_id type — must be uuid or text, because it stores
--    the new student's profile id. If it is integer/bigint, tell the developer.
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'notifications';
--
-- d) Who will receive the notifications (role values only, no personal data):
--   select lower(trim(role)) as role, count(*) from public.profiles group by 1;

-- ---------------------------------------------------------------------------
-- 1) One notification per staff member per new student, never twice.
-- ---------------------------------------------------------------------------
create unique index if not exists notifications_new_student_once
  on public.notifications (user_id, related_id)
  where notification_type = 'new_student';

create or replace function public.tonaliteh_notify_staff_new_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Only student profiles (empty role counts as student, as in the app). Staff profiles: nothing.
  if lower(coalesce(nullif(trim(new.role), ''), 'student')) <> 'student' then
    return new;
  end if;

  v_name := nullif(trim(new.full_name), '');
  if v_name is null then
    select nullif(trim(u.raw_user_meta_data ->> 'full_name'), '') into v_name
    from auth.users u where u.id = new.id;
  end if;

  begin
    insert into public.notifications (user_id, title, body, notification_type, related_id)
    select p.id,
           'ثبت‌نام هنرجوی جدید',
           coalesce(v_name, 'یک هنرجوی جدید') || ' در تنالیته ثبت‌نام کرد.',
           'new_student',
           new.id
    from public.profiles p
    where lower(trim(p.role)) in ('teacher', 'manager', 'admin', 'management', 'استاد', 'مدیر', 'مدیریت')
      and p.id <> new.id
    on conflict do nothing;
  exception when others then
    -- A notification problem must never block a student's sign-up.
    raise warning 'tonaliteh: new-student notification skipped: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.tonaliteh_notify_staff_new_student() from public, anon, authenticated;

drop trigger if exists tonaliteh_notify_staff_new_student on public.profiles;
create trigger tonaliteh_notify_staff_new_student
  after insert on public.profiles
  for each row execute function public.tonaliteh_notify_staff_new_student();

-- ---------------------------------------------------------------------------
-- 2) VERIFY after the next real student sign-up (read-only):
--   select n.user_id, p.role, n.title, n.body, n.created_at
--   from public.notifications n join public.profiles p on p.id = n.user_id
--   where n.notification_type = 'new_student' order by n.created_at desc limit 10;
--
-- UNDO (removes only what this file added):
--   drop trigger if exists tonaliteh_notify_staff_new_student on public.profiles;
--   drop function if exists public.tonaliteh_notify_staff_new_student();
--   drop index if exists public.notifications_new_student_once;
-- ============================================================================
