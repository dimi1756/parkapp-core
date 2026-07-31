import React, { useCallback, useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Step-by-step first-run tour, shown ONLY to the shared demo/reviewer
// account (gated by isDemoAccount in ConsumerApp). Targets are located via
// data-tour attributes so the tour never couples to component internals.

const TOUR_DONE_KEY = 'parkapp_demo_tour_done_v1';

export const shouldShowDemoTour = () =>
  localStorage.getItem(TOUR_DONE_KEY) !== '1';

export const dismissDemoTour = () => {
  localStorage.setItem(TOUR_DONE_KEY, '1');
};

interface TourStep {
  target: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    target: 'actions',
    title: 'Report parking spots',
    body: 'Declare spots here to help the community and earn points! In demo mode this works from anywhere — no GPS needed.',
  },
  {
    target: 'points',
    title: 'Points & Trust Score',
    body: 'This is your points balance. Level up by being accurate — every verified report grows your Trust Score.',
  },
  {
    target: 'nav',
    title: 'Explore the rest',
    body: 'Redeem points for offers at local businesses, compare plans, and manage your profile from these tabs.',
  },
];

const SPOT_PADDING = 8;

interface DemoTourProps {
  onClose: () => void;
}

export const DemoTour = ({ onClose }: DemoTourProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    dismissDemoTour();
    onClose();
  }, [onClose]);

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${STEPS[stepIndex].target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [stepIndex]);

  useEffect(() => {
    // Let the tab fade-in animation settle before the first measurement.
    const timer = setTimeout(measure, 450);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  if (!rect) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

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
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Demo tour">
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
          aria-label="Skip tour"
          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1.5 pr-6">
          <Sparkles className="h-4 w-4 text-accent shrink-0" />
          <h3 className="font-semibold text-sm">{step.title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{step.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === stepIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={finish}>
              Skip
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
            >
              {isLast ? 'Got it!' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
