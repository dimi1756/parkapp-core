import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PredictedStreet } from '@/lib/prediction';
import { Navigation, Sparkles, Footprints, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AlternativeSpotsCardProps {
  streets: PredictedStreet[];
  onNavigate: (street: PredictedStreet) => void;
  onClose: () => void;
}

/** Green above 75, amber above 60, muted below -- the same traffic-light reading as the car parks. */
function probabilityColor(probability: number): string {
  if (probability >= 75) return '#16a34a';
  if (probability >= 60) return '#f59e0b';
  return '#64748b';
}

/**
 * Shown when a search finds no reported spot near the destination.
 *
 * This is the answer to the cold-start question in the investor material:
 * an empty map is exactly when the app has to be useful anyway. Instead of
 * "nothing found", the driver gets somewhere to try.
 *
 * The percentages come from a client-side heuristic, not a trained model --
 * see src/lib/prediction.ts. The street names, distances and walk times are
 * real.
 */
export const AlternativeSpotsCard: React.FC<AlternativeSpotsCardProps> = ({ streets, onNavigate, onClose }) => {
  const { t } = useLanguage();

  return (
    <div className="absolute bottom-20 left-4 right-4 z-30 flex justify-center animate-fade-in">
      <div className="glass-card rounded-3xl p-5 shadow-2xl w-full max-w-sm relative">
        <button
          onClick={onClose}
          aria-label={t('spotCard.close')}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-1 pr-6">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">{t('predict.title')}</p>
            <p className="text-[11px] text-muted-foreground">{t('predict.subtitle')}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {streets.map((street) => {
            const color = probabilityColor(street.probability);
            return (
              <div key={street.id} className="rounded-2xl bg-secondary/50 p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{street.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold" style={{ color }}>
                        {t('predict.chance', { n: street.probability })}
                      </span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Footprints className="h-3 w-3" />
                        {t('predict.walk', { n: street.walkMinutes })}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full gap-1.5 shrink-0"
                    onClick={() => onNavigate(street)}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    {t('predict.driveThere')}
                  </Button>
                </div>

                {/* The bar restates the number for anyone scanning rather than
                    reading, and makes the ranking obvious at a glance. */}
                <div className="h-1.5 rounded-full bg-background/70 overflow-hidden mt-2.5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${street.probability}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Stated on screen, not just in the source: these percentages are a
            heuristic, and a room being pitched to deserves to know that. */}
        <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">{t('predict.disclaimer')}</p>
      </div>
    </div>
  );
};
