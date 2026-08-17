import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AdminAccess {
  isAdmin: boolean;
  municipalityId: string | null;
  municipalityName: string | null;
  loading: boolean;
  /** Set when the RPC itself failed (network/server error) -- distinct from
   *  "isAdmin: false", which means the check succeeded and the answer is no. */
  error: string | null;
}

const IDLE_STATE: AdminAccess = {
  isAdmin: false,
  municipalityId: null,
  municipalityName: null,
  loading: false,
  error: null,
};

/**
 * Real admin authorization, backed by the municipality_admins table via the
 * my_admin_municipality() RPC -- replaces the old "Admin Switch" that any
 * logged-in user could flip locally with no server-side check at all.
 */
export function useAdminAccess(): AdminAccess {
  const { session } = useAuth();
  const [state, setState] = useState<AdminAccess>({ ...IDLE_STATE, loading: true });

  useEffect(() => {
    if (!session?.user) {
      setState(IDLE_STATE);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    // Two-argument .then handles both a resolved-with-error response AND an
    // outright rejected promise (e.g. a network failure) -- without the
    // second handler, a rejection here left `loading` true forever with no
    // error surfaced anywhere (the admin dashboard's spinner never resolved).
    supabase.rpc('my_admin_municipality').then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[useAdminAccess] my_admin_municipality failed:', error);
          setState({ ...IDLE_STATE, error: error.message });
          return;
        }
        const row = data?.[0];
        setState({
          isAdmin: Boolean(row),
          municipalityId: row?.municipality_id ?? null,
          municipalityName: row?.municipality_name ?? null,
          loading: false,
          error: null,
        });
      },
      (err) => {
        if (cancelled) return;
        console.error('[useAdminAccess] my_admin_municipality rejected:', err);
        setState({ ...IDLE_STATE, error: err instanceof Error ? err.message : 'Request failed' });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  return state;
}
