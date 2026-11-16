begin;

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
  reason text not null check (reason in ('prior_notice_absence', 'no_notice_absence')),
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
  v_sessions_per_month integer;
  v_month_index integer;
  v_period_start date;
  v_period_end date;
  v_period_consumed integer;
  v_start_date date;
begin
  if new.status not in ('prior_notice_absence', 'no_notice_absence') then
    return new;
  end if;

  -- Exempt only the attendance row explicitly linked to its approved make-up.
  -- Matching by student/date/class alone could accidentally exempt an ordinary absence.
  if new.makeup_request_id is not null and exists (
    select 1 from public.student_makeup_requests mr
    where mr.id = new.makeup_request_id
      and mr.student_id = new.student_id
      and mr.makeup_class_session_id = new.class_id
      and mr.makeup_date = new.session_date
      and mr.status in ('approved', 'completed')
  ) then
    return new;
  end if;

  -- Lock the selected active subscription so simultaneous absences cannot
  -- overrun its monthly or lifetime credit limits.
  select s.id, s.sessions_per_month, s.starts_on
    into v_subscription_id, v_sessions_per_month, v_start_date
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

  -- Billing periods are anniversary-based from starts_on, not calendar months.
  select max(periods.month_index)::integer
    into v_month_index
  from generate_series(0, 2) as periods(month_index)
  where (v_start_date + make_interval(months => periods.month_index))::date <= new.session_date;

  if v_month_index is null then
    return new;
  end if;

  v_period_start := (v_start_date + make_interval(months => v_month_index))::date;
  v_period_end := least(
    (v_start_date + make_interval(months => v_month_index + 1))::date,
    (select s.ends_on + 1 from public.student_subscriptions s where s.id = v_subscription_id)
  );

  select count(*)::integer
    into v_period_consumed
  from public.student_subscription_credit_ledger l
  where l.subscription_id = v_subscription_id
    and l.session_date >= v_period_start
    and l.session_date < v_period_end;

  if v_period_consumed >= v_sessions_per_month then
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
when (new.status in ('prior_notice_absence', 'no_notice_absence'))
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

-- Tie a specific attendance row to the exact approved make-up request. This
-- avoids exempting an unrelated regular absence for the same student/date/slot.
alter table public.attendance_records
  add column if not exists makeup_request_id uuid
  references public.student_makeup_requests(id) on delete restrict;

create index if not exists attendance_records_makeup_request_idx
  on public.attendance_records (makeup_request_id)
  where makeup_request_id is not null;

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

-- Approval is allowed only after the originating absence has a finalized attendance
-- record and exactly one credit-ledger entry. This prevents free make-ups for
-- uncharged absences and requires a real active class slot.
create or replace function private.enforce_makeup_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_absence public.absences%rowtype;
  v_attendance_id uuid;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into v_absence
    from public.absences a
    where a.id = new.absence_id and a.student_id = new.student_id;

    if not found or v_absence.class_id is null then
      raise exception 'گزارش غیبت معتبر برای این درخواست پیدا نشد.';
    end if;

    select ar.id into v_attendance_id
    from public.attendance_records ar
    join public.student_subscription_credit_ledger l on l.attendance_id = ar.id
    where ar.student_id = new.student_id
      and ar.class_id = v_absence.class_id
      and ar.session_date = v_absence.absence_date
    limit 1;

    if v_attendance_id is null then
      raise exception 'ابتدا باید حضور و غیاب ثبت و اعتبار غیبت از اشتراک کسر شود.';
    end if;

    if new.makeup_class_session_id is null or new.makeup_date is null
       or not exists (
         select 1 from public.class_sessions cs
         where cs.id = new.makeup_class_session_id
           and cs.is_active is distinct from false
       ) then
      raise exception 'برای تأیید، روز و سانس معتبر جلسه جبرانی را انتخاب کنید.';
    end if;

    new.approved_by := coalesce(new.approved_by, (select auth.uid()));
    new.approved_at := now();
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    if old.status <> 'approved' then
      raise exception 'فقط جلسه جبرانی تأییدشده قابل تکمیل است.';
    end if;

    -- Completion must follow an actual attendance mark for the agreed make-up
    -- date and slot. Merely pressing the staff button cannot mark it as done.
    if not exists (
      select 1
      from public.attendance_records ar
      where ar.student_id = new.student_id
        and ar.class_id = new.makeup_class_session_id
        and ar.session_date = new.makeup_date
        and ar.status = 'present'
    ) then
      raise exception 'ابتدا حضور هنرجو را در جلسه جبرانی ثبت کنید؛ فقط پس از ثبت حضور می‌توان آن را تکمیل کرد.';
    end if;

    new.completed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.enforce_makeup_approval() from public, anon, authenticated;

drop trigger if exists enforce_makeup_approval on public.student_makeup_requests;
create trigger enforce_makeup_approval
before update of status on public.student_makeup_requests
for each row execute function private.enforce_makeup_approval();

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
      'makeup_request', new.id
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
        'makeup_approved', new.id);
    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, title, body, notification_type, related_id)
      values (new.student_id, 'درخواست جلسه جبرانی',
        'درخواست جلسه جبرانی شما تأیید نشد. برای هماهنگی بیشتر با استاد تماس بگیرید.',
        'makeup_rejected', new.id);
    elsif new.status = 'completed' then
      insert into public.notifications (user_id, title, body, notification_type, related_id)
      values (new.student_id, 'جلسه جبرانی انجام شد',
        'جلسه جبرانی شما تکمیل شد و اعتبار اضافه‌ای از اشتراک کسر نشد.',
        'makeup_completed', new.id);
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
