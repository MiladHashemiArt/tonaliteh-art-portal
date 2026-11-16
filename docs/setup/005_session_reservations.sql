-- ============================================================================
-- Tonaliteh — safe reservations for published class sessions. REVIEW STEP 0 FIRST.
-- Adds two narrowly scoped RPC functions. Uses existing constraints, triggers and RLS.
-- Changes no rows or policies. Status words: 'booked' (active) and 'cancelled'.
-- ============================================================================

-- 0) CHECK FIRST (read-only)
-- a) Allowed status values / existing constraints (tell the developer if they differ):
--   select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid in ('public.class_session_reservations'::regclass,
--                      'public.class_session_occurrences'::regclass,
--                      'public.attendance_adjustments'::regclass);
-- b) Current policies and triggers:
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--   where tablename in ('class_session_occurrences','class_session_reservations','attendance_adjustments');
--   select tgrelid::regclass, tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid in ('public.class_session_reservations'::regclass,'public.class_session_occurrences'::regclass)
--     and not tgisinternal;
-- c) Duplicate active reservations (must be empty before step 1):
--   select occurrence_id, student_id, count(*) from public.class_session_reservations
--   where status = 'booked' group by 1,2 having count(*) > 1;

-- 1) The live database already has UNIQUE (occurrence_id, student_id),
--    status CHECK ('booked','cancelled'), and sync/attendance triggers.
--    Re-booking updates the existing cancelled row. No extra index or trigger needed.

-- 2) Reserve: locks the session row so two requests can never exceed capacity.
create or replace function public.tonaliteh_reserve_occurrence(_occurrence_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_occ public.class_session_occurrences%rowtype;
  v_taken int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'برای رزرو ابتدا وارد شوید.'; end if;
  select * into v_occ from public.class_session_occurrences where id = _occurrence_id for update;
  if not found then raise exception 'این جلسه پیدا نشد.'; end if;
  if v_occ.is_cancelled then raise exception 'این جلسه لغو شده است.'; end if;
  if v_occ.published_at is null or not coalesce(v_occ.is_open, false) then
    raise exception 'رزرو این جلسه باز نیست.'; end if;
  if v_occ.session_date < (now() at time zone 'Asia/Tehran')::date then
    raise exception 'تاریخ این جلسه گذشته است.'; end if;
  -- SECURITY DEFINER bypasses RLS: enforce the same enrollment rule in the function.
  if not exists (
    select 1 from public.enrollments e
    where e.class_id = v_occ.class_session_id and e.student_id = v_uid
  ) then
    raise exception 'برای رزرو این جلسه باید ابتدا در کلاس مربوطه ثبت‌نام کرده باشید.';
  end if;
  select count(*) into v_taken from public.class_session_reservations
   where occurrence_id = _occurrence_id and student_id <> v_uid
     and status = 'booked';
  if v_occ.capacity is not null and v_taken >= v_occ.capacity then
    raise exception 'ظرفیت این جلسه تکمیل شده است.'; end if;
  -- The live status CHECK allows only 'booked' and 'cancelled'.
  update public.class_session_reservations set status = 'booked', updated_at = now()
   where occurrence_id = _occurrence_id and student_id = v_uid returning id into v_id;
  if v_id is null then
    insert into public.class_session_reservations (occurrence_id, student_id, status)
    values (_occurrence_id, v_uid, 'booked') returning id into v_id;
  end if;
  -- Existing sync_class_session_booked_count trigger maintains booked_count.
  return v_id;
end $$;

-- 3) Cancel own reservation (until the day of the session).
create or replace function public.tonaliteh_cancel_reservation(_occurrence_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_occ public.class_session_occurrences%rowtype;
begin
  if v_uid is null then raise exception 'ابتدا وارد شوید.'; end if;
  select * into v_occ from public.class_session_occurrences where id = _occurrence_id for update;
  if not found then raise exception 'این جلسه پیدا نشد.'; end if;
  if v_occ.session_date < (now() at time zone 'Asia/Tehran')::date then
    raise exception 'لغو رزرو برای جلسهٔ گذشته ممکن نیست.'; end if;
  update public.class_session_reservations set status = 'cancelled', updated_at = now()
   where occurrence_id = _occurrence_id and student_id = v_uid;
  -- Existing sync_class_session_booked_count trigger maintains booked_count.
end $$;

revoke execute on function public.tonaliteh_reserve_occurrence(uuid) from public, anon;
revoke execute on function public.tonaliteh_cancel_reservation(uuid) from public, anon;
grant execute on function public.tonaliteh_reserve_occurrence(uuid) to authenticated;
grant execute on function public.tonaliteh_cancel_reservation(uuid) to authenticated;

-- UNDO:
--   drop function if exists public.tonaliteh_reserve_occurrence(uuid);
--   drop function if exists public.tonaliteh_cancel_reservation(uuid);
--   -- The existing UNIQUE (occurrence_id, student_id) constraint is retained.
-- ============================================================================
