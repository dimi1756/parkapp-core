import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getMockDriverLeaderboard } from '@/lib/demoMockData';

export type LeaderboardPeriod = 'daily' | 'weekly';

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  points: number;
  isCurrentUser: boolean;
}

/**
 * Reads the real leaderboard_daily / leaderboard_weekly views (0001_init_schema.sql)
 * -- derived live from the points_transactions ledger, so this can never drift
 * out of sync with what actually got awarded the way a separately-maintained
 * cache table could. Scoped to the caller's own municipality when they have
 * one assigned, since "top drivers" reads as a city-local competition; falls
 * back to a global ranking for users with no municipality yet.
 */
export function useLeaderboard(period: LeaderboardPeriod, limit = 20) {
  const { profile, isDemoAccount } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Investor-pitch mock data for the shared demo account only -- see
    // src/lib/demoMockData.ts. Never touches a real user's session.
    if (isDemoAccount) {
      setEntries(getMockDriverLeaderboard(period, profile?.id));
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      // Two static branches (rather than a dynamic `.from(view)` table name)
      // so Supabase's generated types can resolve each view's real row shape
      // at compile time -- leaderboard_daily has points_today,
      // leaderboard_weekly has points_this_week, never both, and a runtime
      // table-name string can't be narrowed by TS.
      const { data, error: queryError } =
        period === 'daily'
          ? await (() => {
              let query = supabase
                .from('leaderboard_daily')
                .select('user_id, full_name, municipality_id, points_today')
                .order('points_today', { ascending: false, nullsFirst: false })
                .limit(limit);
              if (profile?.municipality_id) query = query.eq('municipality_id', profile.municipality_id);
              return query;
            })()
          : await (() => {
              let query = supabase
                .from('leaderboard_weekly')
                .select('user_id, full_name, municipality_id, points_this_week')
                .order('points_this_week', { ascending: false, nullsFirst: false })
                .limit(limit);
              if (profile?.municipality_id) query = query.eq('municipality_id', profile.municipality_id);
              return query;
            })();
      if (cancelled) return;

      if (queryError) {
        console.error(`[useLeaderboard] failed to load leaderboard_${period}:`, queryError);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      setEntries(
        (data ?? [])
          .filter((row): row is typeof row & { user_id: string; full_name: string } => !!row.user_id && !!row.full_name)
          .map((row) => ({
            userId: row.user_id,
            fullName: row.full_name,
            points: ('points_today' in row ? row.points_today : row.points_this_week) ?? 0,
            isCurrentUser: row.user_id === profile?.id,
          }))
      );
      setLoading(false);
    };

    load();

    // Any new points_transactions row can shift rankings; the view itself
    // can't be subscribed to directly, so re-run through it on any ledger change.
    const channel = supabase
      .channel(`leaderboard-${period}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'points_transactions' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [period, limit, profile?.municipality_id, profile?.id, isDemoAccount]);

  return { entries, loading, error };
}
