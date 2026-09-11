import React, { useCallback, useRef, useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { RedemptionSuccess } from './RedemptionSuccess';

// The thumb must travel > SWIPE_THRESHOLD fraction of the track width to commit.
// Set high enough that an accidental nudge never triggers a redemption.
const SWIPE_THRESHOLD = 0.82;

export interface RedeemableOffer {
  id: string;           // matches coupon_redemptions.coupon_id
  business: string;
  rewardLabel: string;
  pointsCost: number;
}

interface SlideToRedeemProps {
  offer: RedeemableOffer;
  /** Called after success screen is dismissed. */
  onDone: () => void;
  onCancel: () => void;
}

type SlideState = 'idle' | 'dragging' | 'submitting' | 'success' | 'error';

export const SlideToRedeem = ({ offer, onDone, onCancel }: SlideToRedeemProps) => {
  const { profile } = useAuth();
  const trackRef   = useRef<HTMLDivElement>(null);
  const thumbRef   = useRef<HTMLDivElement>(null);

  const [slideState, setSlideState] = useState<SlideState>('idle');
  const [thumbX, setThumbX]         = useState(0);   // px from left edge of track
  const [errorMsg, setErrorMsg]      = useState('');

  const dragStartX   = useRef(0);
  const thumbStartX  = useRef(0);
  const trackWidth   = useRef(0);
  const thumbWidth   = useRef(0);
  const isDragging   = useRef(false);

  const maxTravel = useCallback(() =>
    trackWidth.current - thumbWidth.current - 4, // 4px padding
  []);

  // ── Pointer events ────────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (slideState !== 'idle') return;

    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    trackWidth.current = track.getBoundingClientRect().width;
    thumbWidth.current = thumb.getBoundingClientRect().width;
    dragStartX.current = e.clientX;
    thumbStartX.current = thumbX;
    isDragging.current = true;

    thumb.setPointerCapture(e.pointerId);
    setSlideState('dragging');
  }, [slideState, thumbX]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;

    const delta = e.clientX - dragStartX.current;
    const raw   = thumbStartX.current + delta;
    const clamped = Math.max(0, Math.min(raw, maxTravel()));
    setThumbX(clamped);
  }, [maxTravel]);

  const onPointerUp = useCallback(async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    thumbRef.current?.releasePointerCapture(e.pointerId);

    const progress = thumbX / maxTravel();

    if (progress < SWIPE_THRESHOLD) {
      // Snap back with a spring animation via CSS transition
      setThumbX(0);
      setSlideState('idle');
      return;
    }

    // ── Commit ────────────────────────────────────────────────────────────
    setSlideState('submitting');
    setThumbX(maxTravel()); // lock thumb at end

    const { error } = await supabase.rpc('redeem_coupon', {
      p_coupon_id:   offer.id,
      p_business:    offer.business,
      p_points_cost: offer.pointsCost,
    });

    if (error) {
      const msg = error.message;
      let friendly = 'Redemption failed. Please try again.';
      if (msg.includes('ALREADY_REDEEMED'))   friendly = 'This offer has already been redeemed.';
      if (msg.includes('INSUFFICIENT_POINTS')) friendly = `You need ${offer.pointsCost} points to redeem this offer.`;

      setErrorMsg(friendly);
      setSlideState('error');
      setThumbX(0);

      toast({ title: 'Could not redeem', description: friendly, variant: 'destructive' });
      return;
    }

    setSlideState('success');
  }, [thumbX, maxTravel, offer]);

  // ── Success screen ────────────────────────────────────────────────────────
  if (slideState === 'success') {
    return (
      <RedemptionSuccess
        business={offer.business}
        rewardLabel={offer.rewardLabel}
        onDone={onDone}
      />
    );
  }

  const isSubmitting = slideState === 'submitting';
  const progress = maxTravel() > 0 ? thumbX / maxTravel() : 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm p-6">
      <div className="w-full max-w-sm bg-background rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="p-6 text-center border-b border-border">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold">{offer.business}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{offer.rewardLabel}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold">
            💎 {offer.pointsCost} points
          </div>
          {profile && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Your balance: <span className="font-semibold text-foreground">{profile.points_balance}</span> pts
            </p>
          )}
        </div>

        {/* Slide track */}
        <div className="p-6">
          {slideState === 'error' && (
            <p className="text-sm text-destructive text-center mb-4 font-medium">{errorMsg}</p>
          )}

          <div
            ref={trackRef}
            className="relative h-16 bg-secondary rounded-2xl overflow-hidden select-none"
            aria-label="Slide to redeem"
          >
            {/* Fill bar */}
            <div
              className="absolute inset-y-0 left-0 bg-primary/20 rounded-2xl transition-none"
              style={{ width: `${progress * 100}%` }}
            />

            {/* Label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm font-semibold text-muted-foreground select-none">
                {isSubmitting ? 'Processing…' : 'Slide to redeem →'}
              </span>
            </div>

            {/* Thumb */}
            <div
              ref={thumbRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                transform: `translateX(${thumbX}px)`,
                // CSS spring: only animate back on snap, not during drag
                transition: slideState === 'idle' || slideState === 'error'
                  ? 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  : 'none',
              }}
              className={`absolute left-1 top-1 bottom-1 aspect-square rounded-xl flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing touch-none
                ${isSubmitting
                  ? 'bg-primary/60 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90'
                }`}
            >
              {isSubmitting ? (
                <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <ChevronRight className="h-6 w-6 text-white" />
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-3">
            Show to cashier before sliding. Redemptions are instant and non-reversible.
          </p>

          <button
            onClick={onCancel}
            className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
