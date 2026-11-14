-- PROPOSAL ONLY — do not run against production.
-- Draft schema for the member-only Tonaliteh student art community.
-- All existing artwork rows remain private by default. The storage bucket stays private.

begin;

alter table public.student_artworks
  add column if not exists visibility text not null default 'private',
  add column if not exists publication_consent_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists technique text,
  add column if not exists materials text,
  add column if not exists dimensions text,
  add column if not exists duration_minutes integer;

alter table public.student_artworks
  add constraint student_artworks_visibility_check
    check (visibility in ('private', 'published')),
  add constraint student_artworks_publication_consent_check
    check (
      visibility <> 'published'
      or (publication_consent_at is not null and published_at is not null)
    ),
  add constraint student_artworks_duration_check
    check (duration_minutes is null or duration_minutes between 1 and 100000);

create index if not exists student_artworks_published_feed_idx
  on public.student_artworks (published_at desc, id)
  where visibility = 'published';

create table if not exists public.student_artwork_likes (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.student_artworks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint student_artwork_likes_once_per_user unique (artwork_id, user_id)
);

create index if not exists student_artwork_likes_user_idx
  on public.student_artwork_likes (user_id, created_at desc);

create table if not exists public.student_artwork_comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.student_artworks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.student_artwork_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_artwork_comments_id_artwork_unique unique (id, artwork_id),
  constraint student_artwork_comments_parent_same_artwork_fk
    foreign key (parent_id, artwork_id)
    references public.student_artwork_comments(id, artwork_id)
    on delete cascade
);

create index if not exists student_artwork_comments_feed_idx
  on public.student_artwork_comments (artwork_id, created_at asc)
  where is_hidden = false;

create index if not exists student_artwork_comments_author_idx
  on public.student_artwork_comments (author_id, created_at desc);

create table if not exists public.student_artwork_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  artwork_id uuid references public.student_artworks(id) on delete cascade,
  comment_id uuid references public.student_artwork_comments(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 80),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_artwork_reports_one_target check (
    (artwork_id is not null and comment_id is null)
    or (artwork_id is null and comment_id is not null)
  )
);

create index if not exists student_artwork_reports_queue_idx
  on public.student_artwork_reports (status, created_at desc);

create table if not exists public.student_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint student_follows_no_self check (follower_id <> followed_id)
);

create index if not exists student_follows_followed_idx
  on public.student_follows (followed_id, created_at desc);

-- RLS on profiles intentionally hides other students' private profile rows.
-- This narrow helper checks only whether a target account is a student.
create or replace function private.is_student_profile(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = _user_id and p.role = 'student'
  );
$function$;

revoke all on function private.is_student_profile(uuid) from public, anon;
grant execute on function private.is_student_profile(uuid) to authenticated;

-- Prevent a comment author from moving a comment to another artwork,
-- changing its author/parent, or hiding it through a client-side UPDATE.
create or replace function private.guard_student_artwork_comment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_staff() then
    if old.author_id <> auth.uid()
       or new.author_id is distinct from old.author_id
       or new.artwork_id is distinct from old.artwork_id
       or new.parent_id is distinct from old.parent_id
       or new.is_hidden is distinct from old.is_hidden then
      raise exception 'Only staff may change comment ownership, target, parent, or moderation state';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.guard_student_artwork_comment_update() from public, anon, authenticated;

drop trigger if exists guard_student_artwork_comment_update
  on public.student_artwork_comments;
create trigger guard_student_artwork_comment_update
before update on public.student_artwork_comments
for each row execute function private.guard_student_artwork_comment_update();

-- Publication is an explicit, authenticated owner action. The private helper
-- is SECURITY DEFINER only because the current artwork UPDATE policy is staff-only.
-- It validates auth.uid() against the row owner and exposes no row data.
create or replace function private.set_student_artwork_publication(
  _artwork_id uuid,
  _publish boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'Authentication required';
  end if;

  update public.student_artworks
     set visibility = case when _publish then 'published' else 'private' end,
         publication_consent_at = case when _publish then now() else publication_consent_at end,
         published_at = case when _publish then now() else null end,
         updated_at = now()
   where id = _artwork_id
     and student_id = auth.uid();

  if not found then
    raise exception 'Artwork not found or not owned by the current user';
  end if;
end;
$function$;

revoke all on function private.set_student_artwork_publication(uuid, boolean) from public, anon;
grant execute on function private.set_student_artwork_publication(uuid, boolean) to authenticated;

create or replace function public.set_student_artwork_publication(
  _artwork_id uuid,
  _publish boolean
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_student_artwork_publication(_artwork_id, _publish);
$function$;

revoke all on function public.set_student_artwork_publication(uuid, boolean) from public, anon;
grant execute on function public.set_student_artwork_publication(uuid, boolean) to authenticated;

alter table public.student_artwork_likes enable row level security;
alter table public.student_artwork_comments enable row level security;
alter table public.student_artwork_reports enable row level security;
alter table public.student_follows enable row level security;

grant select, insert, delete on public.student_artwork_likes to authenticated;
grant select, insert, update, delete on public.student_artwork_comments to authenticated;
grant select, insert, update on public.student_artwork_reports to authenticated;
grant select, insert, delete on public.student_follows to authenticated;

-- Existing artwork SELECT policy is owner/staff only. Add a separate
-- member-feed policy without widening access to private rows or anon sessions.
create policy "Members read published artworks"
on public.student_artworks for select to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and visibility = 'published'
);

create policy "Members read likes on published artworks"
on public.student_artwork_likes for select to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and exists (
    select 1 from public.student_artworks a
    where a.id = artwork_id and a.visibility = 'published'
  )
);

create policy "Members like published artworks as themselves"
on public.student_artwork_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and exists (
    select 1 from public.student_artworks a
    where a.id = artwork_id and a.visibility = 'published'
  )
);

create policy "Members remove their own likes"
on public.student_artwork_likes for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Members read visible comments on published artworks"
on public.student_artwork_comments for select to authenticated
using (
  (not is_hidden or public.is_staff())
  and exists (
    select 1 from public.student_artworks a
    where a.id = artwork_id
      and (a.visibility = 'published' or a.student_id = (select auth.uid()) or public.is_staff())
  )
);

create policy "Members comment on published artworks as themselves"
on public.student_artwork_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and exists (
    select 1 from public.student_artworks a
    where a.id = artwork_id and a.visibility = 'published'
  )
  and (
    parent_id is null
    or exists (
      select 1 from public.student_artwork_comments parent
      where parent.id = parent_id
        and parent.artwork_id = artwork_id
        and parent.parent_id is null
        and parent.is_hidden = false
    )
  )
);

create policy "Authors and staff update comments"
on public.student_artwork_comments for update to authenticated
using (author_id = (select auth.uid()) or public.is_staff())
with check (
  (author_id = (select auth.uid()) or public.is_staff())
  and exists (
    select 1 from public.student_artworks a
    where a.id = artwork_id
      and (a.visibility = 'published' or public.is_staff())
  )
);

create policy "Authors and staff delete comments"
on public.student_artwork_comments for delete to authenticated
using (author_id = (select auth.uid()) or public.is_staff());

create policy "Reporters and staff read reports"
on public.student_artwork_reports for select to authenticated
using (reporter_id = (select auth.uid()) or public.is_staff());

create policy "Members report published content"
on public.student_artwork_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and (
    (artwork_id is not null and exists (
      select 1 from public.student_artworks a
      where a.id = artwork_id and a.visibility = 'published'
    ))
    or
    (comment_id is not null and exists (
      select 1
      from public.student_artwork_comments c
      join public.student_artworks a on a.id = c.artwork_id
      where c.id = comment_id and c.is_hidden = false and a.visibility = 'published'
    ))
  )
);

create policy "Staff review reports"
on public.student_artwork_reports for update to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy "Students read their own follow edges"
on public.student_follows for select to authenticated
using (follower_id = (select auth.uid()) or followed_id = (select auth.uid()));

create policy "Students follow students"
on public.student_follows for insert to authenticated
with check (
  follower_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and (select private.is_student_profile(follower_id))
  and (select private.is_student_profile(followed_id))
);

create policy "Students unfollow themselves"
on public.student_follows for delete to authenticated
using (follower_id = (select auth.uid()));

-- Keep the bucket private. This additional SELECT policy only permits
-- authenticated members to read objects attached to published artwork rows.
create policy "Members read images of published student artworks"
on storage.objects for select to authenticated
using (
  bucket_id = 'student-artworks'
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and exists (
    select 1 from public.student_artworks a
    where a.object_path = name and a.visibility = 'published'
  )
);

commit;
