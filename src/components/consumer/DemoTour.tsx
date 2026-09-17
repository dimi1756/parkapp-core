import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StringKey } from '@/i18n/strings';

// Per-surface guided tours, shown ONLY to the shared demo/reviewer account
// (gated by isDemoAccount at every mount site). Targets are located via
// data-tour attributes so the tour never couples to component internals.
// Each surface has its own "done" flag, so every tab greets the reviewer
// exactly once.

export type TourId = 'map' | 'offers' | 'plans' | 'profile' | 'leaderboard' | 'admin';

interface TourStep {
  target: string;
  titleKey: StringKey;
  bodyKey: StringKey;
}

const TOURS: Record<TourId, TourStep[]> = {
  map: [
    { target: 'actions', titleKey: 'tour.map.1.title', bodyKey: 'tour.map.1.body' },
    { target: 'points', titleKey: 'tour.map.2.title', bodyKey: 'tour.map.2.body' },
    { target: 'nav', titleKey: 'tour.map.3.title', bodyKey: 'tour.map.3.body' },
    // MapboxMap plants this invisible target (and the 3 demo pins it
    // bounds) only while this exact step is showing -- see showcasePins in
    // MapboxMap.tsx. Never 'actions': that highlighted the declare-spot
    // buttons instead of the pin cluster this step is actually about.
    { target: 'spot-confidence-showcase', titleKey: 'tour.map.4.title', bodyKey: 'tour.map.4.body' },
  ],
  offers: [
    { target: 'offers-list', titleKey: 'tour.offers.1.title', bodyKey: 'tour.offers.1.body' },
    { target: 'offers-balance', titleKey: 'tour.offers.2.title', bodyKey: 'tour.offers.2.body' },
  ],
  plans: [
    { target: 'plans-premium', titleKey: 'tour.plans.1.title', bodyKey: 'tour.plans.1.body' },
    { target: 'plans-resident', titleKey: 'tour.plans.2.title', bodyKey: 'tour.plans.2.body' },
  ],
  // Follows the Profile tab's actual top-to-bottom card order and leads
  // with high-value features rather than generic settings -- the old
  // "Make it yours" step (dark mode/notifications toggles) is retired.
  // Admin is deliberately last: it's the B2G grand finale, and it sits
  // near the top of the page, so this step scrolls back up after Glovebox
  // and Appearance have scrolled down -- exactly what the smooth-scroll
  // fix in measure() below exists for.
  profile: [
    { target: 'profile-score', titleKey: 'tour.profile.1.title', bodyKey: 'tour.profile.1.body' },
    { target: 'profile-eco', titleKey: 'tour.profile.2.title', bodyKey: 'tour.profile.2.body' },
    { target: 'profile-glovebox', titleKey: 'tour.profile.3.title', bodyKey: 'tour.profile.3.body' },
    { target: 'profile-appearance', titleKey: 'tour.profile.4.title', bodyKey: 'tour.profile.4.body' },
    { target: 'profile-admin', titleKey: 'tour.profile.5.title', bodyKey: 'tour.profile.5.body' },
  ],
  leaderboard: [
    { target: 'leaderboard-title', titleKey: 'tour.leaderboard.1.title', bodyKey: 'tour.leaderboard.1.body' },
    { target: 'leaderboard-podium', titleKey: 'tour.leaderboard.2.title', bodyKey: 'tour.leaderboard.2.body' },
    { target: 'leaderboard-future', titleKey: 'tour.leaderboard.3.title', bodyKey: 'tour.leaderboard.3.body' },
  ],
  admin: [
    { target: 'admin-kpis', titleKey: 'tour.admin.1.title', bodyKey: 'tour.admin.1.body' },
    { target: 'admin-map', titleKey: 'tour.admin.2.title', bodyKey: 'tour.admin.2.body' },
  ],
};

const TOUR_IDS: TourId[] = ['map', 'offers', 'plans', 'profile', 'leaderboard', 'admin'];
const doneKey = (id: TourId) => `parkapp_demo_tour_${id}_done_v1`;

/**
 * Clears all per-tab tour flags so every tour will show again on next visit.
 * Called in ConsumerApp on first demo-session detection (covers both fresh
 * sign-in and session-restore from a previous visit — signIn() also clears
 * them in AuthContext, but that doesn't run when the session is auto-restored).
 */
export const clearAllDemoTours = () => {
  TOUR_IDS.forEach((id) => localStorage.removeItem(doneKey(id)));
};

/**
 * Master switch for the guided tours.
 *
 * Off for the investor pitch: the presenter narrates the dashboard himself,
 * and a spotlight overlay that mistimes itself over a live screen is a risk
 * with no upside in that room. Every tour is gated on this single flag --
 * both the consumer tabs and the admin dashboard go through
 * shouldShowTour() -- so flipping it back to true restores all of them,
 * with their steps, targets and translations untouched.
 */
export const TOURS_ENABLED = true;

export const shouldShowTour = (id: TourId) =>
  TOURS_ENABLED && localStorage.getItem(doneKey(id)) !== '1';

export const dismissTour = (id: TourId) => {
  localStorage.setItem(doneKey(id), '1');
};

const SPOT_PADDING = 12;
// Minimum breathing room the spotlight cutout keeps from the visible
// screen/app-frame edges, regardless of how close the underlying target's
// own rect happens to sit to them.
const SIDE_MARGIN = 16;

interface DemoTourProps {
  tourId: TourId;
  onClose: () => void;
  /** Fires whenever the visible step changes -- lets a mount site (e.g. the
   *  map, for the "Spot confidence colours" step) react to which step of
   *  its own tour is currently showing without DemoTour needing to know
   *  anything about that surface's internals. */
  onStepChange?: (stepIndex: number) => void;
}

export const DemoTour = ({ tourId, onClose, onStepChange }: DemoTourProps) => {
  const { t } = useLanguage();
  const steps = TOURS[tourId];
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // The card's real height, measured after it renders. Positioning needs it,
  // and it varies with the text -- Greek and Turkish bodies wrap to more
  // lines than English, so a fixed estimate would be wrong in exactly the
  // languages this is demonstrated in.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(190);

  const finish = useCallback(() => {
    dismissTour(tourId);
    onClose();
  }, [tourId, onClose]);

  // Holds the cleanup for whatever scroll measurement is currently pending
  // (the 'scrollend' listener + its fallback timeout below), so a late
  // callback from a step the reviewer already moved past can never
  // overwrite `rect` with a stale element's position.
  const measureCleanupRef = useRef<(() => void) | null>(null);

  // Some targets (e.g. the Admin card, gated behind an async authorization
  // RPC) aren't in the DOM the instant the tour opens. Poll briefly before
  // concluding a step's target genuinely isn't there and skipping it.
  const measure = useCallback(
    (attempt = 0) => {
      const el = document.querySelector(`[data-tour="${steps[stepIndex].target}"]`);
      if (!el) {
        if (attempt < 12) {
          setTimeout(() => measure(attempt + 1), 250);
          return;
        }
        // Genuinely not there: skip forward rather than trapping the
        // reviewer under a dim overlay with no card.
        if (stepIndex < steps.length - 1) {
          setStepIndex((i) => i + 1);
        } else {
          finish();
        }
        return;
      }

      // Cancel any previous step's still-pending scroll measurement before
      // starting a new one.
      measureCleanupRef.current?.();

      // Bring off-screen targets (e.g. the resident card in Plans, or the
      // Profile tour scrolling back up to Admin after Glovebox/Appearance
      // scrolled down) smoothly into view before measuring the spotlight.
      // Measuring can't happen on a short fixed delay once this is a smooth
      // scroll rather than an instant jump -- a smooth scroll can still be
      // animating well past 50ms on a longer page. 'scrollend' measures the
      // instant the scroll actually settles; the timeout is a fallback for
      // browsers without it (or when the target was already in view, so it
      // never fires at all).
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      let settled = false;
      const onSettled = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('scrollend', onSettled);
        measureCleanupRef.current = null;
        setRect(el.getBoundingClientRect());
      };
      window.addEventListener('scrollend', onSettled, { once: true });
      const fallback = setTimeout(onSettled, 600);
      measureCleanupRef.current = () => {
        clearTimeout(fallback);
        window.removeEventListener('scrollend', onSettled);
      };
    },
    [steps, stepIndex, finish]
  );

  useEffect(() => {
    setRect(null);
    // Let tab fade-in / data skeletons settle before the first measurement.
    const timer = setTimeout(() => measure(), 450);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      measureCleanupRef.current?.();
      measureCleanupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    onStepChange?.(stepIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Measured after paint, so the placement above works from the card's real
  // height instead of a guess. Runs before the browser draws the frame, so
  // the correction is never visible as a jump.
  useLayoutEffect(() => {
    const measured = cardRef.current?.offsetHeight;
    // The 1px tolerance stops sub-pixel rounding from bouncing this between
    // two values forever.
    if (measured && Math.abs(measured - cardHeight) > 1) setCardHeight(measured);
    // Re-measures when the step changes (new text, new height) or the target
    // moves. Including cardHeight converges in one extra render: the next run
    // finds the heights equal and stops.
  }, [stepIndex, rect, cardHeight]);

  if (!rect) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Use the app frame's bounding rect (the max-w-md centered container) for
  // horizontal clamping so the card never bleeds outside the visible app area
  // on a desktop browser. Falls back to the full viewport for admin/full-width.
  const appFrame = document.querySelector('[data-app-frame]');
  const frameRect = appFrame?.getBoundingClientRect() ?? {
    left: 0,
    width: window.innerWidth,
  };

  const spotTop = rect.top - SPOT_PADDING;
  const spotHeight = rect.height + SPOT_PADDING * 2;

  // Some targets (e.g. the map's bottom action row, left-0 right-0 by
  // design for its own layout) already span edge-to-edge on their own --
  // adding SPOT_PADDING to their rect alone would push the cutout even
  // closer to the true screen edges instead of away from them. Clamping
  // to the frame's bounds minus a fixed side margin guarantees the
  // spotlight keeps equal breathing room from the left/right edges no
  // matter how wide the underlying target's own rect is.
  const frameLeft = frameRect.left;
  const frameRight = frameRect.left + frameRect.width;
  const rawSpotLeft = rect.left - SPOT_PADDING;
  const rawSpotRight = rect.left + rect.width + SPOT_PADDING;
  const spotLeft = Math.max(rawSpotLeft, frameLeft + SIDE_MARGIN);
  const spotRight = Math.min(rawSpotRight, frameRight - SIDE_MARGIN);
  const spotWidth = Math.max(0, spotRight - spotLeft);

  // The visible window, in the same coordinate space as getBoundingClientRect
  // and position:fixed -- the layout viewport.
  const visibleTop = window.visualViewport?.offsetTop ?? 0;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const visibleBottom = visibleTop + viewportHeight;
  const GAP = 12;
  const HGAP = 16;

  const cardWidth = Math.min(300, frameRect.width - HGAP * 2);
  const rawLeft = rect.left + rect.width / 2 - cardWidth / 2;
  const cardLeft = Math.max(
    frameRect.left + HGAP,
    Math.min(rawLeft, frameRect.left + frameRect.width - cardWidth - HGAP)
  );

  // Prefer whichever side the card actually fits on, rather than guessing
  // from which half of the screen the target sits in. That guess broke on
  // the admin dashboard, where the KPI target is taller than the phone
  // screen: it chose "above", and "above a target that starts near the top"
  // is off the top of the screen -- which is why only the card's bottom
  // edge, with the Skip and Next buttons, was visible.
  const spaceBelow = visibleBottom - (spotTop + spotHeight);
  const spaceAbove = spotTop - visibleTop;

  let cardTop: number;
  if (spaceBelow >= cardHeight + GAP) {
    cardTop = spotTop + spotHeight + GAP;
  } else if (spaceAbove >= cardHeight + GAP) {
    cardTop = spotTop - cardHeight - GAP;
  } else {
    // Fits on neither side -- the target is bigger than the screen. Pin the
    // card to the bottom, where it overlaps the target but stays readable.
    cardTop = visibleBottom - cardHeight - GAP;
  }

  // The clamp the original comment promised and never applied: whatever the
  // arithmetic above decides, the card stays inside the visible window.
  const lowestTop = Math.max(visibleTop + GAP, visibleBottom - cardHeight - GAP);
  cardTop = Math.min(Math.max(visibleTop + GAP, cardTop), lowestTop);

  const cardStyle: React.CSSProperties = {
    top: cardTop,
    left: cardLeft,
    width: cardWidth,
    maxWidth: frameRect.width - HGAP * 2,
    maxHeight: Math.max(160, viewportHeight - GAP * 2),
    overflowY: 'auto',
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden z-[60]" role="dialog" aria-label={t('tour.aria')}>
      {/* Spotlight: the box-shadow dims everything except the target. It is
          pointer-events-none so the reviewer can still tap the real UI. */}
      <div
        className="absolute pointer-events-none rounded-[24px] transition-all duration-300"
        style={{
          top: spotTop,
          left: spotLeft,
          width: spotWidth,
          height: spotHeight,
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
        }}
      />

      <div
        ref={cardRef}
        className="absolute bg-background/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl p-4 shadow-2xl animate-fade-in pointer-events-auto z-10"
        style={cardStyle}
        key={stepIndex}
      >
        <button
          onClick={finish}
          aria-label={t('tour.skipAria')}
          className="absolute top-2.5 right-2.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1.5 pr-6">
          <Sparkles className="h-4 w-4 text-accent shrink-0" />
          <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-50">{t(step.titleKey)}</h3>
        </div>
        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 leading-relaxed mb-3">{t(step.bodyKey)}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === stepIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
              {stepIndex + 1}/{steps.length}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={finish}>
              {t('tour.skip')}
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
            >
              {isLast ? t('tour.gotIt') : t('tour.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
