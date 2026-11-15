-- ============================================================================
-- Tonaliteh — tuition checkout foundation.
-- REVIEW ONLY: do NOT run this file in production until the complete checkout
-- RPCs, receipt storage policies, gateway callback, and student UI are ready.
-- This migration intentionally does not alter legacy enrollments or payments.
-- ============================================================================

create table if not exists public.tuition_orders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  session_count integer not null check (session_count > 0 and session_count <= 52),
  amount_toman bigint not null check (amount_toman > 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'awaiting_review', 'paid', 'rejected', 'cancelled')),
  price_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint tuition_orders_price_snapshot_object check (jsonb_typeof(price_snapshot) = 'object')
);

create index if not exists tuition_orders_student_created_idx
  on public.tuition_orders (student_id, created_at desc);
create index if not exists tuition_orders_status_created_idx
  on public.tuition_orders (status, created_at desc);

create table if not exists public.tuition_order_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tuition_orders(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (order_id, class_session_id)
);

create index if not exists tuition_order_sessions_session_idx
  on public.tuition_order_sessions (class_session_id);

create table if not exists public.tuition_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tuition_orders(id) on delete cascade,
  method text not null check (method in ('manual_transfer', 'online_gateway')),
  provider text,
  amount_toman bigint not null check (amount_toman > 0),
  status text not null default 'initiated'
    check (status in ('initiated', 'awaiting_review', 'paid', 'rejected', 'failed')),
  gateway_reference text,
  receipt_object_path text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tuition_payment_attempts_method_details check (
    (method = 'manual_transfer' and provider is null)
    or method = 'online_gateway'
  )
);

create index if not exists tuition_payment_attempts_order_idx
  on public.tuition_payment_attempts (order_id, created_at desc);
create unique index if not exists tuition_payment_attempts_gateway_reference_uidx
  on public.tuition_payment_attempts (provider, gateway_reference)
  where gateway_reference is not null;

alter table public.tuition_orders enable row level security;
alter table public.tuition_order_sessions enable row level security;
alter table public.tuition_payment_attempts enable row level security;

drop policy if exists "Students read own tuition orders or staff" on public.tuition_orders;
create policy "Students read own tuition orders or staff"
  on public.tuition_orders for select to authenticated
  using (student_id = (select auth.uid()) or public.is_staff());

drop policy if exists "Students read own tuition order sessions or staff" on public.tuition_order_sessions;
create policy "Students read own tuition order sessions or staff"
  on public.tuition_order_sessions for select to authenticated
  using (
    exists (
      select 1 from public.tuition_orders o
      where o.id = order_id
        and (o.student_id = (select auth.uid()) or public.is_staff())
    )
  );

drop policy if exists "Students read own tuition payment attempts or staff" on public.tuition_payment_attempts;
create policy "Students read own tuition payment attempts or staff"
  on public.tuition_payment_attempts for select to authenticated
  using (
    exists (
      select 1 from public.tuition_orders o
      where o.id = order_id
        and (o.student_id = (select auth.uid()) or public.is_staff())
    )
  );

-- No client INSERT/UPDATE/DELETE policies are added here. Checkout creation,
-- receipt submission, staff approval, and gateway confirmation must go through
-- narrowly scoped SECURITY DEFINER RPCs / server-side Edge Functions. In
-- particular, the browser must never be able to mark an order or payment paid.
