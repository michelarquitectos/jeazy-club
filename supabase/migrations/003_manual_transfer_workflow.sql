-- Jeazy Club - flujo manual seguro de transferencias y referencias.
-- Ejecutar una sola vez después de 001 y 002 desde Supabase > SQL Editor.

create or replace function public.generate_application_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  new_code text;
begin
  loop
    new_code := 'JZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.membership_applications where application_code = new_code
    );
  end loop;
  return new_code;
end;
$$;

alter table public.membership_applications
  add column if not exists application_code text,
  add column if not exists payment_due_at timestamptz;

update public.membership_applications
set application_code = public.generate_application_code()
where application_code is null;

alter table public.membership_applications
  alter column application_code set default public.generate_application_code(),
  alter column application_code set not null;

create unique index if not exists membership_applications_application_code_key
  on public.membership_applications (application_code);

create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.membership_events enable row level security;

drop policy if exists "admins_read_membership_events" on public.membership_events;
create policy "admins_read_membership_events" on public.membership_events
for select to authenticated
using (public.is_jeazy_admin());

drop policy if exists "members_read_own_events" on public.membership_events;
create policy "members_read_own_events" on public.membership_events
for select to authenticated
using (user_id = (select auth.uid()));

-- El código deja de ser un comprobante y nunca podrá activar una cuenta.
revoke all on function public.redeem_payment_code(text) from public;
revoke all on function public.redeem_payment_code(text) from authenticated;

create or replace function public.admin_review_application(p_user_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  document_count integer;
begin
  if not public.is_jeazy_admin() then
    raise exception 'Acceso administrativo requerido';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisión no válida';
  end if;

  select count(*) into document_count
  from public.identity_documents
  where user_id = p_user_id
    and document_side in ('front', 'back');

  if p_decision = 'approved' and document_count <> 2 then
    raise exception 'Se requieren ambos lados de la identificación';
  end if;

  update public.identity_documents
  set review_status = p_decision
  where user_id = p_user_id;

  update public.membership_applications
  set status = p_decision, reviewed_at = now()
  where user_id = p_user_id;

  insert into public.membership_events (user_id, event_type, actor_id, metadata)
  values (p_user_id, 'identity_' || p_decision, auth.uid(), jsonb_build_object('documents', document_count));

  return true;
end;
$$;

revoke all on function public.admin_review_application(uuid, text) from public;
grant execute on function public.admin_review_application(uuid, text) to authenticated;

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
    raise exception 'Primero debe aprobarse la identidad';
  end if;

  select count(*) into approved_documents
  from public.identity_documents
  where user_id = p_user_id and review_status = 'approved';

  if approved_documents <> 2 then
    raise exception 'La identificación no está completamente aprobada';
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
    (p_user_id, 'transfer', application_row.application_code, 142000, 15, 'confirmed', now(), auth.uid())
  on conflict (user_id) do update
  set method = 'transfer',
      verification_code = excluded.verification_code,
      amount_cents = excluded.amount_cents,
      discount_percent = excluded.discount_percent,
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
  values (p_user_id, 'transfer_confirmed', auth.uid(), jsonb_build_object(
    'application_code', application_row.application_code,
    'amount_cents', 142000
  ));

  return true;
end;
$$;

revoke all on function public.admin_confirm_transfer(uuid) from public;
grant execute on function public.admin_confirm_transfer(uuid) to authenticated;

