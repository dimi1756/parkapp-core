import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type LeaderboardPeriod = 'daily' | 'weekly';

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  points: number;
  isCurrentUser: boolean;
}

interface LeaderboardRow {
  user_id: string;
  full_name: string;
  municipality_id: string | null;
  points_today?: number | null;
  points_this_week?: number | null;
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
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const view = period === 'daily' ? 'leaderboard_daily' : 'leaderboard_weekly';
    const pointsCol = period === 'daily' ? 'points_today' : 'points_this_week';

    const load = async () => {
      let query = supabase
        .from(view)
        .select('user_id, full_name, municipality_id, points_today, points_this_week')
        .order(pointsCol, { ascending: false, nullsFirst: false })
        .limit(limit);

      if (profile?.municipality_id) {
        query = query.eq('municipality_id', profile.municipality_id);
      }

      const { data, error: queryError } = await query;
      if (cancelled) return;

      if (queryError) {
        console.error(`[useLeaderboard] failed to load ${view}:`, queryError);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      setEntries(
        ((data ?? []) as LeaderboardRow[]).map((row) => ({
          userId: row.user_id,
          fullName: row.full_name,
          points: (period === 'daily' ? row.points_today : row.points_this_week) ?? 0,
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
  }, [period, limit, profile?.municipality_id, profile?.id]);

  return { entries, loading, error };
}
