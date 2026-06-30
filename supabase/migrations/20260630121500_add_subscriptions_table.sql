create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  mp_preapproval_id text unique,
  status text not null default 'pending', -- pending, authorized, paused, cancelled
  credits_per_cycle integer not null default 200,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);
