import React, { ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { LoginScreen } from './LoginScreen';
import { VehicleDetailsScreen } from './VehicleDetailsScreen';
import { Loader2, MapPin } from 'lucide-react';

/**
 * Membership wall: nothing behind this gate (map, points, leaderboards, offers)
 * renders until the user has an account (PRD 1: Membership Wall). Vehicle
 * details are mandatory too, since spot-claim verification depends on them.
 */
export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { session, profile, loading, isOnboardingComplete, assignMunicipality } = useAuth();
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
    return (
      <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col items-center justify-center gap-3">
        <MapPin className="h-8 w-8 text-primary" />
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  if (!isOnboardingComplete) return <VehicleDetailsScreen />;

  return <>{children}</>;
};
