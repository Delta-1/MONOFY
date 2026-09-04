-- Monofy personal mode: do not mirror WORKSPACE Auth users into Monofy.
-- WORKSPACE accounts remain untouched; only the isolated Monofy profile mirror is cleared.

drop trigger if exists monofy_auth_user_change on auth.users;
drop function if exists private.monofy_handle_auth_user_change();
truncate table public.monofy_profiles cascade;
