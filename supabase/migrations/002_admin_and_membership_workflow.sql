-- Jeazy Club - expediente ampliado, administradores y flujo seguro de membresía.
-- Ejecutar después de 001_jeazyclub_schema.sql en Supabase > SQL Editor.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists profile_photo_path text;

create table if not exists public.payment_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null default 'transfer' check (method in ('transfer', 'card', 'manual')),
  verification_code text unique,
  amount_cents integer not null default 142000 check (amount_cents >= 0),
  discount_percent numeric(5,2) not null default 15,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.admin_users enable row level security;
alter table public.payment_verifications enable row level security;

create or replace function public.is_jeazy_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_jeazy_admin() from public;
grant execute on function public.is_jeazy_admin() to authenticated;

drop policy if exists "admins_read_self" on public.admin_users;
create policy "admins_read_self" on public.admin_users
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "admins_read_profiles" on public.profiles;
create policy "admins_read_profiles" on public.profiles
for select to authenticated
using (public.is_jeazy_admin());

drop policy if exists "admins_update_profiles" on public.profiles;
create policy "admins_update_profiles" on public.profiles
for update to authenticated
using (public.is_jeazy_admin())
with check (public.is_jeazy_admin());

drop policy if exists "admins_read_applications" on public.membership_applications;
create policy "admins_read_applications" on public.membership_applications
for select to authenticated
using (public.is_jeazy_admin());

drop policy if exists "admins_update_applications" on public.membership_applications;
create policy "admins_update_applications" on public.membership_applications
for update to authenticated
using (public.is_jeazy_admin())
with check (public.is_jeazy_admin());

drop policy if exists "applications_update_own" on public.membership_applications;
create policy "applications_update_own" on public.membership_applications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "admins_read_identity_metadata" on public.identity_documents;
create policy "admins_read_identity_metadata" on public.identity_documents
for select to authenticated
using (public.is_jeazy_admin());

drop policy if exists "admins_update_identity_metadata" on public.identity_documents;
create policy "admins_update_identity_metadata" on public.identity_documents
for update to authenticated
using (public.is_jeazy_admin())
with check (public.is_jeazy_admin());

drop policy if exists "admins_read_legal_acceptances" on public.legal_acceptances;
create policy "admins_read_legal_acceptances" on public.legal_acceptances
for select to authenticated
using (public.is_jeazy_admin());

drop policy if exists "admins_read_memberships" on public.memberships;
create policy "admins_read_memberships" on public.memberships
for select to authenticated
using (public.is_jeazy_admin());

drop policy if exists "admins_manage_memberships" on public.memberships;
create policy "admins_manage_memberships" on public.memberships
for all to authenticated
using (public.is_jeazy_admin())
with check (public.is_jeazy_admin());

drop policy if exists "payments_select_own" on public.payment_verifications;
create policy "payments_select_own" on public.payment_verifications
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "admins_manage_payments" on public.payment_verifications;
create policy "admins_manage_payments" on public.payment_verifications
for all to authenticated
using (public.is_jeazy_admin())
with check (public.is_jeazy_admin());

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "profile_photo_upload_own" on storage.objects;
create policy "profile_photo_upload_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile_photo_read_own" on storage.objects;
create policy "profile_photo_read_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
);

drop policy if exists "admins_read_profile_photos" on storage.objects;
create policy "admins_read_profile_photos" on storage.objects
for select to authenticated
using (bucket_id = 'profile-photos' and public.is_jeazy_admin());

drop policy if exists "admins_read_identity_files" on storage.objects;
create policy "admins_read_identity_files" on storage.objects
for select to authenticated
using (bucket_id = 'identity-documents' and public.is_jeazy_admin());

create or replace function public.redeem_payment_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_payment public.payment_verifications;
begin
  select * into selected_payment
  from public.payment_verifications
  where verification_code = upper(trim(p_code))
    and user_id = (select auth.uid())
    and status = 'pending'
  for update;

  if selected_payment.id is null then
    return false;
  end if;

  update public.payment_verifications
  set status = 'confirmed', confirmed_at = now()
  where id = selected_payment.id;

  insert into public.memberships (user_id, status, activated_at)
  values ((select auth.uid()), 'active', now())
  on conflict (user_id) do update
  set status = 'active', activated_at = coalesce(public.memberships.activated_at, now());

  return true;
end;
$$;

revoke all on function public.redeem_payment_code(text) from public;
grant execute on function public.redeem_payment_code(text) to authenticated;

-- Administrador inicial. Se insertará únicamente si esa cuenta ya existe en Auth.
insert into public.admin_users (user_id, email)
select id, email from auth.users
where lower(email) = 'jeazyclubmx@gmail.com'
on conflict (user_id) do update set email = excluded.email;

-- Código de transferencia de demostración para Juan Ramón, si su cuenta ya existe.
insert into public.payment_verifications (user_id, verification_code, status)
select p.id, 'JR1420MX1', 'pending'
from public.profiles p
where lower(p.full_name) = 'juan ramon velazquez romo'
on conflict (user_id) do update set verification_code = excluded.verification_code;
