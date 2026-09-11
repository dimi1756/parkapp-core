import React, { useCallback, useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface GeofenceSpot {
  id: string;
  lat: number;
  lng: number;
}

interface GeofenceModalProps {
  spot: GeofenceSpot;
  /** Called when user says YES and the server confirms. Carries points awarded. */
  onConfirmed: (pointsAwarded: number, nextSpot?: GeofenceSpot) => void;
  /** Called when user says NO. Parent should route to next nearest pin. */
  onDeclined: () => void;
  /** Called when user closes without deciding. */
  onDismiss: () => void;
  /** Shown when we have a fallback partner-parking option after a NO. */
  partnerParkingAvailable?: boolean;
}

export const GeofenceModal = ({
  spot,
  onConfirmed,
  onDeclined,
  onDismiss,
  partnerParkingAvailable = false,
}: GeofenceModalProps) => {
  const { refreshProfile } = useAuth();
  const [confirming, setConfirming] = useState(false);

  const handleYes = useCallback(async () => {
    if (confirming) return;
    setConfirming(true);

    const { data, error } = await supabase.rpc('confirm_spot_arrival', {
      p_spot_id: spot.id,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes('SPOT_NOT_AVAILABLE')) {
        toast({
          title: 'Spot already taken',
          description: 'Someone else just claimed it. Routing to the next pin.',
          variant: 'destructive',
        });
        // Treat like a NO so the parent re-routes
        setConfirming(false);
        onDeclined();
        return;
      }
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setConfirming(false);
      return;
    }

    // data is jsonb: { points_awarded, multiplier, reporter_id }
    const result = data as { points_awarded: number; multiplier: number };
    await refreshProfile();

    onConfirmed(result.points_awarded);
  }, [spot.id, confirming, onConfirmed, onDeclined, refreshProfile]);

  const handleNo = useCallback(() => {
    // Token is NOT consumed. The parent must re-route to the next nearest pin.
    onDeclined();
  }, [onDeclined]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 pb-safe">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
        aria-hidden
      />

      <div className="relative w-full max-w-sm bg-background rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in">
        {/* Pulse ring accent */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-primary/20 blur-2xl pointer-events-none" />

        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 pt-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4 ring-4 ring-primary/10">
            <Navigation className="h-8 w-8 text-primary" />
          </div>

          {/* Blinking proximity dot */}
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="text-xs font-medium text-primary uppercase tracking-widest">
              Within 15 metres
            </span>
          </div>

          <h2 className="text-xl font-bold mt-2 mb-1">Are you at the spot?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Is the space actually free and available?
          </p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12 text-base font-semibold border-2"
              onClick={handleNo}
              disabled={confirming}
            >
              No — re-route
            </Button>
            <Button
              className="flex-1 h-12 text-base font-semibold bg-primary hover:bg-primary/90"
              onClick={handleYes}
              disabled={confirming}
            >
              {confirming ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Confirming…
                </span>
              ) : (
                <>
                  <MapPin className="h-4 w-4 mr-1.5" />
                  Yes, I'm here!
                </>
              )}
            </Button>
          </div>

          {partnerParkingAvailable && (
            <p className="text-xs text-muted-foreground mt-4">
              Can't find a free spot?{' '}
              <button
                className="text-primary font-medium underline underline-offset-2"
                onClick={handleNo}
              >
                Book partner parking from 4€
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
