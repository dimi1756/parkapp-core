-- Chunk 3.5 (PARKAPP_MASTER_PLAN.md): "City Leaderboard" -- ranks
-- municipalities by total points their drivers have generated, replacing
-- the LeaderboardTab "Coming Soon" placeholder. Same pattern as
-- leaderboard_daily/leaderboard_weekly (0001_init_schema.sql): a plain view
-- derived live from the points_transactions ledger, so it can never drift
-- out of sync with what was actually awarded.

create view public.city_leaderboard as
  select
    m.id as municipality_id,
    m.name as municipality_name,
    coalesce(sum(pt.delta) filter (where pt.delta > 0), 0) as total_points
  from public.municipalities m
  left join public.profiles p on p.municipality_id = m.id
  left join public.points_transactions pt on pt.user_id = p.id
  group by m.id, m.name
  order by total_points desc;
