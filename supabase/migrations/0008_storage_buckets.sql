-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Create Storage buckets used by the app and lock them down with
-- simple authenticated-only policies. Bucket names referenced from
-- src/services and src/features/*.

-- Avatars: public read so img tags work without signed urls; auth users write.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

-- Private receipts, invoices, shift Z-reports, etc.
insert into storage.buckets (id, name, public) values
  ('shift-reports',  'shift-reports',  false),
  ('receipts',       'receipts',       false),
  ('invoices',       'invoices',       false),
  ('tax-documents',  'tax-documents',  false),
  ('measurements',   'measurements',   false),
  ('documents',      'documents',      false)
  on conflict (id) do nothing;

-- Auth users may upload to any private bucket (RLS on parent tables is the
-- real authority). Reads require auth.
drop policy if exists fingas_storage_select on storage.objects;
create policy fingas_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('avatars','shift-reports','receipts','invoices',
                  'tax-documents','measurements','documents')
  );

drop policy if exists fingas_storage_insert on storage.objects;
create policy fingas_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars','shift-reports','receipts','invoices',
                  'tax-documents','measurements','documents')
  );

drop policy if exists fingas_storage_update on storage.objects;
create policy fingas_storage_update on storage.objects
  for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists fingas_storage_delete on storage.objects;
create policy fingas_storage_delete on storage.objects
  for delete to authenticated
  using (owner = auth.uid());

-- Public read for avatars only.
drop policy if exists fingas_avatars_public on storage.objects;
create policy fingas_avatars_public on storage.objects
  for select to anon
  using (bucket_id = 'avatars');
