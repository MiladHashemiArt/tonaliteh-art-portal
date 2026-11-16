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
  constraint student_subscriptions_discount_check check (
    (discount_applied = false and discount_approved_by is null)
    or (discount_applied = true and discount_approved_by is not null)
  )
);

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

commit;
