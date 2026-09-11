import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { buildZone, type ParkingZone, type ZoneKind } from '@/lib/zones';

/**
 * The geojson_line column is plain jsonb, so it arrives typed as Json --
 * anything at all. Rows come from a table any municipality admin can write
 * to, and a malformed line would reach Mapbox as broken geometry and take
 * the whole layer down with it, so every row is validated on the way in
 * rather than trusted. Returns null for anything that isn't a usable
 * LineString, and the caller drops it.
 */
interface ZoneRow {
  id: string;
  name: string;
  type: string;
  geojson_line: Json;
  width_meters: number;
}

function parseCenterline(value: Json): [number, number][] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const line = value as { type?: unknown; coordinates?: unknown };
  if (line.type !== 'LineString' || !Array.isArray(line.coordinates)) return null;

  const points: [number, number][] = [];
  for (const point of line.coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lng, lat] = point;
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    points.push([lng, lat]);
  }
  return points.length >= 2 ? points : null;
}

function rowToZone(row: ZoneRow): ParkingZone | null {
  const centerline = parseCenterline(row.geojson_line);
  if (!centerline) return null;
  if (row.type !== 'resident' && row.type !== 'controlled') return null;

  return buildZone({
    id: row.id,
    name: row.name,
    kind: row.type as ZoneKind,
    centerline,
    widthMeters: row.width_meters,
  });
}

const SELECT_COLUMNS = 'id, name, type, geojson_line, width_meters';

/**
 * Every zone the signed-in user is allowed to see. Read-only, for the driver
 * map -- RLS lets any authenticated user read all zones, deliberately: a
 * driver arriving from another town needs the zones of the town they're
 * actually in, not the one on their profile.
 */
export function useParkingZones() {
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('parking_zones')
      .select(SELECT_COLUMNS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // A zone layer that fails to load must not block the map: the
          // driver simply doesn't see zones, and the declaration guard has
          // nothing to check against, which is the same position the app was
          // in before zones existed at all.
          console.error('[useParkingZones] failed to load zones:', error);
          setLoading(false);
          return;
        }
        setZones((data ?? []).map(rowToZone).filter((z): z is ParkingZone => z !== null));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { zones, loading };
}

export interface NewZoneInput {
  name: string;
  kind: ZoneKind;
  centerline: [number, number][];
  widthMeters: number;
}

/**
 * The municipality dashboard's read/write view of its own zones. Writes are
 * scoped by RLS to that municipality's admins (0015_parking_zones.sql), so a
 * failure here is an authorization answer, not something to work around
 * client-side.
 */
export function useAdminParkingZones(municipalityId: string | null) {
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!municipalityId) {
      setZones([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('parking_zones')
      .select(SELECT_COLUMNS)
      .eq('municipality_id', municipalityId)
      .order('created_at', { ascending: true });

    if (loadError) {
      console.error('[useAdminParkingZones] load failed:', loadError);
      setError(loadError.message);
    } else {
      setError(null);
      setZones((data ?? []).map(rowToZone).filter((z): z is ParkingZone => z !== null));
    }
    setLoading(false);
  }, [municipalityId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const createZone = useCallback(
    async (input: NewZoneInput): Promise<{ error: string | null }> => {
      if (!municipalityId) return { error: 'No municipality' };
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: insertError } = await supabase.from('parking_zones').insert({
        municipality_id: municipalityId,
        name: input.name,
        type: input.kind,
        geojson_line: { type: 'LineString', coordinates: input.centerline },
        width_meters: input.widthMeters,
        created_by: user?.id ?? null,
      });

      if (insertError) {
        console.error('[useAdminParkingZones] insert failed:', insertError);
        return { error: insertError.message };
      }
      await reload();
      return { error: null };
    },
    [municipalityId, reload]
  );

  const deleteZone = useCallback(
    async (zoneId: string): Promise<{ error: string | null }> => {
      const { error: deleteError } = await supabase.from('parking_zones').delete().eq('id', zoneId);
      if (deleteError) {
        console.error('[useAdminParkingZones] delete failed:', deleteError);
        return { error: deleteError.message };
      }
      await reload();
      return { error: null };
    },
    [reload]
  );

  return { zones, loading, error, createZone, deleteZone, reload };
}
