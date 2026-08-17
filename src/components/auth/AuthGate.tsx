import React, { ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { LoginScreen } from './LoginScreen';
import { VehicleDetailsScreen } from './VehicleDetailsScreen';
import { Loader2 } from 'lucide-react';

/**
 * Membership wall: nothing behind this gate (map, points, leaderboards, offers)
 * renders until the user has an account (PRD 1: Membership Wall). Vehicle
 * details are mandatory too, since spot-claim verification depends on them.
 */
export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { session, profile, loading, isOnboardingComplete, assignMunicipality } = useAuth();
  const { t } = useLanguage();
  const { getCurrentPosition } = useGeolocation();
  const assignAttempted = useRef(false);

  useEffect(() => {
    if (!session || !profile || profile.municipality_id || assignAttempted.current) return;
    assignAttempted.current = true;

    const assign = async () => {
      // Referral link takes priority over geolocation: /?ref=<municipality_id>
      const referralId = new URLSearchParams(window.location.search).get('ref');
      if (referralId) {
        await assignMunicipality(referralId);
        return;
      }
      try {
        const { lat, lng } = await getCurrentPosition();
        const { data } = await supabase.rpc('nearest_municipality', {
          user_lat: lat,
          user_lng: lng,
          max_km: 50,
        });
        const match = data?.[0];
        if (match?.id) await assignMunicipality(match.id);
      } catch {
        // No geolocation permission / no municipality within range: leave
        // municipality_id null, the user can be assigned manually later.
      }
    };

    assign();
  }, [session, profile, assignMunicipality, getCurrentPosition]);

  if (loading) {
    // Branded splash instead of a generic marker+spinner -- mirrors
    // LoginScreen's own logo/footer treatment so there's no visual jump if
    // this resolves straight into the login screen a moment later.
    return (
      <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col items-center justify-between py-10">
        <div aria-hidden="true" />
        <div className="flex flex-col items-center gap-4">
          <img src="/parkapp-logo.png" alt="ParkApp" className="h-16 w-auto object-contain" />
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <div className="flex items-center justify-center gap-3">
          <span className="text-base font-semibold text-foreground/80">{t('login.poweredBy')}</span>
          <img src="/urbansync-logo.jpg" alt="Urban Sync" className="h-12 w-auto object-contain" />
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  if (!isOnboardingComplete) return <VehicleDetailsScreen />;

  return <>{children}</>;
};
