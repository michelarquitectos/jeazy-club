-- Jeazy Club - elimina importes no confirmados del flujo administrativo.
-- Ejecutar una sola vez después de 004_secure_resubmission_workflow.sql.

alter table public.payment_verifications
  alter column amount_cents drop not null,
  alter column amount_cents drop default,
  alter column discount_percent drop not null,
  alter column discount_percent drop default;

create or replace function public.admin_confirm_transfer(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  application_row public.membership_applications;
  approved_documents integer;
  accepted_documents integer;
begin
  if not public.is_jeazy_admin() then
    raise exception 'Acceso administrativo requerido';
  end if;

  select * into application_row
  from public.membership_applications
  where user_id = p_user_id
  for update;

  if application_row.id is null or application_row.status <> 'approved' then
    raise exception 'Primero debe aprobarse la documentación';
  end if;

  select count(*) into approved_documents
  from public.identity_documents
  where user_id = p_user_id and review_status = 'approved';

  if approved_documents <> 2 then
    raise exception 'La identificación no está completamente revisada';
  end if;

  select count(*) into accepted_documents
  from public.legal_acceptances
  where user_id = p_user_id;

  if accepted_documents < 2 then
    raise exception 'Faltan documentos legales por aceptar';
  end if;

  insert into public.payment_verifications
    (user_id, method, verification_code, amount_cents, discount_percent, status, confirmed_at, confirmed_by)
  values
    (p_user_id, 'manual', application_row.application_code, null, null, 'confirmed', now(), auth.uid())
  on conflict (user_id) do update
  set method = 'manual',
      verification_code = excluded.verification_code,
      amount_cents = null,
      discount_percent = null,
      status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = auth.uid();

  insert into public.memberships (user_id, status, member_number, activated_at)
  values (p_user_id, 'active', application_row.application_code, now())
  on conflict (user_id) do update
  set status = 'active',
      member_number = excluded.member_number,
      activated_at = coalesce(public.memberships.activated_at, now());

  insert into public.membership_events (user_id, event_type, actor_id, metadata)
  values (p_user_id, 'manual_confirmation', auth.uid(), jsonb_build_object(
    'application_code', application_row.application_code,
    'amount_status', 'not_published'
  ));

  return true;
end;
$$;

revoke all on function public.admin_confirm_transfer(uuid) from public;
grant execute on function public.admin_confirm_transfer(uuid) to authenticated;
