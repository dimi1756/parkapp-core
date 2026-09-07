-- Take EXECUTE off PUBLIC for every RPC the app only calls while signed in.
--
-- Postgres grants EXECUTE to PUBLIC on each new function, so `anon` inherited
-- all of them; revoking from `anon` by name is a no-op while that PUBLIC
-- grant stands. The grant is removed from PUBLIC and handed back explicitly.
--
-- is_municipality_admin() is deliberately excluded: RLS policies call it
-- during evaluation, and removing anon's EXECUTE would turn an empty result
-- into a permission error for anonymous reads.
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
        'redeem_resident_code', 'redeem_trial_premium', 'sync_expired_membership',
        'cancel_own_spot', 'reserve_spot', 'release_spot_reservation',
        'use_reservation_credit', 'has_resident_code', 'resident_code_hint',
        'admin_city_kpis', 'admin_live_spots', 'admin_weekly_trend'
      )
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end;
$$;
