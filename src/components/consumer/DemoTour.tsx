import React, { useCallback, useEffect, useState } from 'react';
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
  ],
  offers: [
    { target: 'offers-list', titleKey: 'tour.offers.1.title', bodyKey: 'tour.offers.1.body' },
    { target: 'offers-balance', titleKey: 'tour.offers.2.title', bodyKey: 'tour.offers.2.body' },
  ],
  plans: [
    { target: 'plans-premium', titleKey: 'tour.plans.1.title', bodyKey: 'tour.plans.1.body' },
    { target: 'plans-resident', titleKey: 'tour.plans.2.title', bodyKey: 'tour.plans.2.body' },
  ],
  profile: [
    { target: 'profile-score', titleKey: 'tour.profile.1.title', bodyKey: 'tour.profile.1.body' },
    { target: 'profile-settings', titleKey: 'tour.profile.2.title', bodyKey: 'tour.profile.2.body' },
    { target: 'profile-admin', titleKey: 'tour.profile.3.title', bodyKey: 'tour.profile.3.body' },
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

const doneKey = (id: TourId) => `parkapp_demo_tour_${id}_done_v1`;

export const shouldShowTour = (id: TourId) => localStorage.getItem(doneKey(id)) !== '1';

export const dismissTour = (id: TourId) => {
  localStorage.setItem(doneKey(id), '1');
};

const SPOT_PADDING = 8;

interface DemoTourProps {
  tourId: TourId;
  onClose: () => void;
}

export const DemoTour = ({ tourId, onClose }: DemoTourProps) => {
  const { t } = useLanguage();
  const steps = TOURS[tourId];
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    dismissTour(tourId);
    onClose();
  }, [tourId, onClose]);

  // Some targets (e.g. the Admin card, gated behind an async authorization
  // RPC) aren't in the DOM the instant the tour opens. Poll briefly before
  // concluding a step's target genuinely isn't there and skipping it.
  const measure = useCallback(
    (attempt = 0) => {
      const el = document.querySelector(`[data-tour="${steps[stepIndex].target}"]`);
      if (!el) {
        if (attempt < 8) {
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
      // Bring below-the-fold targets (e.g. the resident card in Plans) into
      // view before measuring the spotlight. A short timeout (rather than
      // requestAnimationFrame) lets the scroll settle without depending on
      // an animation-frame callback, which browsers can defer indefinitely
      // for a backgrounded/non-composited tab.
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      setTimeout(() => setRect(el.getBoundingClientRect()), 50);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  if (!rect) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const spotTop = rect.top - SPOT_PADDING;
  const spotLeft = rect.left - SPOT_PADDING;
  const spotWidth = rect.width + SPOT_PADDING * 2;
  const spotHeight = rect.height + SPOT_PADDING * 2;

  // Place the card below the target when it sits in the top half of the
  // viewport, above it otherwise; never let it leave the screen edges.
  const placeBelow = rect.top + rect.height / 2 < window.innerHeight / 2;
  const cardWidth = Math.min(300, window.innerWidth - 24);
  const cardLeft = Math.min(
    Math.max(12, rect.left + rect.width / 2 - cardWidth / 2),
    window.innerWidth - cardWidth - 12
  );
  const cardStyle: React.CSSProperties = placeBelow
    ? { top: spotTop + spotHeight + 12, left: cardLeft, width: cardWidth }
    : { bottom: window.innerHeight - spotTop + 12, left: cardLeft, width: cardWidth };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label={t('tour.aria')}>
      {/* Spotlight: the box-shadow dims everything except the target. It is
          pointer-events-none so the reviewer can still tap the real UI. */}
      <div
        className="absolute pointer-events-none rounded-2xl transition-all duration-300"
        style={{
          top: spotTop,
          left: spotLeft,
          width: spotWidth,
          height: spotHeight,
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
        }}
      />

      <div
        className="absolute glass-card p-4 shadow-2xl animate-fade-in pointer-events-auto"
        style={cardStyle}
        key={stepIndex}
      >
        <button
          onClick={finish}
          aria-label={t('tour.skipAria')}
          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1.5 pr-6">
          <Sparkles className="h-4 w-4 text-accent shrink-0" />
          <h3 className="font-semibold text-sm">{t(step.titleKey)}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{t(step.bodyKey)}</p>

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
            <span className="text-[10px] text-muted-foreground font-medium">
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
