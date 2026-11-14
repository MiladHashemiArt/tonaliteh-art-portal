create table if not exists public.student_skill_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  skill_key text not null check (skill_key in ('drawing','anatomy','portrait','color','oil_painting')),
  score smallint not null check (score between 1 and 5),
  observations text,
  next_goal text,
  assessed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists student_skill_assessments_student_created_idx
  on public.student_skill_assessments (student_id, created_at desc);
create index if not exists student_skill_assessments_assessed_by_idx
  on public.student_skill_assessments (assessed_by);

alter table public.student_skill_assessments enable row level security;

drop policy if exists "Staff create skill assessments" on public.student_skill_assessments;
create policy "Staff create skill assessments"
  on public.student_skill_assessments for insert
  to authenticated
  with check (public.is_staff() and assessed_by = (select auth.uid()));

drop policy if exists "Staff read all and students read own skill assessments" on public.student_skill_assessments;
create policy "Staff read all and students read own skill assessments"
  on public.student_skill_assessments for select
  to authenticated
  using (public.is_staff() or student_id = (select auth.uid()));
