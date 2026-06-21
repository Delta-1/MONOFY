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
