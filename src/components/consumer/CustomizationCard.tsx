import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import {
  ACCENTS,
  GLASS_OPACITY_MAX,
  GLASS_OPACITY_MIN,
  DEFAULT_UI_PREFERENCES,
} from '@/lib/uiPreferences';
import { Slider } from '@/components/ui/slider';
import { Check, Palette, RotateCcw, Layers } from 'lucide-react';

/**
 * Appearance settings, in the shape iOS uses for the same job: a live preview
 * of the thing being changed, sitting directly above the control that changes
 * it, so the effect is visible without leaving the screen.
 *
 * Neither control needs an Apply button. Both write CSS variables on the
 * document root, so the whole app -- including this card, which is itself a
 * glass surface -- restyles as the slider moves.
 */
export const CustomizationCard: React.FC = () => {
  const { t } = useLanguage();
  const { accent, glassOpacity, setAccent, setGlassOpacity, reset } = useUiPreferences();

  const isDefault =
    accent === DEFAULT_UI_PREFERENCES.accent &&
    Math.abs(glassOpacity - DEFAULT_UI_PREFERENCES.glassOpacity) < 0.001;

  return (
    <div className="glass-card p-5" data-tour="profile-customization">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Palette className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{t('customize.title')}</p>
          {/* Truncated, not wrapped: the Greek and Turkish subtitles run to
              three lines on a 320px screen, which shoves the reset control
              out of the header row it belongs to. */}
          <p className="text-[11px] text-muted-foreground truncate">{t('customize.subtitle')}</p>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            {t('customize.reset')}
          </button>
        )}
      </div>

      {/* --- Accent --- */}
      <p className="text-xs font-medium text-muted-foreground mb-2.5">{t('customize.accentLabel')}</p>
      {/* Each swatch takes an equal share of the row and its label truncates.
          "Ηλιοβασίλεμα" and "Gün batımı" are far wider than the 44px circle
          above them, so fixed-width items collided at the narrow end. */}
      <div className="flex items-start gap-2 mb-6">
        {ACCENTS.map((option) => {
          const selected = option.id === accent;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setAccent(option.id)}
              aria-label={t(option.labelKey)}
              aria-pressed={selected}
              className="flex flex-col items-center gap-1.5 flex-1 min-w-0"
            >
              {/* Tailwind's ring is itself a box-shadow, so an inline
                  boxShadow here would silently replace it and the selected
                  swatch would show nothing but the tick. The ring colour is
                  set through the custom property Tailwind reads instead, and
                  it is the swatch's own colour rather than the live accent --
                  which matters while a different swatch is being previewed. */}
              <span
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                  selected ? 'ring-2 ring-offset-2 ring-offset-background' : ''
                }`}
                style={
                  {
                    backgroundColor: option.swatch,
                    '--tw-ring-color': option.swatch,
                  } as React.CSSProperties
                }
              >
                {selected && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
              </span>
              <span
                className={`text-[10px] leading-tight w-full truncate text-center ${
                  selected ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {t(option.labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* --- Glass opacity --- */}
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-medium text-muted-foreground">{t('customize.glassLabel')}</p>
        <span className="text-xs font-semibold tabular-nums">{Math.round(glassOpacity * 100)}%</span>
      </div>

      {/* Live sample. The point of a transparency control is what shows
          through it, so the preview is a strip of colour with a glass panel
          over it -- change the slider and this is the first thing that moves. */}
      <div className="relative h-14 rounded-2xl overflow-hidden mb-3">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(115deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 55%, hsl(var(--primary-deep)) 100%)',
          }}
        />
        <div className="absolute inset-2 rounded-xl glass-card flex items-center justify-center">
          <span className="text-[11px] font-semibold">{t('customize.preview')}</span>
        </div>
      </div>

      <Slider
        value={[glassOpacity]}
        min={GLASS_OPACITY_MIN}
        max={GLASS_OPACITY_MAX}
        step={0.01}
        onValueChange={([value]) => setGlassOpacity(value)}
        aria-label={t('customize.glassLabel')}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">{t('customize.moreGlass')}</span>
        <span className="text-[10px] text-muted-foreground">{t('customize.moreSolid')}</span>
      </div>
    </div>
  );
};
