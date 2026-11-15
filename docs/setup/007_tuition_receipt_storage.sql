-- ============================================================================
-- Tonaliteh — private storage for manual tuition payment receipts.
-- REVIEW ONLY. Apply only after reviewing the complete checkout release.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tuition-receipts',
  'tuition-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students upload own tuition receipts" on storage.objects;
create policy "Students upload own tuition receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tuition-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students and staff read tuition receipts" on storage.objects;
create policy "Students and staff read tuition receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'tuition-receipts'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_staff()
  )
);

drop policy if exists "Students delete own tuition receipts" on storage.objects;
create policy "Students delete own tuition receipts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tuition-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
