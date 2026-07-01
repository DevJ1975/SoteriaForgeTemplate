-- Soteria Forge — tenant-scoped Storage. Object path convention: <tenant_id>/...
-- RLS on storage.objects enforces the tenant boundary; use createSignedUrl() for
-- time-limited access. Bucket is private (no public read).
insert into storage.buckets (id, name, public)
  values ('tenant-media', 'tenant-media', false)
  on conflict (id) do nothing;

-- Read: any authenticated member of the tenant that owns the first path segment.
create policy "tenant_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'tenant-media'
         and (storage.foldername(name))[1] = public.current_tenant_id()::text);

-- Write/update/delete: tenant-admins of the owning tenant only.
create policy "tenant_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-media'
              and (storage.foldername(name))[1] = public.current_tenant_id()::text
              and public.current_user_role() in ('tenant-admin','super-admin'));
create policy "tenant_media_update" on storage.objects for update to authenticated
  using (bucket_id = 'tenant-media'
         and (storage.foldername(name))[1] = public.current_tenant_id()::text
         and public.current_user_role() in ('tenant-admin','super-admin'));
create policy "tenant_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-media'
         and (storage.foldername(name))[1] = public.current_tenant_id()::text
         and public.current_user_role() in ('tenant-admin','super-admin'));
