-- Finishes the job 0020_rpc_revoke_public_execute.sql started.
--
-- That migration listed the RPCs by name and took EXECUTE off PUBLIC for
-- each. Four SECURITY DEFINER functions were not on the list and so still
-- carry Postgres's default grant to PUBLIC, which `anon` inherits:
--
--   my_admin_municipality()   -- keys off auth.uid(), returns nothing for anon
--   nearest_municipality(...)  -- returns public municipality names
--   spot_distance_meters(...)  -- distance to a spot id
--   session_distance_meters(...) -- distance to a session id
--
-- None is a serious hole: the first two are no-ops or return data that is
-- already world-readable, and the last two need a uuid the caller would have
-- to guess. But an unauthenticated caller has no business calling any of
-- them, and leaving four exceptions makes the rule harder to reason about
-- than having none.
--
-- Every caller is already signed in: my_admin_municipality and
-- nearest_municipality run from AuthGate behind a session check, and the two
-- distance functions are called by the Edge Functions with the service role.
--
-- is_municipality_admin() stays deliberately excluded, for the reason 0020
-- gives: RLS policies call it during evaluation, and removing anon's EXECUTE
-- turns an empty result into a permission error on anonymous reads.
-- st_estimatedextent is PostGIS's own and is not ours to change.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'my_admin_municipality', 'nearest_municipality',
        'spot_distance_meters', 'session_distance_meters'
      )
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end;
$$;
