import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AdminAccess {
  isAdmin: boolean;
  municipalityId: string | null;
  municipalityName: string | null;
  loading: boolean;
}

/**
 * Real admin authorization, backed by the municipality_admins table via the
 * my_admin_municipality() RPC -- replaces the old "Admin Switch" that any
 * logged-in user could flip locally with no server-side check at all.
 */
export function useAdminAccess(): AdminAccess {
  const { session } = useAuth();
  const [state, setState] = useState<AdminAccess>({
    isAdmin: false,
    municipalityId: null,
    municipalityName: null,
    loading: true,
  });

  useEffect(() => {
    if (!session?.user) {
      setState({ isAdmin: false, municipalityId: null, municipalityName: null, loading: false });
      return;
    }

    let cancelled = false;
    supabase.rpc('my_admin_municipality').then(({ data }) => {
      if (cancelled) return;
      const row = data?.[0];
      setState({
        isAdmin: Boolean(row),
        municipalityId: row?.municipality_id ?? null,
        municipalityName: row?.municipality_name ?? null,
        loading: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  return state;
}
