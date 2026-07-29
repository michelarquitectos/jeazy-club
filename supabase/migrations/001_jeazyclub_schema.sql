-- Jeazy Club - estructura inicial de datos y seguridad
-- Ejecutar una sola vez desde Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  birth_date date,
  phone text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id)
);

create table if not exists public.identity_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_side text not null check (document_side in ('front', 'back')),
  storage_path text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (user_id, document_side)
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  title text not null,
  storage_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (slug, version)
);

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legal_document_id uuid not null references public.legal_documents(id),
  signer_name text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, legal_document_id)
);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'cancelled')),
  member_number text unique,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.membership_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 9),
  expected_name text,
  expires_at timestamptz,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.membership_applications enable row level security;
alter table public.identity_documents enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_codes enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "applications_select_own" on public.membership_applications;
create policy "applications_select_own"
on public.membership_applications for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "applications_insert_own" on public.membership_applications;
create policy "applications_insert_own"
on public.membership_applications for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "identity_metadata_select_own" on public.identity_documents;
create policy "identity_metadata_select_own"
on public.identity_documents for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "identity_metadata_insert_own" on public.identity_documents;
create policy "identity_metadata_insert_own"
on public.identity_documents for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "active_legal_documents_read" on public.legal_documents;
create policy "active_legal_documents_read"
on public.legal_documents for select to authenticated
using (is_active = true);

drop policy if exists "legal_acceptances_select_own" on public.legal_acceptances;
create policy "legal_acceptances_select_own"
on public.legal_acceptances for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "legal_acceptances_insert_own" on public.legal_acceptances;
create policy "legal_acceptances_insert_own"
on public.legal_acceptances for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "memberships_select_own" on public.memberships;
create policy "memberships_select_own"
on public.memberships for select to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('identity-documents', 'identity-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "identity_files_upload_own_folder" on storage.objects;
create policy "identity_files_upload_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'identity-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "identity_files_read_own_folder" on storage.objects;
create policy "identity_files_read_own_folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'identity-documents'
  and owner_id = (select auth.uid())::text
);

create or replace function public.redeem_membership_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_code public.membership_codes;
begin
  select *
  into selected_code
  from public.membership_codes
  where code = upper(trim(p_code))
    and redeemed_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if selected_code.id is null then
    return false;
  end if;

  update public.membership_codes
  set redeemed_by = auth.uid(), redeemed_at = now()
  where id = selected_code.id;

  insert into public.memberships (user_id, status, member_number, activated_at)
  values (auth.uid(), 'active', selected_code.code, now())
  on conflict (user_id) do update
  set status = 'active',
      member_number = excluded.member_number,
      activated_at = coalesce(public.memberships.activated_at, now());

  return true;
end;
$$;

revoke all on function public.redeem_membership_code(text) from public;
grant execute on function public.redeem_membership_code(text) to authenticated;

insert into public.membership_codes (code, expected_name)
values ('000000001', 'Juan Ramon Velazquez Romo')
on conflict (code) do nothing;

insert into public.legal_documents (slug, version, title, storage_path)
values
  ('associated-documents', '1.0', 'Paquete de documentos para asociados', 'Jeazy_Club_Paquete_Documentos_Asociados.pdf'),
  ('nda', '1.0', 'Acuerdo de confidencialidad (NDA)', 'NDA_Jeazy_Private_Final.pdf')
on conflict (slug, version) do update
set title = excluded.title,
    storage_path = excluded.storage_path,
    is_active = true;
