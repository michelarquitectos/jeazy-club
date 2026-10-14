-- Jeazy Club - reenvío seguro del expediente.
-- Ejecutar una sola vez después de 003_manual_transfer_workflow.sql.

-- La sustitución pasa por una función controlada para impedir que el socio
-- cambie por su cuenta el resultado de la revisión documental.
drop policy if exists "identity_metadata_update_own" on public.identity_documents;

create or replace function public.submit_identity_document(p_document_side text, p_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión activa';
  end if;
  if p_document_side not in ('front', 'back') then
    raise exception 'Lado de identificación no válido';
  end if;
  if p_storage_path not like auth.uid()::text || '/%' then
    raise exception 'Ruta de archivo no válida';
  end if;

  insert into public.identity_documents (user_id, document_side, storage_path, review_status)
  values (auth.uid(), p_document_side, p_storage_path, 'pending')
  on conflict (user_id, document_side) do update
  set storage_path = excluded.storage_path,
      review_status = 'pending',
      created_at = now();
  return true;
end;
$$;

revoke all on function public.submit_identity_document(text, text) from public;
grant execute on function public.submit_identity_document(text, text) to authenticated;

-- Permite retirar versiones anteriores de archivos que pertenecen a la misma cuenta.
drop policy if exists "identity_files_delete_own_folder" on storage.objects;
create policy "identity_files_delete_own_folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'identity-documents'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile_photo_delete_own" on storage.objects;
create policy "profile_photo_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Evita que una cuenta cambie directamente el estado de su solicitud.
drop policy if exists "applications_update_own" on public.membership_applications;

create or replace function public.submit_membership_application()
returns table (application_code text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión activa';
  end if;

  return query
  insert into public.membership_applications (user_id, status, submitted_at, reviewed_at)
  values (auth.uid(), 'submitted', now(), null)
  on conflict (user_id) do update
  set status = 'submitted',
      submitted_at = now(),
      reviewed_at = null
  returning membership_applications.application_code;
end;
$$;

revoke all on function public.submit_membership_application() from public;
grant execute on function public.submit_membership_application() to authenticated;
