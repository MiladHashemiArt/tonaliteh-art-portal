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


-- Notify only students whose enrolled class has an occurrence affected by a closure.
create or replace function public.notify_students_on_class_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_student record;
  closure_label text;
  date_label text;
begin
  if not new.is_active then
    return new;
  end if;

  closure_label := case new.scope
    when 'session' then 'لغو یک سانس'
    when 'day' then 'تعطیلی کلاس‌های یک روز'
    else 'تعطیلی کلاس‌ها در یک بازه'
  end;

  date_label := case
    when new.start_date = new.end_date then new.start_date::text
    else new.start_date::text || ' تا ' || new.end_date::text
  end;

  for affected_student in
    select distinct e.student_id
    from public.enrollments e
    join public.class_sessions cs on cs.id = e.class_id
    where
      (new.scope <> 'session' or cs.id = new.class_session_id)
      and exists (
        select 1
        from generate_series(new.start_date, new.end_date, interval '1 day') as occurrence(day)
        where
          (
            (new.scope = 'session' and occurrence.day::date = new.start_date)
            or new.scope in ('day', 'range')
          )
          and (
            (cs.session_date is not null and cs.session_date = occurrence.day::date)
            or (
              cs.session_date is null
              and (
                case replace(cs.class_day, '‌', '')
                  when 'شنبه' then 6
                  when 'یکشنبه' then 0
                  when 'دوشنبه' then 1
                  when 'سهشنبه' then 2
                  when 'چهارشنبه' then 3
                  when 'پنجشنبه' then 4
                  when 'جمعه' then 5
                  else -1
                end
              ) = extract(dow from occurrence.day)::integer
              and (
                coalesce(cs.recurrence_weeks, 1) <= 1
                or (
                  cs.recurrence_anchor_date is not null
                  and occurrence.day::date >=
                    (cs.recurrence_anchor_date +
                      (
                        (
                          case replace(cs.class_day, '‌', '')
                            when 'شنبه' then 6
                            when 'یکشنبه' then 0
                            when 'دوشنبه' then 1
                            when 'سهشنبه' then 2
                            when 'چهارشنبه' then 3
                            when 'پنجشنبه' then 4
                            when 'جمعه' then 5
                            else -1
                          end
                        ) - extract(dow from cs.recurrence_anchor_date)::integer
                        + 7
                      ) % 7
                    )
                  and mod(
                    ((occurrence.day::date -
                      (cs.recurrence_anchor_date +
                        (
                          (
                            case replace(cs.class_day, '‌', '')
                              when 'شنبه' then 6
                              when 'یکشنبه' then 0
                              when 'دوشنبه' then 1
                              when 'سهشنبه' then 2
                              when 'چهارشنبه' then 3
                              when 'پنجشنبه' then 4
                              when 'جمعه' then 5
                              else -1
                            end
                          ) - extract(dow from cs.recurrence_anchor_date)::integer
                          + 7
                        ) % 7
                      )) / 7)::integer,
                    coalesce(cs.recurrence_weeks, 1)::integer
                  ) = 0
                )
              )
            )
          )
      )
  loop
    insert into public.notifications (user_id, title, body, notification_type, related_id)
    values (
      affected_student.student_id,
      closure_label,
      date_label || case when nullif(trim(new.reason), '') is not null then ' — ' || trim(new.reason) else '' end,
      'class_closure',
      new.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_students_on_class_closure on public.class_session_closures;
create trigger notify_students_on_class_closure
after insert on public.class_session_closures
for each row execute function public.notify_students_on_class_closure();
