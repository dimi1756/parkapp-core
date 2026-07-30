import { supabase } from '@/integrations/supabase/client';

interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // On a non-2xx response, supabase-js throws a FunctionsHttpError and
    // leaves `data` null -- the { error: "..." } message we sent is only
    // reachable by re-reading the raw Response on error.context.
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // Response body wasn't JSON (e.g. a network-level failure) -- keep error.message.
      }
    }
    return { data: null, error: message };
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { data: null, error: String((data as { error: string }).error) };
  }
  return { data: data as T, error: null };
}

export interface DeclareSpotResult {
  spot: { id: string; status: string; declared_at: string; expires_at: string };
  pointsAwarded: number;
}

export function declareSpot(params: {
  spotLat: number;
  spotLng: number;
  userLat: number;
  userLng: number;
  accuracy: number;
  kind?: 'vacating' | 'spotted';
}) {
  return invoke<DeclareSpotResult>('declare-spot', params);
}

export interface ClaimSpotResult {
  session: { id: string; parked_at: string };
}

export function claimSpot(params: { spotId: string; userLat: number; userLng: number; accuracy: number }) {
  return invoke<ClaimSpotResult>('claim-spot', params);
}

export function manualUnpark() {
  return invoke<{ pointsAwarded: number }>('manual-unpark', {});
}

export function checkLazyUnpark(params: { lat: number; lng: number }) {
  return invoke<{ autoUnparked: boolean }>('check-lazy-unpark', params);
}

export async function reportSpot(spotId: string, reason: 'taken' | 'fake' | 'invalid_location') {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('spot_reports')
    .insert({ spot_id: spotId, reason, reported_by: session.user.id });
  return { error: error?.message ?? null };
}
