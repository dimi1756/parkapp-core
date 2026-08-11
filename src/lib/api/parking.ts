import { supabase } from '@/integrations/supabase/client';

interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

// Netlify and Vercel preview deploys are still full `vite build` production
// builds -- import.meta.env.DEV is false on both, so it can't tell a preview
// apart from the real production domain. Hostname is the only reliable
// signal available in the client bundle for "this is a preview, it's safe
// (and useful) to show raw error detail here."
function isPreviewOrDev(): boolean {
  if (import.meta.env.DEV) return true;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return host.includes('netlify.app') || host.includes('vercel.app') || host === 'localhost';
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // On a non-2xx response, supabase-js throws a FunctionsHttpError and
    // leaves `data` null -- the { error: "..." } message we sent is only
    // reachable by re-reading the raw Response on error.context.
    let message = error.message;
    let status: number | undefined;
    let detail: string | undefined;
    const context = (error as { context?: Response }).context;
    if (context) {
      status = context.status;
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
        if (parsed?.detail) detail = String(parsed.detail);
      } catch {
        // Response body wasn't JSON (e.g. a network-level failure, a CORS
        // rejection, or a 404 from a function that was never deployed) --
        // fall back to whatever text is there, or keep error.message.
        try {
          const text = await context.clone().text();
          if (text) detail = text;
        } catch {
          // No body at all to read.
        }
      }
    }

    // Always logged in full, regardless of environment -- this is the one
    // place that can show the actual HTTP status and response body instead
    // of the deliberately generic string shown to end users.
    console.error(`[api:${name}] request failed`, { status, message, detail, name: error.name });

    if (isPreviewOrDev()) {
      const statusPart = status ? `HTTP ${status}` : error.name;
      const detailPart = detail && detail !== message ? ` — ${detail}` : '';
      return { data: null, error: `${message} [${statusPart}${detailPart}]` };
    }
    return { data: null, error: message };
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    console.error(`[api:${name}] function returned an error payload`, data);
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
