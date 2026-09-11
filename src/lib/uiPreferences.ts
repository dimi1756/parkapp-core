// User-controlled appearance: how transparent the glass is, and what colour
// the app is built around.
//
// Both are applied as CSS custom properties on the document root rather than
// as React state threaded through components. That is what makes them free:
// changing either restyles every surface in the app at once, with no
// re-render, because the theme was already written against these variables
// (see the :root block in index.css). The slider can therefore be dragged
// continuously without React doing any work per frame.

export type AccentId = 'ocean' | 'sunset' | 'midnight' | 'forest';

export interface Accent {
  id: AccentId;
  labelKey: 'customize.accent.ocean' | 'customize.accent.sunset' | 'customize.accent.midnight' | 'customize.accent.forest';
  /** HSL triple, in the space-separated form the theme's variables already use. */
  primary: string;
  /** A darker step of the same hue, for the gradients that pair with it. */
  primaryDeep: string;
  /** Swatch colour for the picker itself -- a plain hex so it needs no theme lookup. */
  swatch: string;
}

/**
 * Four, not more. Every one is dark enough at full saturation to carry white
 * text at the size the buttons use, which is the constraint that rules out
 * most of the brighter options a palette like this usually collects.
 */
export const ACCENTS: Accent[] = [
  { id: 'ocean', labelKey: 'customize.accent.ocean', primary: '210 100% 35%', primaryDeep: '210 100% 26%', swatch: '#0059b3' },
  { id: 'sunset', labelKey: 'customize.accent.sunset', primary: '18 88% 45%', primaryDeep: '14 85% 35%', swatch: '#d84a15' },
  { id: 'midnight', labelKey: 'customize.accent.midnight', primary: '265 70% 45%', primaryDeep: '265 70% 34%', swatch: '#5a23c4' },
  { id: 'forest', labelKey: 'customize.accent.forest', primary: '162 80% 28%', primaryDeep: '164 80% 20%', swatch: '#0d8060' },
];

export const DEFAULT_ACCENT: AccentId = 'ocean';

/**
 * Glass opacity bounds.
 *
 * The floor is 25%, not 0. Below roughly a quarter the blur stops being
 * enough on its own and body text starts competing with whatever is behind
 * it -- a setting that lets someone make their own app unreadable is a bug
 * wearing a slider. The ceiling stops short of 100 so the glass never turns
 * into a flat panel, which is the whole look.
 */
export const GLASS_OPACITY_MIN = 0.25;
export const GLASS_OPACITY_MAX = 0.95;
export const DEFAULT_GLASS_OPACITY = 0.75;

export interface UiPreferences {
  accent: AccentId;
  glassOpacity: number;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  accent: DEFAULT_ACCENT,
  glassOpacity: DEFAULT_GLASS_OPACITY,
};

export const UI_PREFERENCES_KEY = 'parkapp_ui_preferences';

export function clampGlassOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GLASS_OPACITY;
  return Math.min(GLASS_OPACITY_MAX, Math.max(GLASS_OPACITY_MIN, value));
}

export function findAccent(id: string | undefined | null): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

/**
 * Reads stored preferences, repairing anything unusable rather than throwing.
 * A value written by an older build, hand-edited, or half-cleared must not be
 * able to leave the app unstyled.
 */
export function parseStoredPreferences(raw: string | null): UiPreferences {
  if (!raw) return DEFAULT_UI_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      accent: findAccent(parsed?.accent).id,
      glassOpacity: clampGlassOpacity(Number(parsed?.glassOpacity)),
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

/** The custom properties a given set of preferences resolves to. */
export function preferencesToCssVars(prefs: UiPreferences): Record<string, string> {
  const accent = findAccent(prefs.accent);
  return {
    '--primary': accent.primary,
    '--primary-deep': accent.primaryDeep,
    // The focus ring follows the accent; leaving it on the old hue is the
    // detail that gives a re-themed app away.
    '--ring': accent.primary,
    '--sidebar-primary': accent.primary,
    '--sidebar-ring': accent.primary,
    '--glass-opacity': String(clampGlassOpacity(prefs.glassOpacity)),
  };
}
