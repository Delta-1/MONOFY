-- Monofy as an isolated module inside the existing WORKSPACE Supabase project.
-- Auth is shared; application data and credit accounting are deliberately prefixed.

create schema if not exists private;

create table public.monofy_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  credits integer not null default 10 check (credits >= 0),
  role text not null default 'user' check (role in ('user', 'admin')),
  region text,
  cpf text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index monofy_profiles_email_unique_idx
  on public.monofy_profiles (lower(email)) where email is not null;

create table public.monofy_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.monofy_profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null,
  payment_ref text,
  created_at timestamptz not null default now()
);

create unique index monofy_credit_transactions_payment_ref_unique_idx
  on public.monofy_credit_transactions (payment_ref) where payment_ref is not null;
create index monofy_credit_transactions_user_created_idx
  on public.monofy_credit_transactions (user_id, created_at desc);

create table public.monofy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.monofy_profiles(id) on delete cascade,
  mp_preapproval_id text unique,
  status text not null default 'pending',
  credits_per_cycle integer not null default 200 check (credits_per_cycle > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.monofy_public_templates (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid references public.monofy_profiles(id) on delete set null,
  publisher_name text,
  university_name text,
  template_name text not null,
  description text,
  template_data jsonb not null,
  logo_base64 text,
  downloads integer not null default 0 check (downloads >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index monofy_public_templates_downloads_idx
  on public.monofy_public_templates (downloads desc, created_at desc);
create index monofy_public_templates_publisher_idx
  on public.monofy_public_templates (publisher_id);

create table public.monofy_university_logos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_base64 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.monofy_pipu_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.monofy_profiles(id) on delete cascade,
  memory_key text not null,
  memory_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, memory_key)
);

create index monofy_pipu_memory_user_idx on public.monofy_pipu_memory (user_id);

alter table public.monofy_profiles enable row level security;
alter table public.monofy_credit_transactions enable row level security;
alter table public.monofy_subscriptions enable row level security;
alter table public.monofy_public_templates enable row level security;
alter table public.monofy_university_logos enable row level security;
alter table public.monofy_pipu_memory enable row level security;

create or replace function private.monofy_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.monofy_profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function private.monofy_is_admin() from public, anon;
grant execute on function private.monofy_is_admin() to authenticated;

create policy monofy_profiles_select_own_or_admin
  on public.monofy_profiles for select to authenticated
  using ((select auth.uid()) = id or (select private.monofy_is_admin()));
create policy monofy_profiles_update_own
  on public.monofy_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy monofy_credit_transactions_select_own_or_admin
  on public.monofy_credit_transactions for select to authenticated
  using ((select auth.uid()) = user_id or (select private.monofy_is_admin()));

create policy monofy_subscriptions_select_own_or_admin
  on public.monofy_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id or (select private.monofy_is_admin()));

create policy monofy_public_templates_read
  on public.monofy_public_templates for select to anon, authenticated using (true);
create policy monofy_public_templates_admin_insert
  on public.monofy_public_templates for insert to authenticated
  with check ((select private.monofy_is_admin()));
create policy monofy_public_templates_admin_update
  on public.monofy_public_templates for update to authenticated
  using ((select private.monofy_is_admin()))
  with check ((select private.monofy_is_admin()));
create policy monofy_public_templates_admin_delete
  on public.monofy_public_templates for delete to authenticated
  using ((select private.monofy_is_admin()));

create policy monofy_university_logos_read
  on public.monofy_university_logos for select to anon, authenticated using (true);
create policy monofy_university_logos_admin_insert
  on public.monofy_university_logos for insert to authenticated
  with check ((select private.monofy_is_admin()));
create policy monofy_university_logos_admin_update
  on public.monofy_university_logos for update to authenticated
  using ((select private.monofy_is_admin()))
  with check ((select private.monofy_is_admin()));
create policy monofy_university_logos_admin_delete
  on public.monofy_university_logos for delete to authenticated
  using ((select private.monofy_is_admin()));

create policy monofy_pipu_memory_select_own
  on public.monofy_pipu_memory for select to authenticated
  using ((select auth.uid()) = user_id);
create policy monofy_pipu_memory_insert_own
  on public.monofy_pipu_memory for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy monofy_pipu_memory_update_own
  on public.monofy_pipu_memory for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy monofy_pipu_memory_delete_own
  on public.monofy_pipu_memory for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit Data API privileges; RLS remains the row-level boundary.
revoke all on public.monofy_profiles from anon, authenticated;
revoke all on public.monofy_credit_transactions from anon, authenticated;
revoke all on public.monofy_subscriptions from anon, authenticated;
revoke all on public.monofy_public_templates from anon, authenticated;
revoke all on public.monofy_university_logos from anon, authenticated;
revoke all on public.monofy_pipu_memory from anon, authenticated;

grant select on public.monofy_profiles to authenticated;
grant update (full_name, avatar_url, region, cpf) on public.monofy_profiles to authenticated;
grant select on public.monofy_credit_transactions to authenticated;
grant select on public.monofy_subscriptions to authenticated;
grant select on public.monofy_public_templates to anon, authenticated;
grant insert, update, delete on public.monofy_public_templates to authenticated;
grant select on public.monofy_university_logos to anon, authenticated;
grant insert, update, delete on public.monofy_university_logos to authenticated;
grant select, insert, update, delete on public.monofy_pipu_memory to authenticated;

create or replace function private.monofy_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger monofy_profiles_touch_updated_at before update on public.monofy_profiles
  for each row execute function private.monofy_touch_updated_at();
create trigger monofy_subscriptions_touch_updated_at before update on public.monofy_subscriptions
  for each row execute function private.monofy_touch_updated_at();
create trigger monofy_public_templates_touch_updated_at before update on public.monofy_public_templates
  for each row execute function private.monofy_touch_updated_at();
create trigger monofy_university_logos_touch_updated_at before update on public.monofy_university_logos
  for each row execute function private.monofy_touch_updated_at();
create trigger monofy_pipu_memory_touch_updated_at before update on public.monofy_pipu_memory
  for each row execute function private.monofy_touch_updated_at();

create or replace function private.monofy_handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_role text;
begin
  safe_role := case when exists (
    select 1 from public.super_admins s where lower(s.email) = lower(new.email)
  ) or exists (
    select 1 from public.monofy_profiles p where p.id = new.id and p.role = 'admin'
  ) then 'admin' else 'user' end;

  insert into public.monofy_profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    safe_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.monofy_profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.monofy_profiles.avatar_url),
        role = excluded.role,
        updated_at = now();
  return new;
end;
$$;

create trigger monofy_auth_user_change
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function private.monofy_handle_auth_user_change();

-- Existing WORKSPACE accounts can sign into Monofy immediately.
insert into public.monofy_profiles (id, email, full_name, avatar_url, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  case when exists (
    select 1 from public.super_admins s where lower(s.email) = lower(u.email)
  ) then 'admin' else 'user' end
from auth.users u
on conflict (id) do nothing;

create or replace function public.monofy_consume_credits_generic(
  p_user_id uuid, p_amount integer, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_credits integer;
  current_role text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado';
  end if;
  if p_user_id is null or p_amount is null or p_amount <= 0 or p_amount > 1000 then
    raise exception 'Quantidade de créditos inválida';
  end if;

  select credits, role into current_credits, current_role
  from public.monofy_profiles where id = p_user_id for update;
  if current_role = 'admin' then return true; end if;
  if current_credits is null or current_credits < p_amount then return false; end if;

  update public.monofy_profiles set credits = credits - p_amount where id = p_user_id;
  insert into public.monofy_credit_transactions (user_id, amount, reason)
  values (p_user_id, -p_amount, left(coalesce(p_reason, 'usage'), 80));
  return true;
end;
$$;

create or replace function public.monofy_refund_credits(
  p_user_id uuid, p_amount integer, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000 then return; end if;

  update public.monofy_profiles set credits = credits + p_amount
  where id = p_user_id and role <> 'admin';
  if found then
    insert into public.monofy_credit_transactions (user_id, amount, reason)
    values (p_user_id, p_amount, left(coalesce(p_reason, 'refund'), 80));
  end if;
end;
$$;

create or replace function public.monofy_apply_credit_payment(
  p_user_id uuid, p_amount integer, p_reason text, p_payment_ref text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado';
  end if;
  if p_user_id is null or p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Crédito inválido';
  end if;
  if nullif(trim(p_payment_ref), '') is null then
    raise exception 'Referência de pagamento inválida';
  end if;

  insert into public.monofy_credit_transactions (user_id, amount, reason, payment_ref)
  values (p_user_id, p_amount, left(coalesce(p_reason, 'purchase'), 80), p_payment_ref)
  on conflict (payment_ref) where payment_ref is not null do nothing
  returning id into inserted_id;
  if inserted_id is null then return false; end if;

  update public.monofy_profiles set credits = credits + p_amount where id = p_user_id;
  if not found then raise exception 'Perfil não encontrado'; end if;
  return true;
end;
$$;

create or replace function public.monofy_admin_set_credits(
  p_target_user_id uuid, p_new_credits integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_credits integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado';
  end if;
  if p_new_credits is null or p_new_credits < 0 or p_new_credits > 1000000 then
    raise exception 'Saldo inválido';
  end if;

  select credits into old_credits from public.monofy_profiles
  where id = p_target_user_id for update;
  if old_credits is null then return false; end if;

  update public.monofy_profiles set credits = p_new_credits where id = p_target_user_id;
  if p_new_credits <> old_credits then
    insert into public.monofy_credit_transactions (user_id, amount, reason)
    values (p_target_user_id, p_new_credits - old_credits, 'admin_set_credits');
  end if;
  return true;
end;
$$;

create or replace function public.monofy_increment_template_downloads(template_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.monofy_public_templates
  set downloads = downloads + 1
  where id = template_id;
$$;

revoke all on function public.monofy_consume_credits_generic(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.monofy_refund_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.monofy_apply_credit_payment(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.monofy_admin_set_credits(uuid, integer) from public, anon, authenticated;
revoke all on function public.monofy_increment_template_downloads(uuid) from public, anon, authenticated;

grant execute on function public.monofy_consume_credits_generic(uuid, integer, text) to service_role;
grant execute on function public.monofy_refund_credits(uuid, integer, text) to service_role;
grant execute on function public.monofy_apply_credit_payment(uuid, integer, text, text) to service_role;
grant execute on function public.monofy_admin_set_credits(uuid, integer) to service_role;
grant execute on function public.monofy_increment_template_downloads(uuid) to service_role;

