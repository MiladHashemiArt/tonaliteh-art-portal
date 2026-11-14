-- Date-specific class occurrences and student reservations.
-- This migration is intentionally additive: recurring class templates and attendance history remain untouched.

create table if not exists public.class_session_occurrences (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  session_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  class_type text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  reservations_open boolean not null default true,
  capacity integer null check (capacity is null or capacity > 0),
  announcement text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_session_id, session_date),
  check (end_time > start_time)
);

create table if not exists public.class_session_reservations (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.class_session_occurrences(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved', 'cancelled')),
  reserved_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  unique (occurrence_id, student_id)
);

create index if not exists class_session_occurrences_date_idx
  on public.class_session_occurrences(session_date, status);
create index if not exists class_session_reservations_occurrence_status_idx
  on public.class_session_reservations(occurrence_id, status);

alter table public.class_session_occurrences enable row level security;
alter table public.class_session_reservations enable row level security;

create policy "Authenticated users read session occurrences"
  on public.class_session_occurrences for select to authenticated using (true);
create policy "Staff manage session occurrences"
  on public.class_session_occurrences for all to authenticated
  using (public.is_staff())
  with check (public.is_staff() and created_by = (select auth.uid()));

create policy "Students read own reservations or staff"
  on public.class_session_reservations for select to authenticated
  using (student_id = (select auth.uid()) or public.is_staff());

create policy "Students create own reservations for enrolled occurrences"
  on public.class_session_reservations for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'reserved'
    and exists (
      select 1
      from public.class_session_occurrences o
      join public.enrollments e on e.class_id = o.class_session_id
      where o.id = occurrence_id
        and e.student_id = (select auth.uid())
        and o.status = 'scheduled'
        and o.reservations_open = true
        and o.session_date >= current_date
    )
  );

create policy "Students cancel own reservations"
  on public.class_session_reservations for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and status = 'cancelled');

create policy "Staff manage session reservations"
  on public.class_session_reservations for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Notify staff when a student reserves a date-specific occurrence.
create or replace function public.notify_staff_on_session_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  occurrence record;
  student_name text;
begin
  if new.status <> 'reserved' then
    return new;
  end if;

  select o.session_date, o.start_time, o.class_type
    into occurrence
  from public.class_session_occurrences o
  where o.id = new.occurrence_id;

  select p.full_name into student_name
  from public.profiles p where p.id = new.student_id;

  insert into public.notifications (user_id, title, body, notification_type, related_id)
  select p.id,
         'رزرو جلسهٔ موردی جدید',
         coalesce(student_name, 'یک هنرجو') || ' برای جلسهٔ ' ||
         occurrence.class_type || ' در تاریخ ' || occurrence.session_date ||
         ' ساعت ' || to_char(occurrence.start_time, 'HH24:MI') || ' رزرو کرد.',
         'session_reservation',
         new.occurrence_id::text
  from public.profiles p
  where p.role in ('teacher', 'manager');

  return new;
end;
$$;

drop trigger if exists on_session_reservation_notify_staff on public.class_session_reservations;
create trigger on_session_reservation_notify_staff
after insert on public.class_session_reservations
for each row execute function public.notify_staff_on_session_reservation();
