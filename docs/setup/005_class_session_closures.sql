-- Run once in Supabase SQL Editor after reviewing.
-- Class closures are stored separately; class_sessions and enrollments are never deleted or disabled.
create table if not exists public.class_session_closures (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('session', 'day', 'range')),
  class_session_id uuid null references public.class_sessions(id) on delete set null,
  start_date date not null,
  end_date date not null,
  reason text null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tonaliteh_closures_dates_valid check (end_date >= start_date),
  constraint tonaliteh_closures_scope_valid check (
    (scope = 'session' and class_session_id is not null and start_date = end_date)
    or (scope = 'day' and class_session_id is null and start_date = end_date)
    or (scope = 'range' and class_session_id is null)
  )
);

create index if not exists class_session_closures_active_dates_idx
  on public.class_session_closures (is_active, start_date, end_date);
create index if not exists class_session_closures_session_idx
  on public.class_session_closures (class_session_id, start_date)
  where class_session_id is not null;

alter table public.class_session_closures enable row level security;

drop policy if exists "Authenticated users read class closures" on public.class_session_closures;
create policy "Authenticated users read class closures"
  on public.class_session_closures for select to authenticated
  using (true);

drop policy if exists "Staff manage class closures" on public.class_session_closures;
create policy "Staff manage class closures"
  on public.class_session_closures for all to authenticated
  using (public.is_staff())
  with check (public.is_staff() and created_by = (select auth.uid()));

grant select, insert, update, delete on public.class_session_closures to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_session_closures'
  ) then
    alter publication supabase_realtime add table public.class_session_closures;
  end if;
end $$;
