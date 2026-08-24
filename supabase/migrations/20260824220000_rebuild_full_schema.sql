-- Reconstrução completa do esquema do Monofy.
--
-- O projeto Supabase original (ref yfqzoukrjatcgmyshtpz) deixou de existir e, como
-- as migrations antigas eram só marcadores ("aplicado pelo painel"), o DDL real nunca
-- ficou no repositório. Este arquivo reconstrói TODO o esquema a partir do que o
-- front-end e as Edge Functions realmente usam, e é idempotente: pode rodar de novo
-- num banco que já tenha parte das tabelas sem quebrar.

-- ==========================================================================
-- profiles
-- ==========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  credits integer not null default 10,
  role text not null default 'user',
  region text,
  cpf text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists credits integer not null default 10;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists region text;
alter table public.profiles add column if not exists cpf text;

alter table public.profiles enable row level security;

-- Checagem de admin isolada numa função security definer: se a policy de admin
-- consultasse public.profiles diretamente, o próprio RLS da tabela dispararia a
-- policy de novo (recursão infinita — o bug que a migration 20260620210347 corrigiu).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false);
$$;

-- Cria o perfil assim que o usuário se cadastra (e-mail/senha ou Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================================
-- credit_transactions
-- ==========================================================================
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text,
  -- id do pagamento no Mercado Pago; único para os webhooks não creditarem duas vezes
  payment_ref text unique,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions add column if not exists payment_ref text;
create unique index if not exists credit_transactions_payment_ref_key
  on public.credit_transactions (payment_ref) where payment_ref is not null;
create index if not exists credit_transactions_user_id_idx
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

-- ==========================================================================
-- subscriptions
-- ==========================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  mp_preapproval_id text unique,
  status text not null default 'pending',
  credits_per_cycle integer not null default 200,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- ==========================================================================
-- public_templates (modelos publicados na "Network")
-- ==========================================================================
create table if not exists public.public_templates (
  id uuid primary key default gen_random_uuid(),
  -- nullable de propósito: o front publica sem o id do perfil em alguns fluxos
  publisher_id uuid references public.profiles(id) on delete set null,
  publisher_name text,
  university_name text,
  template_name text not null,
  description text,
  template_data jsonb not null,
  logo_base64 text,
  downloads integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.public_templates enable row level security;

-- ==========================================================================
-- university_logos (galeria de logos mantida pelo admin)
-- ==========================================================================
create table if not exists public.university_logos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_base64 text not null,
  created_at timestamptz not null default now()
);

alter table public.university_logos enable row level security;

-- ==========================================================================
-- Policies
-- ==========================================================================
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own" on public.credit_transactions
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription" on public.subscriptions
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "public_templates_select_all" on public.public_templates;
create policy "public_templates_select_all" on public.public_templates
  for select using (true);

drop policy if exists "public_templates_admin_insert" on public.public_templates;
create policy "public_templates_admin_insert" on public.public_templates
  for insert with check (public.is_admin());

drop policy if exists "public_templates_admin_delete" on public.public_templates;
create policy "public_templates_admin_delete" on public.public_templates
  for delete using (public.is_admin());

drop policy if exists "university_logos_select_all" on public.university_logos;
create policy "university_logos_select_all" on public.university_logos
  for select using (true);

drop policy if exists "university_logos_admin_insert" on public.university_logos;
create policy "university_logos_admin_insert" on public.university_logos
  for insert with check (public.is_admin());

drop policy if exists "university_logos_admin_delete" on public.university_logos;
create policy "university_logos_admin_delete" on public.university_logos
  for delete using (public.is_admin());

-- ==========================================================================
-- RPCs
-- ==========================================================================

-- Débito atômico de créditos. Chamada pelas Edge Functions de IA ANTES de gerar:
-- trava a linha do perfil (for update), confere o saldo e registra a transação.
-- Admin não paga. Retorna false (em vez de erro) quando falta saldo.
create or replace function public.consume_credits_generic(p_user_id uuid, p_amount integer, p_reason text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  current_credits integer;
  user_role text;
begin
  select credits, role into current_credits, user_role from public.profiles where id = p_user_id for update;

  if user_role = 'admin' then
    return true;
  end if;

  if current_credits is null or current_credits < p_amount then
    return false;
  end if;

  update public.profiles set credits = credits - p_amount where id = p_user_id;

  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, -p_amount, p_reason);

  return true;
end;
$$;

create or replace function public.increment_template_downloads(template_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.public_templates set downloads = downloads + 1 where id = template_id;
$$;

create or replace function public.admin_set_credits(p_target_user_id uuid, p_new_credits integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  update public.profiles set credits = greatest(p_new_credits, 0) where id = p_target_user_id;
  if not found then
    return false;
  end if;

  insert into public.credit_transactions (user_id, amount, reason)
  values (p_target_user_id, p_new_credits, 'admin_set_credits');

  return true;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.increment_template_downloads(uuid) to authenticated;
grant execute on function public.admin_set_credits(uuid, integer) to authenticated;
grant execute on function public.consume_credits_generic(uuid, integer, text) to service_role;

-- Devolve créditos quando a geração falha DEPOIS da cobrança (a IA cobra antes de
-- gerar, então sem isso um erro do provedor queimaria os créditos do usuário).
create or replace function public.refund_credits(p_user_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  update public.profiles set credits = credits + p_amount where id = p_user_id and role <> 'admin';
  if found then
    insert into public.credit_transactions (user_id, amount, reason)
    values (p_user_id, p_amount, p_reason);
  end if;
end;
$$;

grant execute on function public.refund_credits(uuid, integer, text) to service_role;

-- As funções de crédito são exclusivas do servidor (Edge Functions com service role).
-- O grant padrão do Postgres (EXECUTE para PUBLIC) deixava refund_credits e
-- consume_credits_generic expostas em /rest/v1/rpc/... para qualquer usuário logado —
-- ou seja, qualquer um podia se creditar à vontade. Revogado explicitamente.
revoke all on function public.consume_credits_generic(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.consume_credits_generic(uuid, integer, text) to service_role;
grant execute on function public.refund_credits(uuid, integer, text) to service_role;
