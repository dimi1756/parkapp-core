import React, { useState } from 'react';
import { Car, Clock, MapPin, Sparkles, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PartnerParking {
  id: string;
  name: string;
  address: string;
  distanceMeters: number;
  priceCents: number;         // walk-in
  partnerPriceCents: number;  // ParkApp exclusive
}

type TriggerContext = 'pre_trip' | 'frustration';

interface PartnerParkingModalProps {
  partner: PartnerParking;
  /** 'pre_trip'  — shown before the search when ETA is high.
   *  'frustration' — shown right after user taps NO on the 15m modal.  */
  context: TriggerContext;
  onBook: (partner: PartnerParking, context: TriggerContext) => void;
  onDismiss: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + '€';
}

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PartnerParkingModal = ({
  partner,
  context,
  onBook,
  onDismiss,
}: PartnerParkingModalProps) => {
  const { profile } = useAuth();
  const [booking, setBooking] = useState(false);

  const savings = partner.priceCents - partner.partnerPriceCents;

  const headline =
    context === 'pre_trip'
      ? 'Skip the search — park instantly'
      : 'No luck? Skip the hunt';

  const subline =
    context === 'pre_trip'
      ? 'Parking looks busy right now. Book a guaranteed spot before you leave.'
      : 'Save yourself the frustration and book a secured space nearby.';

  const handleBook = async () => {
    if (booking || !profile) return;
    setBooking(true);

    // ── Payment architecture ────────────────────────────────────────────────
    //
    // 1. Client calls an Edge Function  POST /functions/v1/create-booking
    //    Body: { partner_id, vehicle_plate, context }
    //    Edge Function (service role):
    //      a. Inserts partner_bookings row (status=pending)
    //      b. Creates a Stripe PaymentIntent for partner_price_cents
    //      c. Returns { booking_id, client_secret }
    //
    // 2. Client loads @stripe/stripe-js, calls stripe.confirmCardPayment(client_secret)
    //    with the card element (or Apple/Google Pay sheet).
    //
    // 3. Stripe fires webhook  POST /functions/v1/stripe-webhook
    //    On payment_intent.succeeded:
    //      a. Edge Function updates partner_bookings SET status='paid', paid_at=now()
    //      b. Broadcasts a Supabase Realtime event on channel `booking-<booking_id>`
    //      c. POSTs to the partner's attendant webhook:
    //           { booking_id, vehicle_plate, status: 'PAID', expires_at }
    //         The Parking Attendant Dashboard polls / listens to this channel
    //         and shows the plate in a green "PAID" badge.
    //
    // 4. Client listens on the Realtime channel and navigates to a BookingConfirmed screen.
    //
    // For now we invoke the callback and let the parent orchestrate the Stripe sheet.
    onBook(partner, context);
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center p-4 pb-safe">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
        aria-hidden
      />

      <div className="relative w-full max-w-sm bg-background rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in">
        {/* Urgency stripe */}
        {context === 'frustration' && (
          <div className="bg-amber-500 text-white text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Limited availability — offer expires in a few minutes
          </div>
        )}

        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Car className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">{headline}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{subline}</p>
            </div>
          </div>

          {/* Partner card */}
          <div className="bg-secondary/60 rounded-2xl p-4 mb-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-foreground">{partner.name}</span>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                ParkApp price
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {formatDistance(partner.distanceMeters)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                ~2 min walk
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-foreground">
                {formatPrice(partner.partnerPriceCents)}
              </span>
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(partner.priceCents)}
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Save {formatPrice(savings)}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mt-1">{partner.address}</p>
          </div>

          {/* Vehicle info preview */}
          {profile?.vehicle_plate && (
            <p className="text-xs text-muted-foreground text-center mb-4">
              Your plate <span className="font-semibold text-foreground">••{profile.vehicle_plate.slice(-2)}</span> will be sent to the garage automatically.
            </p>
          )}

          <Button
            className="w-full h-13 text-base font-bold rounded-2xl bg-primary hover:bg-primary/90"
            onClick={handleBook}
            disabled={booking || !profile}
          >
            {booking ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Redirecting to payment…
              </span>
            ) : (
              <>Book now · {formatPrice(partner.partnerPriceCents)}</>
            )}
          </Button>

          <button
            onClick={onDismiss}
            className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            {context === 'frustration' ? 'Keep searching' : 'I\'ll find a free spot'}
          </button>
        </div>
      </div>
    </div>
  );
};
