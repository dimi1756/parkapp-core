import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getMockDemoSpots } from '@/lib/demoMockData';
import { SPOT_SWEEP_INTERVAL_MS, isSpotOnMap, spotPhase } from '@/lib/spotLifecycle';
// Shared with the activity history, which reads the same location column.
import { parseEwkbPoint } from '@/lib/ewkb';

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
  /**
   * True only for the investor-demo pins layered in below (getMockDemoSpots)
   * -- they render on the map like any real spot, but their `id` doesn't
   * correspond to an actual parking_spots row, so any code path that ends in
   * an actual claimSpot()/declareSpot() call against this id must exclude it
   * first. Undefined (not false) for every real row, straight from Postgres.
   */
  isMock?: boolean;
  /** True when this driver (not someone else) currently holds the spot's reservation. */
  reservedByMe?: boolean;
  /**
   * True for the last few seconds of the spot's life -- the map animates
   * these out instead of letting them vanish between one frame and the next.
   * See src/lib/spotLifecycle.ts.
   */
  fading?: boolean;
}

/**
 * Identity of the rendered list: which spots, and which of them are fading.
 * The sweep below compares this rather than the objects, so a tick that
 * changes nothing hands back the exact same array and the map's pin effect
 * has nothing to do.
 */
function listSignature(spots: NearbySpot[]): string {
  return spots.map((s) => `${s.id}${s.fading ? '~' : ''}`).join(',');
}

/**
 * Stamps the current phase onto each spot and drops the ones that are done.
 *
 * The demo account's mock pins are deliberately exempt. They are minted
 * relative to the moment they are generated (see buildMockSpots) with
 * expiries 40 to 240 seconds out, so sweeping them would wipe the
 * presentation's scenery off the map within the first few minutes and only
 * bring it back on the next unrelated refetch. They are props, not
 * declarations -- nobody is being routed to a spot that has gone stale,
 * because there is no spot. Anything real, including the demo account's own
 * declarations (which are genuine rows with a genuine server TTL), expires
 * normally, so the fade is still demonstrable on the account it matters for.
 */
function pruneToNow(spots: NearbySpot[], now: number): NearbySpot[] {
  return spots
    .filter((spot) => spot.isMock || isSpotOnMap(spot, now))
    .map((spot) => {
      const fading = !spot.isMock && spotPhase(spot, now) === 'fading';
      return fading === Boolean(spot.fading) ? spot : { ...spot, fading };
    });
}

/**
 * Live list of parking spots this user is allowed to see (RLS: public active
 * spots + the user's own, regardless of hidden/expired state). Refetches on
 * mount and stays in sync via Realtime for as long as the tab is open.
 *
 * `refetch` covers the one case Realtime can't: the demo account's mock pins
 * live purely client-side, so "claiming" one changes nothing in Postgres and
 * fires no postgres_changes event to react to.
 */
export function useNearbySpots() {
  const { session, isDemoAccount } = useAuth();
  const [spots, setSpots] = useState<NearbySpot[]>([]);
  // Points at the current effect's `load`, so refetch keeps a stable
  // identity across renders instead of re-triggering every consumer's
  // dependency arrays.
  const loadRef = useRef<() => void>(() => {});

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
      reserved_by: string | null;
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
        reservedByMe: row.reserved_by === session.user.id,
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
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('parking_spots')
        .select('id, declared_by, location, status, declared_at, expires_at, reserved_by')
        .eq('status', 'active')
        .gte('declared_at', cutoff)
        // Excludes spots someone ELSE is currently mid-navigation-to (see
        // 0012_spot_reservations.sql/reserveSpot) -- unreserved (null),
        // expired (self-clearing TTL, no cleanup job needed), or reserved by
        // this same driver all still pass through.
        .or(`reserved_until.is.null,reserved_until.lt.${now},reserved_by.eq.${session.user.id}`);
      if (error) {
        console.error('[useNearbySpots] failed to load spots:', error);
        return;
      }
      if (!cancelled && data) {
        const real = data.map(mapRow).filter((s): s is NearbySpot => s !== null);
        // Investor-pitch mock pins for the shared demo account only, layered
        // on top of whatever's genuinely in the database -- see
        // src/lib/demoMockData.ts. Never touches a real user's session.
        const all = isDemoAccount ? [...real, ...getMockDemoSpots()] : real;
        // Pruned on arrival as well as on the tick: a spot can expire while
        // the request is in flight, and the query's own recency floor is 30
        // minutes, far looser than the 5-minute TTL the map honours.
        setSpots(pruneToNow(all, Date.now()));
      }
    };

    loadRef.current = load;
    load();

    // Expiry is a clock, not an event. Nothing in Postgres fires when a spot
    // simply gets old, so without this sweep a pin stayed on an open map
    // until some unrelated write happened to trigger a refetch -- which is
    // how the driver's own declarations ended up cluttering the map long
    // after they were no good to anyone.
    //
    // Pure client-side arithmetic over rows already in memory: no query, no
    // network. setSpots is called only when the rendered list actually
    // changes, so a tick where nothing expired returns the identical array
    // and costs the map nothing.
    const sweep = setInterval(() => {
      setSpots((current) => {
        const next = pruneToNow(current, Date.now());
        return listSignature(next) === listSignature(current) ? current : next;
      });
    }, SPOT_SWEEP_INTERVAL_MS);

    // Realtime can only target real tables, not views -- but any change to
    // parking_spots (new declaration, claim, expiry) still means this view's
    // results may have changed, so just refetch through the view on any event.
    const channel = supabase
      .channel('nearby-spots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_spots' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(sweep);
      supabase.removeChannel(channel);
    };
  }, [session?.user, isDemoAccount]);

  const refetch = useCallback(() => {
    loadRef.current();
  }, []);

  return { spots, refetch };
}
