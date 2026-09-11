-- Shows the working resident code, on the shared demo account only.
--
-- A live demo has to type a code that actually verifies, and the presenter
-- cannot read it from the app: resident_code is admin-only under RLS
-- (0006), deliberately. Printing it in the placeholder for everyone would
-- hand free Premium to anyone who opened the Plans tab, which is the exact
-- thing the code exists to prevent.
--
-- So it is returned to one specific known address on the verified JWT, and
-- to nobody else -- the same account that already carries the rate-limit,
-- road-snap and accuracy carve-outs. Every other caller gets null and keeps
-- the descriptive placeholder.
create or replace function public.resident_code_hint() returns text as $$
  select s.resident_code
  from public.municipality_settings s
  join public.profiles p on p.municipality_id = s.municipality_id
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and u.email = 'demo@parkapp.tech';
$$ language sql security definer stable set search_path = public;

grant execute on function public.resident_code_hint() to authenticated;
