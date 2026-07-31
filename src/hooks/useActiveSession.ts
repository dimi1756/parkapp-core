import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeolocation } from './useGeolocation';
import { checkLazyUnpark } from '@/lib/api/parking';
import { toast } from '@/hooks/use-toast';

interface ActiveSession {
  id: string;
  spot_id: string | null;
  parked_at: string;
}

/**
 * Tracks the user's current "parked" session and runs the Lazy Auto-Unpark
 * check (Sprint 0: no background GPS tracking on a PWA -- instead we check
 * on every app resume/focus) whenever the tab becomes visible again.
 */
export function useActiveSession() {
  const { session: authSession, isDemoAccount } = useAuth();
  const { t } = useLanguage();
  const { getCurrentPosition } = useGeolocation();
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!authSession?.user) {
      setActiveSession(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('parking_sessions')
      .select('id, spot_id, parked_at')
      .eq('user_id', authSession.user.id)
      .is('unparked_at', null)
      .maybeSingle();
    setActiveSession(data);
    setLoading(false);
  }, [authSession?.user]);

  const runLazyUnparkCheck = useCallback(async () => {
    if (!authSession?.user) return;
    // Demo reviewers "park" wherever the map is looking, while their real
    // device can be anywhere on Earth — running the distance check would
    // instantly (and confusingly) auto-unpark them. Manual unpark still works.
    if (isDemoAccount) return;
    try {
      const { lat, lng } = await getCurrentPosition();
      const { data } = await checkLazyUnpark({ lat, lng });
      if (data?.autoUnparked) {
        toast({
          title: t('session.autoUnparkTitle'),
          description: t('session.autoUnparkDesc'),
        });
        setActiveSession(null);
      }
    } catch {
      // No geolocation permission: nothing we can verify, leave the session as-is.
    }
  }, [authSession?.user, isDemoAccount, getCurrentPosition, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!authSession?.user) return;
    runLazyUnparkCheck();

    const onVisible = () => {
      if (document.visibilityState === 'visible') runLazyUnparkCheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', runLazyUnparkCheck);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', runLazyUnparkCheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.user]);

  return { activeSession, loading, refetch };
}
