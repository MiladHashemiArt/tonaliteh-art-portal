-- Tonaliteh 006: monthly subscriptions, monthly allocations, and append-only credit ledger.
-- SCHEMA FOUNDATION ONLY. Does not change existing bookings or attendance behavior.
-- Install only after review of the full reservation/credit RPC migration.
-- Dates are stored as Gregorian DATE boundaries calculated from the Jalali activation
-- date by the application/domain layer. Future allocations exist but cannot be spent
-- until starts_on. Rollover defaults to disabled.

begin;

create table if not exists public.student_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  duration_months smallint not null check (duration_months between 1 and 3),
  monthly_quota integer not null check (monthly_quota > 0),
  activated_on date not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'completed', 'cancelled')),
  agreed_price numeric(14,2) not null default 0 check (agreed_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  rollover_enabled boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_subscriptions_discount_not_above_price
    check (discount_amount <= agreed_price)
);

create index if not exists student_subscriptions_student_status_idx
  on public.student_subscriptions (student_id, status, activated_on desc);

create table if not exists public.student_subscription_allocations (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.student_subscriptions(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  period_number smallint not null check (period_number between 1 and 3),
  starts_on date not null,
  ends_on date not null,
  monthly_quota integer not null check (monthly_quota > 0),
  created_at timestamptz not null default now(),
  constraint student_subscription_allocations_valid_range check (ends_on >= starts_on),
  constraint student_subscription_allocations_period_unique unique (subscription_id, period_number),
  constraint student_subscription_allocations_id_student_unique unique (id, student_id)
);

create index if not exists student_subscription_allocations_student_dates_idx
  on public.student_subscription_allocations (student_id, starts_on, ends_on);

create table if not exists public.student_subscription_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null,
  subscription_id uuid not null references public.student_subscriptions(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in (
    'booking_debit',
    'booking_release',
    'attendance_correction',
    'staff_adjustment'
  )),
  reservation_id uuid references public.class_session_reservations(id) on delete restrict,
  idempotency_key text not null unique check (char_length(btrim(idempotency_key)) between 1 and 200),
  reversal_of_id uuid references public.student_subscription_credit_ledger(id) on delete restrict,
  note text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint student_subscription_credit_ledger_allocation_student_fk
    foreign key (allocation_id, student_id)
    references public.student_subscription_allocations(id, student_id)
    on delete restrict,
  constraint student_subscription_credit_ledger_reason_sign check (
    (reason = 'booking_debit' and delta = -1 and reservation_id is not null)
    or (reason = 'booking_release' and delta = 1 and reservation_id is not null)
    or (reason = 'attendance_correction')
    or (reason = 'staff_adjustment')
  )
);

create unique index if not exists student_subscription_credit_one_booking_debit
  on public.student_subscription_credit_ledger (reservation_id)
  where reason = 'booking_debit';

create index if not exists student_subscription_credit_ledger_allocation_idx
  on public.student_subscription_credit_ledger (allocation_id, created_at, id);

create index if not exists student_subscription_credit_ledger_student_idx
  on public.student_subscription_credit_ledger (student_id, created_at desc);

-- RLS: students can read only their own subscription, allocation and ledger.
-- Writes are reserved for staff/RPCs; there is intentionally no student write policy.
alter table public.student_subscriptions enable row level security;
alter table public.student_subscription_allocations enable row level security;
alter table public.student_subscription_credit_ledger enable row level security;

drop policy if exists "Students read own subscriptions or staff" on public.student_subscriptions;
create policy "Students read own subscriptions or staff"
  on public.student_subscriptions for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "Staff manage subscriptions" on public.student_subscriptions;
create policy "Staff manage subscriptions"
  on public.student_subscriptions for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "Students read own monthly allocations or staff" on public.student_subscription_allocations;
create policy "Students read own monthly allocations or staff"
  on public.student_subscription_allocations for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "Staff manage monthly allocations" on public.student_subscription_allocations;
create policy "Staff manage monthly allocations"
  on public.student_subscription_allocations for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "Students read own credit ledger or staff" on public.student_subscription_credit_ledger;
create policy "Students read own credit ledger or staff"
  on public.student_subscription_credit_ledger for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));

revoke all on public.student_subscriptions from anon, authenticated;
revoke all on public.student_subscription_allocations from anon, authenticated;
revoke all on public.student_subscription_credit_ledger from anon, authenticated;

grant select on public.student_subscriptions to authenticated;
grant insert, update, select on public.student_subscriptions to authenticated;
grant select on public.student_subscription_allocations to authenticated;
grant insert, update, select on public.student_subscription_allocations to authenticated;
grant select on public.student_subscription_credit_ledger to authenticated;

comment on table public.student_subscriptions is
  'Purchase-time subscription snapshot; monthly quota and term are fixed for this purchase.';
comment on table public.student_subscription_allocations is
  'One separately spendable monthly credit allocation per subscription period; dates are Gregorian boundaries derived from Jalali activation.';
comment on table public.student_subscription_credit_ledger is
  'Append-only signed monthly credit ledger. Ordinary booking debits happen at reservation time; attendance must not debit again.';

commit;
