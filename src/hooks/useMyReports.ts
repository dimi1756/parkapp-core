import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { parseEwkbPoint } from '@/lib/ewkb';
import { reverseGeocodeStreet } from '@/components/consumer/MapboxMap';
import { getMockMyReports } from '@/lib/demoMockData';

export interface MyReport {
  id: string;
  declaredAt: string;
  lng: number;
  lat: number;
  /** Street name once reverse geocoding resolves; null until then, or if it fails. */
  street: string | null;
  /** Points this declaration actually earned, from the ledger. 0 for a shadow-hidden one. */
  points: number;
}

const REPORT_LIMIT = 20;

/**
 * Street names, cached for the life of the tab.
 *
 * The history is a list of places the driver has already been, so the answer
 * for a given coordinate never changes -- re-asking Mapbox on every mount
 * would burn quota to receive the same string. Keyed to ~11m precision,
 * which is finer than any two declarations a person would read as different
 * places.
 */
const streetCache = new Map<string, string | null>();
const cacheKey = (lng: number, lat: number) => `${lng.toFixed(4)},${lat.toFixed(4)}`;

/**
 * The driver's own declarations, newest first.
 *
 * Readable without any new policy: parking_spots_select_own
 * (0004_anti_spam_support.sql) already lets a user read every spot they
 * declared at any age or status, which is exactly this list -- and is also
 * why these rows had to be given a time limit on the *map* while staying
 * available here. A spot that has expired is no use to navigate to and every
 * use as a record of what someone contributed.
 *
 * Points come from points_transactions rather than being recomputed from the
 * declaration kind: the ledger is what was actually awarded, and a
 * shadow-hidden declaration earns nothing. Showing "+10" for one of those
 * would be the app lying about a balance the driver can check on the next
 * screen.
 */
export function useMyReports() {
  const { session, isDemoAccount } = useAuth();
  const { language } = useLanguage();
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;

  const load = useCallback(async (): Promise<MyReport[]> => {
    if (!userId) return [];

    const { data: spots, error: spotsError } = await supabase
      .from('parking_spots')
      .select('id, location, declared_at')
      .eq('declared_by', userId)
      .order('declared_at', { ascending: false })
      .limit(REPORT_LIMIT);

    if (spotsError) throw new Error(spotsError.message);
    if (!spots || spots.length === 0) return [];

    const ids = spots.map((s) => s.id);
    // A missing ledger read is not fatal -- the contribution still happened,
    // and a row showing no points beats no row at all.
    const { data: ledger, error: ledgerError } = await supabase
      .from('points_transactions')
      .select('related_spot_id, delta')
      .eq('user_id', userId)
      .in('related_spot_id', ids);
    if (ledgerError) console.error('[useMyReports] points lookup failed:', ledgerError);

    const pointsBySpot = new Map<string, number>();
    for (const row of ledger ?? []) {
      if (!row.related_spot_id) continue;
      pointsBySpot.set(row.related_spot_id, (pointsBySpot.get(row.related_spot_id) ?? 0) + row.delta);
    }

    return spots.flatMap((spot) => {
      const point = parseEwkbPoint(spot.location as unknown as string);
      if (!point) return [];
      return [
        {
          id: spot.id,
          declaredAt: spot.declared_at,
          lng: point.lng,
          lat: point.lat,
          street: streetCache.get(cacheKey(point.lng, point.lat)) ?? null,
          points: pointsBySpot.get(spot.id) ?? 0,
        },
      ];
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setReports([]);
      setLoading(false);
      return;
    }

    // The demo account's history is seeded so the section has something to
    // show in a presentation -- the same treatment the leaderboard and admin
    // KPIs already get. Never touches a real user's session.
    if (isDemoAccount) {
      setReports(getMockMyReports());
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    load()
      .then(async (rows) => {
        if (cancelled) return;
        setReports(rows);
        setLoading(false);

        // Street names resolve after the list is already on screen: the rows
        // are useful with a date and a point value alone, and blocking the
        // whole section on a round trip per row would make it feel broken.
        const mapboxLanguage = language === 'gr' ? 'el' : language === 'tr' ? 'tr' : 'en';
        const named = await Promise.all(
          rows.map(async (row) => {
            const key = cacheKey(row.lng, row.lat);
            if (streetCache.has(key)) return { ...row, street: streetCache.get(key) ?? null };
            const street = await reverseGeocodeStreet(row.lng, row.lat, mapboxLanguage);
            streetCache.set(key, street);
            return { ...row, street };
          })
        );
        if (!cancelled) setReports(named);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useMyReports] failed to load reports:', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, isDemoAccount, language, load]);

  return { reports, loading, error };
}
