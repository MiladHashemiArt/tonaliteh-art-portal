-- Date-specific class occurrences and auditable student reservations.
-- Additive only: recurring templates and attendance history are preserved.

create schema if not exists private;

create table if not exists public.class_session_occurrences (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  session_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  class_type text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  reservations_open boolean not null default true,
  capacity integer null check (capacity is null or capacity > 0),
  announcement text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_session_id, session_date),
  check (end_time > start_time),
  check (extract(isodow from session_date) = 4)
);

create table if not exists public.class_session_reservations (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.class_session_occurrences(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'reserved'
    check (status in ('reserved', 'cancelled')),
  reserved_at timestamptz not null default now(),
  cancelled_at timestamptz null
);

create unique index if not exists one_active_reservation_per_student_occurrence
  on public.class_session_reservations(occurrence_id, student_id)
  where status = 'reserved';

create index if not exists class_session_occurrences_date_idx
  on public.class_session_occurrences(session_date, status);
create index if not exists class_session_reservations_occurrence_status_idx
  on public.class_session_reservations(occurrence_id, status);

alter table public.class_session_occurrences enable row level security;
alter table public.class_session_reservations enable row level security;

drop policy if exists "Authenticated users read session occurrences" on public.class_session_occurrences;
create policy "Enrolled students and staff read occurrences"
  on public.class_session_occurrences for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.enrollments e
      where e.class_id = class_session_occurrences.class_session_id
        and e.student_id = (select auth.uid())
    )
  );

drop policy if exists "Staff manage session occurrences" on public.class_session_occurrences;
create policy "Staff insert occurrences"
  on public.class_session_occurrences for insert to authenticated
  with check (public.is_staff() and created_by = (select auth.uid()));
create policy "Staff update occurrences"
  on public.class_session_occurrences for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());
create policy "Staff delete occurrences"
  on public.class_session_occurrences for delete to authenticated
  using (public.is_staff());

drop policy if exists "Students read own reservations or staff" on public.class_session_reservations;
create policy "Students read own reservations or staff"
  on public.class_session_reservations for select to authenticated
  using (student_id = (select auth.uid()) or public.is_staff());

-- Reservations are written only through the checked RPCs below.
drop policy if exists "Students create own reservations for enrolled occurrences" on public.class_session_reservations;
drop policy if exists "Students cancel own reservations" on public.class_session_reservations;
drop policy if exists "Staff manage session reservations" on public.class_session_reservations;
create policy "Staff manage session reservations"
  on public.class_session_reservations for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create or replace function public.reserve_class_session_occurrence(p_occurrence_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_occurrence public.class_session_occurrences%rowtype;
  v_reservation_id uuid;
  v_active_count integer;
begin
  if v_user_id is null then
    raise exception 'برای رزرو باید وارد حساب شوید.' using errcode = '28000';
  end if;

  select * into v_occurrence
  from public.class_session_occurrences
  where id = p_occurrence_id
  for update;

  if not found then
    raise exception 'این جلسه پیدا نشد.' using errcode = 'P0002';
  end if;
  if v_occurrence.status <> 'scheduled'
     or not v_occurrence.reservations_open
     or v_occurrence.session_date < current_date then
    raise exception 'رزرو این جلسه در دسترس نیست.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.enrollments e
    where e.class_id = v_occurrence.class_session_id
      and e.student_id = v_user_id
  ) then
    raise exception 'ابتدا باید در کلاس مربوط ثبت‌نام کنید.' using errcode = '42501';
  end if;

  select count(*) into v_active_count
  from public.class_session_reservations r
  where r.occurrence_id = p_occurrence_id and r.status = 'reserved';

  if v_occurrence.capacity is not null and v_active_count >= v_occurrence.capacity then
    raise exception 'ظرفیت رزرو این جلسه تکمیل شده است.' using errcode = '23514';
  end if;

  insert into public.class_session_reservations (occurrence_id, student_id)
  values (p_occurrence_id, v_user_id)
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.cancel_class_session_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'برای لغو رزرو باید وارد حساب شوید.' using errcode = '28000';
  end if;

  update public.class_session_reservations
  set status = 'cancelled', cancelled_at = now()
  where id = p_reservation_id
    and student_id = v_user_id
    and status = 'reserved';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reserve_class_session_occurrence(uuid) from public, anon;
revoke all on function public.cancel_class_session_reservation(uuid) from public, anon;
grant execute on function public.reserve_class_session_occurrence(uuid) to authenticated;
grant execute on function public.cancel_class_session_reservation(uuid) to authenticated;

-- Trigger functions are private, pinned to an empty search_path, and not callable via the Data API.
create or replace function private.notify_students_about_session_occurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'INSERT' then
    v_title := 'جلسهٔ جدید قابل رزرو';
    v_body := 'جلسهٔ ' || new.class_type || ' در تاریخ ' || new.session_date ||
      ' ساعت ' || to_char(new.start_time, 'HH24:MI') || ' اعلام شد.';
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    v_title := 'لغو جلسه';
    v_body := 'جلسهٔ ' || new.class_type || ' در تاریخ ' || new.session_date || ' لغو شد.';
  elsif new.session_date is distinct from old.session_date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.announcement is distinct from old.announcement
     or new.reservations_open is distinct from old.reservations_open then
    v_title := 'به‌روزرسانی جلسه';
    v_body := 'جزئیات جلسهٔ ' || new.class_type || ' در تاریخ ' || new.session_date || ' تغییر کرد.';
  else
    return new;
  end if;

  insert into public.notifications (user_id, title, body, notification_type, related_id)
  select e.student_id, v_title,
    v_body || case when coalesce(new.announcement, '') <> '' then ' ' || new.announcement else '' end,
    'session_occurrence', new.id
  from public.enrollments e
  where e.class_id = new.class_session_id
  on conflict do nothing;

  return new;
end;
$$;

create or replace function private.notify_staff_about_session_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.class_session_occurrences%rowtype;
  v_student_name text;
begin
  select * into v_occurrence
  from public.class_session_occurrences where id = new.occurrence_id;
  select p.full_name into v_student_name
  from public.profiles p where p.id = new.student_id;

  insert into public.notifications (user_id, title, body, notification_type, related_id)
  select p.id,
    'رزرو جلسهٔ موردی جدید',
    coalesce(v_student_name, 'یک هنرجو') || ' برای جلسهٔ ' ||
      v_occurrence.class_type || ' در تاریخ ' || v_occurrence.session_date ||
      ' ساعت ' || to_char(v_occurrence.start_time, 'HH24:MI') || ' رزرو کرد.',
    'session_reservation', new.occurrence_id
  from public.profiles p
  where p.role in ('teacher', 'manager');

  return new;
end;
$$;

revoke all on function private.notify_students_about_session_occurrence() from public, anon, authenticated;
revoke all on function private.notify_staff_about_session_reservation() from public, anon, authenticated;

drop trigger if exists notify_students_about_session_occurrence on public.class_session_occurrences;
create trigger notify_students_about_session_occurrence
after insert or update on public.class_session_occurrences
for each row execute function private.notify_students_about_session_occurrence();

drop trigger if exists notify_staff_about_session_reservation on public.class_session_reservations;
create trigger notify_staff_about_session_reservation
after insert on public.class_session_reservations
for each row execute function private.notify_staff_about_session_reservation();

create or replace function private.touch_session_occurrence_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_session_occurrence_updated_at() from public, anon, authenticated;

drop trigger if exists touch_session_occurrence_updated_at on public.class_session_occurrences;
create trigger touch_session_occurrence_updated_at
before update on public.class_session_occurrences
for each row execute function private.touch_session_occurrence_updated_at();
