import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

// ─── Persistence ─────────────────────────────────────────────────────────────

const APP_TOUR_KEY = 'parkapp_app_tour_seen_v1';

export const hasSeenAppTour = (): boolean => {
  try { return localStorage.getItem(APP_TOUR_KEY) === '1'; } catch { return false; }
};
export const markAppTourSeen = (): void => {
  try { localStorage.setItem(APP_TOUR_KEY, '1'); } catch {}
};

// ─── Slide data ───────────────────────────────────────────────────────────────

interface Slide {
  emoji: string;
  badge: string;
  title: string;
  body: string;
}

// Keys are resolved at render time via t() so language switches work live.
const SLIDE_KEYS = [
  { emoji: '🗺️', badge: 'appTour.s1.badge', title: 'appTour.s1.title', body: 'appTour.s1.body' },
  { emoji: '🤖', badge: 'appTour.s2.badge', title: 'appTour.s2.title', body: 'appTour.s2.body' },
  { emoji: '🎯', badge: 'appTour.s3.badge', title: 'appTour.s3.title', body: 'appTour.s3.body' },
  { emoji: '🧳', badge: 'appTour.s4.badge', title: 'appTour.s4.title', body: 'appTour.s4.body' },
  { emoji: '🏛️', badge: 'appTour.s5.badge', title: 'appTour.s5.title', body: 'appTour.s5.body' },
  { emoji: '✨', badge: 'appTour.s6.badge', title: 'appTour.s6.title', body: 'appTour.s6.body' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface AppTourModalProps {
  open: boolean;
  onClose: () => void;
}

export const AppTourModal: React.FC<AppTourModalProps> = ({ open, onClose }) => {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);

  if (!open) return null;

  const total = SLIDE_KEYS.length;
  const isFirst = current === 0;
  const isLast = current === total - 1;

  const handleClose = () => {
    markAppTourSeen();
    setCurrent(0);
    onClose();
  };

  const prev = () => setCurrent((c) => Math.max(0, c - 1));
  const next = () => (isLast ? handleClose() : setCurrent((c) => c + 1));

  return (
    <div className="fixed inset-0 w-full h-[100dvh] z-[70] overflow-hidden" role="dialog" aria-modal="true">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/*
        Card: balanced glass, not the near-opaque backdrop-saturate-150 mix
        that turned muddy over this much surface area, and not fully solid
        either (that killed the Liquid Glass feel entirely). 60% white/slate
        fill + a single blur pass keeps the blurred map/header softly visible
        behind the sheet; text below is forced fully opaque so it reads
        cleanly over that fill regardless of what's behind it.

        Width is capped and centered (inset-x-0 + w-[90%] max-w-sm + mx-auto)
        rather than the old inset-x-4 edge-margin approach, which stretched
        into a full-width banner on anything wider than a phone -- on
        desktop it spanned nearly the entire browser window. Vertical
        footprint (top-14/bottom-10) is unchanged.
      */}
      <div className="absolute inset-x-0 top-14 bottom-10 mx-auto w-[90%] max-w-sm flex flex-col bg-white/60 dark:bg-slate-900/60 backdrop-blur-lg border border-white/30 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('appTour.close')}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 flex items-center justify-center transition-colors active:scale-[0.95]"
        >
          <X className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        </button>

        {/* Slides — compositor-only slide transition via translateX */}
        <div className="flex-1 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {SLIDE_KEYS.map((sk, i) => (
              <div
                key={i}
                className="w-full h-full flex-shrink-0 flex flex-col items-center justify-center px-8 py-6 text-center"
              >
                {/* Emoji */}
                <div className="text-6xl mb-5 select-none">{sk.emoji}</div>

                {/* Badge pill */}
                <div className="inline-flex items-center bg-primary/12 text-primary text-[11px] font-bold tracking-wide uppercase px-3 py-1 rounded-full mb-3">
                  {t(sk.badge as Parameters<typeof t>[0])}
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-3 leading-snug">
                  {t(sk.title as Parameters<typeof t>[0])}
                </h2>

                {/* Body */}
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed max-w-xs">
                  {t(sk.body as Parameters<typeof t>[0])}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-border/60">
          {/* Step dots */}
          <div className="flex justify-center items-center gap-2 mb-4">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Slide ${i + 1}`}
                className={`rounded-full transition-all duration-200 ${
                  i === current
                    ? 'w-6 h-2 bg-primary'
                    : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2.5">
            {!isFirst && (
              <Button
                variant="outline"
                className="flex-1 rounded-xl active:scale-[0.98] transition-transform duration-100"
                onClick={prev}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('appTour.prev')}
              </Button>
            )}
            <Button
              className="flex-1 rounded-xl active:scale-[0.98] transition-transform duration-100"
              onClick={next}
            >
              {isLast ? t('appTour.finish') : t('appTour.next')}
              {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
