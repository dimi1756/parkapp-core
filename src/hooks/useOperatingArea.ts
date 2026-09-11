import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { OperatingArea } from '@/lib/operatingArea';

const SELECT_COLUMNS =
  'id, name, center_lat, center_lng, operating_center_lat, operating_center_lng, operating_radius_km';

interface MunicipalityRow {
  id: string;
  name: string;
  center_lat: number | null;
  center_lng: number | null;
  operating_center_lat: number | null;
  operating_center_lng: number | null;
  operating_radius_km: number | null;
}

/**
 * The centre falls back to the municipality's own centre when no operating
 * pin has been dropped yet, so the map still has something sensible to open
 * on. The radius has no fallback on purpose: no radius means no boundary has
 * been declared, and the geofence stays off rather than inventing a limit
 * and locking drivers out.
 */
function rowToArea(row: MunicipalityRow): OperatingArea | null {
  const lat = row.operating_center_lat ?? row.center_lat;
  const lng = row.operating_center_lng ?? row.center_lng;
  const radius = row.operating_radius_km;
  if (lat == null || lng == null || radius == null) return null;
  return { center: [lng, lat], radiusKm: Number(radius) };
}

/**
 * The covered area for the signed-in driver's own municipality.
 *
 * Returns null while loading, and null for an account with no municipality
 * or a city that hasn't set a boundary -- callers treat that as "no
 * geofence", never as "everywhere is out of bounds".
 */
export function useOperatingArea() {
  const { profile } = useAuth();
  const municipalityId = profile?.municipality_id ?? null;

  const [area, setArea] = useState<OperatingArea | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!municipalityId) {
      setArea(null);
      setCityName(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    supabase
      .from('municipalities')
      .select(SELECT_COLUMNS)
      .eq('id', municipalityId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[useOperatingArea] load failed:', error);
        } else if (data) {
          setArea(rowToArea(data as MunicipalityRow));
          setCityName(data.name);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  return { area, cityName, loading };
}

/**
 * The admin dashboard's read/write view of its own municipality's area.
 * Writes are scoped by RLS to that municipality's admins
 * (0016_operating_area.sql).
 */
export function useAdminOperatingArea(municipalityId: string | null) {
  const [area, setArea] = useState<OperatingArea | null>(null);
  const [cityCenter, setCityCenter] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!municipalityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('municipalities')
      .select(SELECT_COLUMNS)
      .eq('id', municipalityId)
      .maybeSingle();

    if (error) {
      console.error('[useAdminOperatingArea] load failed:', error);
    } else if (data) {
      const row = data as MunicipalityRow;
      setArea(rowToArea(row));
      setCityCenter(row.center_lng != null && row.center_lat != null ? [row.center_lng, row.center_lat] : null);
    }
    setLoading(false);
  }, [municipalityId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (next: OperatingArea): Promise<{ error: string | null }> => {
      if (!municipalityId) return { error: 'No municipality' };
      setSaving(true);
      const { error } = await supabase
        .from('municipalities')
        .update({
          operating_center_lng: next.center[0],
          operating_center_lat: next.center[1],
          operating_radius_km: next.radiusKm,
        })
        .eq('id', municipalityId);
      setSaving(false);

      if (error) {
        console.error('[useAdminOperatingArea] save failed:', error);
        return { error: error.message };
      }
      setArea(next);
      return { error: null };
    },
    [municipalityId]
  );

  return { area, cityCenter, loading, saving, save, reload };
}
