-- Tonaliteh 007: subscription credit ledger and teacher-approved make-up sessions.
-- Depends on 006_monthly_subscriptions.sql. Review and apply only after 006 is installed.

do $preflight$
begin
  if to_regclass('public.student_subscriptions') is null
     or to_regclass('public.student_subscription_slots') is null then
    raise exception 'Migration 006_monthly_subscriptions.sql must be applied before 007';
  end if;
end;
$preflight$;

-- One immutable consumption entry per finalized attendance record. This makes
-- repeated attendance edits idempotent: an absence consumes exactly one credit,
-- and changing it later to another finalized status cannot consume twice.
create table if not exists public.student_subscription_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.student_subscriptions(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  attendance_id uuid not null references public.attendance_records(id) on delete restrict,
  class_id uuid not null references public.class_sessions(id) on delete restrict,
  session_date date not null,
  credit_delta smallint not null default -1 check (credit_delta = -1),
  reason text not null check (reason in ('present', 'prior_notice_absence', 'no_notice_absence')),
  created_at timestamptz not null default now(),
  unique (attendance_id)
);

create index if not exists student_subscription_credit_ledger_subscription_idx
  on public.student_subscription_credit_ledger (subscription_id, created_at desc);

alter table public.student_subscription_credit_ledger enable row level security;

drop policy if exists "Students read own credit ledger or staff" on public.student_subscription_credit_ledger;
create policy "Students read own credit ledger or staff"
  on public.student_subscription_credit_ledger for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

revoke all on public.student_subscription_credit_ledger from anon, authenticated;
grant select on public.student_subscription_credit_ledger to authenticated;

create or replace function private.consume_subscription_credit_for_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription_id uuid;
  v_inserted_id uuid;
begin
  if new.status not in ('present', 'prior_notice_absence', 'no_notice_absence') then
    return new;
  end if;

  -- Select one active package that includes this class slot and session date.
  select s.id
    into v_subscription_id
  from public.student_subscriptions s
  join public.student_subscription_slots ss on ss.subscription_id = s.id
  where s.student_id = new.student_id
    and s.status = 'active'
    and s.starts_on <= new.session_date
    and s.ends_on >= new.session_date
    and ss.class_session_id = new.class_id
    and s.consumed_sessions < s.total_sessions
  order by s.starts_on desc, s.created_at desc
  limit 1
  for update of s;

  if v_subscription_id is null then
    return new;
  end if;

  insert into public.student_subscription_credit_ledger
    (subscription_id, student_id, attendance_id, class_id, session_date, reason)
  values
    (v_subscription_id, new.student_id, new.id, new.class_id, new.session_date, new.status)
  on conflict (attendance_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    update public.student_subscriptions
    set consumed_sessions = consumed_sessions + 1,
        status = case
          when consumed_sessions + 1 >= total_sessions then 'completed'
          else status
        end,
        updated_at = now()
    where id = v_subscription_id;
  end if;

  return new;
end;
$function$;

revoke all on function private.consume_subscription_credit_for_attendance() from public, anon, authenticated;

drop trigger if exists consume_subscription_credit_after_attendance on public.attendance_records;
create trigger consume_subscription_credit_after_attendance
after insert or update of status on public.attendance_records
for each row
when (new.status in ('present', 'prior_notice_absence', 'no_notice_absence'))
execute function private.consume_subscription_credit_for_attendance();

-- A student can request one make-up per reported absence. Staff coordinate
-- the date/time with the student and approve the agreed class slot.
create table if not exists public.student_makeup_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  absence_id uuid not null unique references public.absences(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  makeup_class_session_id uuid references public.class_sessions(id) on delete restrict,
  makeup_date date,
  requested_note text,
  staff_note text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_makeup_requests_schedule_check check (
    (status in ('pending', 'rejected', 'cancelled') and makeup_class_session_id is null and makeup_date is null)
    or
    (status in ('approved', 'completed') and makeup_class_session_id is not null and makeup_date is not null)
  )
);

create index if not exists student_makeup_requests_student_status_idx
  on public.student_makeup_requests (student_id, status, created_at desc);

alter table public.student_makeup_requests enable row level security;

drop policy if exists "Students read own make-up requests or staff" on public.student_makeup_requests;
create policy "Students read own make-up requests or staff"
  on public.student_makeup_requests for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "Students request make-up for own absence" on public.student_makeup_requests;
create policy "Students request make-up for own absence"
  on public.student_makeup_requests for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'pending'
    and makeup_class_session_id is null
    and makeup_date is null
    and approved_by is null
    and approved_at is null
    and completed_at is null
    and exists (
      select 1 from public.absences a
      where a.id = absence_id
        and a.student_id = (select auth.uid())
        and a.class_id is not null
    )
  );

drop policy if exists "Staff manage make-up requests" on public.student_makeup_requests;
create policy "Staff manage make-up requests"
  on public.student_makeup_requests for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

revoke all on public.student_makeup_requests from anon;
grant select, insert, update on public.student_makeup_requests to authenticated;

-- Notifications use the existing notifications table and stay inside the private schema.
create or replace function private.notify_makeup_request_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_name text;
  v_session_label text;
begin
  if tg_op = 'INSERT' then
    select coalesce(p.full_name, p.phone, 'هنرجو')
      into v_student_name
    from public.profiles p where p.id = new.student_id;

    insert into public.notifications (user_id, title, body, notification_type, related_id)
    select p.id, 'درخواست جلسه جبرانی',
      v_student_name || ' برای غیبت خود درخواست جلسه جبرانی ثبت کرده است.',
      'makeup_request', new.id::text
    from public.profiles p
    where p.role in ('teacher', 'manager', 'admin', 'management', 'استاد', 'مدیر', 'مدیریت');

    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      select coalesce(cs.class_day::text, '') || ' · ' ||
             coalesce(to_char(cs.start_time, 'HH24:MI'), '') || ' تا ' ||
             coalesce(to_char(cs.end_time, 'HH24:MI'), '')
        into v_session_label
      from public.class_sessions cs
      where cs.id = new.makeup_class_session_id;

      insert into public.notifications (user_id, title, body, notification_type, related_id)
      values (new.student_id, 'جلسه جبرانی تأیید شد',
        'جلسه جبرانی شما برای ' || coalesce(to_char(new.makeup_date, 'YYYY-MM-DD'), '') ||
        ' (' || coalesce(v_session_label, 'سانس توافق‌شده') || ') تأیید شد.',
        'makeup_approved', new.id::text);
    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, title, body, notification_type, related_id)
      values (new.student_id, 'درخواست جلسه جبرانی',
        'درخواست جلسه جبرانی شما تأیید نشد. برای هماهنگی بیشتر با استاد تماس بگیرید.',
        'makeup_rejected', new.id::text);
    elsif new.status = 'completed' then
      insert into public.notifications (user_id, title, body, notification_type, related_id)
      values (new.student_id, 'جلسه جبرانی انجام شد',
        'جلسه جبرانی شما تکمیل شد و اعتبار اضافه‌ای از اشتراک کسر نشد.',
        'makeup_completed', new.id::text);
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.notify_makeup_request_changes() from public, anon, authenticated;

drop trigger if exists notify_makeup_request_changes on public.student_makeup_requests;
create trigger notify_makeup_request_changes
after insert or update of status on public.student_makeup_requests
for each row execute function private.notify_makeup_request_changes();

commit;
