import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MunicipalitySettings {
  notify_high_occupancy: boolean;
  moderate_spot_threshold: number;
  full_spot_threshold: number;
  /**
   * The code residents type to unlock free Premium. Null until the
   * municipality sets one -- and while it is null no code can ever match,
   * which is why this needs to be editable here rather than in SQL.
   */
  resident_code: string | null;
}

const DEFAULTS: MunicipalitySettings = {
  notify_high_occupancy: true,
  moderate_spot_threshold: 5,
  full_spot_threshold: 15,
  resident_code: null,
};

/**
 * Real, persisted per-municipality admin settings (replaces the old static
 * placeholder Settings page). Falls back to sane defaults until the
 * municipality's first-ever save creates its row (RLS-scoped via
 * is_municipality_admin(), see 0006_municipality_settings.sql).
 */
export function useMunicipalitySettings(municipalityId: string | null) {
  const [settings, setSettings] = useState<MunicipalitySettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!municipalityId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    supabase
      .from('municipality_settings')
      .select('notify_high_occupancy, moderate_spot_threshold, full_spot_threshold, resident_code')
      .eq('municipality_id', municipalityId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Previously indistinguishable from "no settings row yet" -- both
          // silently fell back to DEFAULTS. Now the caller can tell the two
          // apart and warn that what's shown might not be what's saved.
          console.error('[useMunicipalitySettings] load failed:', error);
          setLoadError(error.message);
        } else if (data) {
          setSettings(data);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  const save = useCallback(
    async (next: MunicipalitySettings) => {
      if (!municipalityId) return { error: 'No municipality' };
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // An empty field means "no code", not a code that happens to be the
      // empty string -- which would otherwise match any all-whitespace input.
      const residentCode = next.resident_code?.trim() ? next.resident_code.trim() : null;

      const { error } = await supabase.from('municipality_settings').upsert({
        municipality_id: municipalityId,
        ...next,
        resident_code: residentCode,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });

      setSaving(false);
      if (!error) setSettings({ ...next, resident_code: residentCode });
      return { error: error?.message ?? null };
    },
    [municipalityId]
  );

  return { settings, loading, saving, save, loadError };
}
