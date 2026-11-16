-- Monthly Tonaliteh subscriptions: duration is 1/2/3 months and
-- the selected session count is a monthly allowance (4/8/12).
-- Apply only after reviewing this migration; it is not executed automatically.

begin;

create table if not exists public.student_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  duration_months smallint not null check (duration_months in (1, 2, 3)),
  sessions_per_month smallint not null check (sessions_per_month in (4, 8, 12)),
  total_sessions integer generated always as (duration_months::integer * sessions_per_month::integer) stored,
  consumed_sessions integer not null default 0 check (consumed_sessions >= 0),
  remaining_sessions integer generated always as
    (duration_months::integer * sessions_per_month::integer - consumed_sessions) stored,
  monthly_price bigint not null check (monthly_price >= 0),
  total_price bigint not null check (total_price >= 0),
  discount_applied boolean not null default false,
  discount_approved_by uuid references public.profiles(id),
  payment_plan text not null default 'package' check (payment_plan in ('package', 'per_session')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'completed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_subscriptions_dates_check check (ends_on >= starts_on),
  constraint student_subscriptions_consumed_check check (consumed_sessions <= duration_months::integer * sessions_per_month::integer),
  constraint student_subscriptions_discount_check check (
    (discount_applied = false and discount_approved_by is null)
    or (discount_applied = true and discount_approved_by is not null)
  )
);


-- Keep package pricing authoritative in Postgres; never trust a client-supplied amount.
create or replace function public.tonaliteh_set_subscription_price()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_monthly_price bigint;
begin
  if new.payment_plan <> 'package' then
    raise exception 'Monthly subscriptions must use the package payment plan';
  end if;

  if new.discount_applied then
    if new.sessions_per_month not in (8, 12) then
      raise exception 'Discounts are available only for 8- or 12-session monthly packages';
    end if;
    if not public.is_staff() or auth.uid() is null then
      raise exception 'Only authenticated staff may approve a subscription discount';
    end if;
    -- Never trust a client-supplied approver ID; record the actual staff actor.
    new.discount_approved_by := auth.uid();
  else
    new.discount_approved_by := null;
  end if;

  v_monthly_price := case
    when new.sessions_per_month = 4 then 3000000
    when new.sessions_per_month = 8 and new.discount_applied then 5600000
    when new.sessions_per_month = 8 then 6000000
    when new.sessions_per_month = 12 and new.discount_applied then 8000000
    when new.sessions_per_month = 12 then 9000000
    else null
  end;

  if v_monthly_price is null then
    raise exception 'Unsupported monthly session package';
  end if;

  new.monthly_price := v_monthly_price;
  new.total_price := v_monthly_price * new.duration_months;
  new.ends_on := (new.starts_on + make_interval(months => new.duration_months))::date - 1;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists set_subscription_price on public.student_subscriptions;
create trigger set_subscription_price
before insert or update of duration_months, sessions_per_month, discount_applied, discount_approved_by, payment_plan, starts_on
on public.student_subscriptions
for each row execute function public.tonaliteh_set_subscription_price();

create index if not exists student_subscriptions_student_status_idx
  on public.student_subscriptions (student_id, status, starts_on desc);

create table if not exists public.student_subscription_slots (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.student_subscriptions(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (subscription_id, class_session_id)
);

create index if not exists student_subscription_slots_class_idx
  on public.student_subscription_slots (class_session_id);

alter table public.payments
  add column if not exists subscription_id uuid
  references public.student_subscriptions(id) on delete set null;

alter table public.student_subscriptions enable row level security;
alter table public.student_subscription_slots enable row level security;

drop policy if exists "Students read own subscriptions or staff" on public.student_subscriptions;
create policy "Students read own subscriptions or staff"
  on public.student_subscriptions for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "Students create own pending subscriptions" on public.student_subscriptions;
create policy "Students create own pending subscriptions"
  on public.student_subscriptions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'pending_payment'
    and discount_applied = false
    and discount_approved_by is null
    and consumed_sessions = 0
    and payment_plan = 'package'
  );

drop policy if exists "Staff manage subscriptions" on public.student_subscriptions;
create policy "Staff manage subscriptions"
  on public.student_subscriptions for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "Students read own subscription slots or staff" on public.student_subscription_slots;
create policy "Students read own subscription slots or staff"
  on public.student_subscription_slots for select to authenticated
  using (
    exists (
      select 1 from public.student_subscriptions s
      where s.id = subscription_id
        and (s.student_id = (select auth.uid()) or (select public.is_staff()))
    )
  );

drop policy if exists "Students manage own pending subscription slots" on public.student_subscription_slots;
create policy "Students manage own pending subscription slots"
  on public.student_subscription_slots for all to authenticated
  using (
    exists (
      select 1 from public.student_subscriptions s
      where s.id = subscription_id
        and s.student_id = (select auth.uid())
        and s.status = 'pending_payment'
    )
  )
  with check (
    exists (
      select 1 from public.student_subscriptions s
      where s.id = subscription_id
        and s.student_id = (select auth.uid())
        and s.status = 'pending_payment'
    )
  );

grant select, insert, update, delete on public.student_subscriptions to authenticated;
grant select, insert, update, delete on public.student_subscription_slots to authenticated;

-- Atomic student-side creation: package, recurring class slots and enrollments are
-- created together, with prices recalculated by the trigger above.
create or replace function public.tonaliteh_create_subscription(
  _duration_months smallint,
  _sessions_per_month smallint,
  _class_session_ids uuid[],
  _starts_on date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_subscription_id uuid;
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if _duration_months not in (1, 2, 3)
     or _sessions_per_month not in (4, 8, 12) then
    raise exception 'Invalid subscription package';
  end if;
  if _class_session_ids is null or cardinality(_class_session_ids) = 0 then
    raise exception 'Select at least one recurring class slot';
  end if;
  if _starts_on is null or _starts_on < current_date then
    raise exception 'Subscription start date cannot be in the past';
  end if;

  select count(distinct cs.id) into v_count
  from public.class_sessions cs
  where cs.id = any(_class_session_ids)
    and cs.is_active is distinct from false;

  if v_count <> cardinality(_class_session_ids) then
    raise exception 'One or more selected class slots are unavailable';
  end if;

  insert into public.student_subscriptions (
    student_id, duration_months, sessions_per_month, monthly_price,
    total_price, starts_on, ends_on, status, payment_plan
  ) values (
    v_uid, _duration_months, _sessions_per_month, 0,
    0, _starts_on, _starts_on, 'pending_payment', 'package'
  )
  returning id into v_subscription_id;

  insert into public.student_subscription_slots (subscription_id, class_session_id)
  select v_subscription_id, selected_id
  from (select distinct unnest(_class_session_ids) as selected_id) chosen;

  insert into public.enrollments (student_id, class_id)
  select v_uid, selected_id
  from (select distinct unnest(_class_session_ids) as selected_id) chosen
  on conflict (student_id, class_id) do nothing;

  return v_subscription_id;
end;
$function$;

revoke all on function public.tonaliteh_create_subscription(smallint, smallint, uuid[], date) from public, anon;
grant execute on function public.tonaliteh_create_subscription(smallint, smallint, uuid[], date) to authenticated;


-- Allow a student to submit only the exact amount due for their own pending
-- subscription. The existing payments table remains staff-managed for updates.
drop policy if exists "Students submit own subscription payment" on public.payments;
create policy "Students submit own subscription payment"
  on public.payments for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'pending'
    and payment_type = 'tuition'
    and payment_method = 'bank_transfer'
    and subscription_id is not null
    and exists (
      select 1
      from public.student_subscriptions s
      where s.id = subscription_id
        and s.student_id = (select auth.uid())
        and s.status = 'pending_payment'
        and s.total_price = amount
    )
  );

-- A rejected transfer may be resubmitted; at most one non-rejected payment
-- can exist for a subscription at a time.
create unique index if not exists payments_one_open_per_subscription_idx
  on public.payments (subscription_id)
  where subscription_id is not null and status <> 'rejected';

-- Subscription-linked payments have a one-way review lifecycle. Once a
-- transfer is paid or rejected, its identity and amount cannot be rewritten.
-- A rejected transfer is replaced by a new pending payment row.
create or replace function public.tonaliteh_guard_subscription_payment()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.subscription_id is null and new.subscription_id is null then
    return new;
  end if;

  if new.subscription_id is distinct from old.subscription_id
     or new.student_id is distinct from old.student_id
     or new.amount is distinct from old.amount then
    raise exception 'اطلاعات اصلی پرداخت اشتراک قابل تغییر نیست.';
  end if;

  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'وضعیت پرداخت بررسی‌شده قابل تغییر نیست؛ برای پرداخت ردشده رسید تازه ثبت کنید.';
  end if;

  if new.status not in ('pending', 'paid', 'rejected') then
    raise exception 'وضعیت پرداخت اشتراک معتبر نیست.';
  end if;

  if new.status = 'paid' and old.status = 'pending' then
    if not exists (
      select 1
      from public.student_subscriptions s
      where s.id = new.subscription_id
        and s.student_id = new.student_id
        and s.status = 'pending_payment'
        and s.total_price = new.amount
    ) then
      raise exception 'مبلغ یا وضعیت اشتراک با پرداخت ارسالی مطابقت ندارد.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_subscription_payment on public.payments;
create trigger guard_subscription_payment
before update on public.payments
for each row execute function public.tonaliteh_guard_subscription_payment();

-- Staff payment approval activates the linked subscription. Rejection leaves
-- it pending so the student can submit a corrected transfer.
create or replace function public.tonaliteh_sync_subscription_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.subscription_id is not null and new.status is distinct from old.status then
    if new.status = 'paid' then
      update public.student_subscriptions
      set status = 'active', updated_at = now()
      where id = new.subscription_id
        and student_id = new.student_id
        and status = 'pending_payment';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_subscription_payment_status on public.payments;
create trigger sync_subscription_payment_status
after update of status on public.payments
for each row execute function public.tonaliteh_sync_subscription_payment();

commit;
