import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getMockKarystosSpots } from '@/lib/demoMockData';

// Upper bound on how old a spot can be and still show on the driver map --
// RLS's expires_at TTL (0007_five_minute_spot_ttl.sql) already caps this at
// 5 minutes for OTHER drivers' spots, but the caller's own spots are
// visible at any age/status (parking_spots_select_own), which is what was
// actually cluttering the map: a user's entire history of long-expired/
// claimed spots, piling up forever with no time bound at all.
const MAX_SPOT_AGE_MINUTES = 30;

export interface NearbySpot {
  id: string;
  declared_by: string;
  lat: number;
  lng: number;
  status: 'active' | 'claimed' | 'expired' | 'invalid' | 'reported';
  declared_at: string;
  expires_at: string;
}

// PostGIS returns `location` as WKB hex over PostgREST; parsing the small,
// fixed "SRID=4326;POINT" subset we ever write is simpler than pulling in a
// WKB parser for one field.
function parseEwkbPoint(hex: string): { lat: number; lng: number } | null {
  try {
    const buf = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const view = new DataView(buf.buffer);
    const littleEndian = buf[0] === 1;
    const lng = view.getFloat64(9, littleEndian);
    const lat = view.getFloat64(17, littleEndian);
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Live list of parking spots this user is allowed to see (RLS: public active
 * spots + the user's own, regardless of hidden/expired state). Refetches on
 * mount and stays in sync via Realtime for as long as the tab is open.
 */
export function useNearbySpots() {
  const { session, isDemoAccount } = useAuth();
  const [spots, setSpots] = useState<NearbySpot[]>([]);

  useEffect(() => {
    if (!session?.user) {
      setSpots([]);
      return;
    }

    let cancelled = false;

    interface SpotRow {
      id: string;
      declared_by: string;
      location: string;
      status: NearbySpot['status'];
      declared_at: string;
      expires_at: string;
    }

    const mapRow = (row: SpotRow): NearbySpot | null => {
      const point = parseEwkbPoint(row.location);
      if (!point) return null;
      return {
        id: row.id,
        declared_by: row.declared_by,
        lat: point.lat,
        lng: point.lng,
        status: row.status,
        declared_at: row.declared_at,
        expires_at: row.expires_at,
      };
    };

    const load = async () => {
      // public_parking_spots (the view this used to query) does not exist in
      // the database -- querying it always failed with a silent "relation
      // does not exist" error that this function swallowed, so the map
      // showed zero spots for every user. Querying parking_spots directly is
      // safe and equivalent: RLS (see 0004_anti_spam_support.sql) already
      // restricts SELECT to public/active/non-shadow-hidden rows plus the
      // caller's own declared/claimed rows -- the exact shadowban filtering
      // the view comment described, just enforced at the table level.
      //
      // status='active' + a recency floor keeps this to what a driver
      // actually cares about ("what's free right now") -- without them, the
      // caller's own claimed/expired spots (visible at any age via
      // parking_spots_select_own) accumulated on the map forever, and an
      // already-claimed spot could wrongly surface as "nearest claimable".
      const cutoff = new Date(Date.now() - MAX_SPOT_AGE_MINUTES * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('parking_spots')
        .select('id, declared_by, location, status, declared_at, expires_at')
        .eq('status', 'active')
        .gte('declared_at', cutoff);
      if (error) {
        console.error('[useNearbySpots] failed to load spots:', error);
        return;
      }
      if (!cancelled && data) {
        const real = data.map(mapRow).filter((s): s is NearbySpot => s !== null);
        // Investor-pitch mock pins for the shared demo account only, layered
        // on top of whatever's genuinely in the database -- see
        // src/lib/demoMockData.ts. Never touches a real user's session.
        setSpots(isDemoAccount ? [...real, ...getMockKarystosSpots()] : real);
      }
    };

    load();

    // Realtime can only target real tables, not views -- but any change to
    // parking_spots (new declaration, claim, expiry) still means this view's
    // results may have changed, so just refetch through the view on any event.
    const channel = supabase
      .channel('nearby-spots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_spots' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session?.user, isDemoAccount]);

  return spots;
}
