import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { MapPinOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LocationHelpCardProps {
  onClose: () => void;
  /** Try the browser prompt again -- works where the user hasn't refused outright. */
  onRetry: () => void;
}

/**
 * What to do when the browser will no longer ask for location.
 *
 * Once someone denies location for a site, no script can raise the prompt
 * again -- calling getCurrentPosition simply fails, instantly and silently.
 * That is why "Enable location" and the locate button appeared to do
 * nothing: they were doing exactly what they were told, and the browser was
 * refusing. The only way out is the browser's own settings, so the app says
 * where they are instead of offering a button that cannot work.
 *
 * iOS Safari is called out by name because it hides this in the least
 * discoverable place of any browser, behind the "aA" glyph in the address
 * bar, and because it is what this app is demonstrated on.
 */
export const LocationHelpCard: React.FC<LocationHelpCardProps> = ({ onClose, onRetry }) => {
  const { t } = useLanguage();

  const steps = [t('locationHelp.step1'), t('locationHelp.step2'), t('locationHelp.step3')];

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-card rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
        <button
          onClick={onClose}
          aria-label={t('spotCard.close')}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
          <MapPinOff className="h-6 w-6 text-destructive" />
        </div>

        <h3 className="font-bold text-base">{t('locationHelp.title')}</h3>
        <p className="text-sm text-muted-foreground mt-1.5">{t('locationHelp.body')}</p>

        <ol className="mt-4 space-y-2.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground mt-4">{t('locationHelp.androidNote')}</p>

        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1 rounded-2xl" onClick={onClose}>
            {t('profile.cancel')}
          </Button>
          <Button className="flex-1 rounded-2xl" onClick={onRetry}>
            {t('locationHelp.retry')}
          </Button>
        </div>
      </div>
    </div>
  );
};
