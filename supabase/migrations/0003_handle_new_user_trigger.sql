-- Auto-create the public.profiles row when a new auth.users row is created,
-- reading full_name/phone from the signUp() metadata payload. This avoids a
-- chicken-and-egg RLS problem: right after signUp() there is no session yet
-- (until the user confirms their email), so a client-side INSERT into
-- profiles would fail auth.uid() = id. A SECURITY DEFINER trigger on
-- auth.users runs as the table owner and is unaffected by RLS/session state.

create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The client no longer inserts into profiles directly on sign-up, so drop
-- the now-redundant insert policy; profiles_insert_self stays dropped since
-- all inserts happen through the trigger, keeping the ledger tables' pattern
-- (server-controlled writes) consistent for this table too.
drop policy if exists profiles_insert_self on public.profiles;
