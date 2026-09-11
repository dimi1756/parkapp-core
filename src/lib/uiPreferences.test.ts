import { describe, it, expect } from 'vitest';
import {
  ACCENTS,
  DEFAULT_GLASS_OPACITY,
  DEFAULT_UI_PREFERENCES,
  GLASS_OPACITY_MAX,
  GLASS_OPACITY_MIN,
  clampGlassOpacity,
  findAccent,
  parseStoredPreferences,
  preferencesToCssVars,
} from './uiPreferences';

describe('clampGlassOpacity', () => {
  it('keeps a value inside the readable band', () => {
    expect(clampGlassOpacity(0.5)).toBe(0.5);
    expect(clampGlassOpacity(0)).toBe(GLASS_OPACITY_MIN);
    expect(clampGlassOpacity(1)).toBe(GLASS_OPACITY_MAX);
    expect(clampGlassOpacity(-5)).toBe(GLASS_OPACITY_MIN);
  });

  it('falls back rather than propagating a non-number', () => {
    expect(clampGlassOpacity(Number.NaN)).toBe(DEFAULT_GLASS_OPACITY);
    expect(clampGlassOpacity(Number.POSITIVE_INFINITY)).toBe(DEFAULT_GLASS_OPACITY);
  });
});

describe('findAccent', () => {
  it('resolves every id it advertises', () => {
    for (const accent of ACCENTS) {
      expect(findAccent(accent.id).id).toBe(accent.id);
    }
  });

  it('falls back to the first accent for anything unknown', () => {
    expect(findAccent('not-an-accent').id).toBe(ACCENTS[0].id);
    expect(findAccent(null).id).toBe(ACCENTS[0].id);
    expect(findAccent(undefined).id).toBe(ACCENTS[0].id);
  });
});

describe('parseStoredPreferences', () => {
  it('round-trips a value it wrote itself', () => {
    const stored = JSON.stringify({ accent: 'midnight', glassOpacity: 0.4 });
    expect(parseStoredPreferences(stored)).toEqual({ accent: 'midnight', glassOpacity: 0.4 });
  });

  it('defaults when there is nothing stored', () => {
    expect(parseStoredPreferences(null)).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it('repairs rather than throws on anything unusable', () => {
    expect(parseStoredPreferences('not json')).toEqual(DEFAULT_UI_PREFERENCES);
    expect(parseStoredPreferences('{}')).toEqual(DEFAULT_UI_PREFERENCES);
    expect(parseStoredPreferences('{"accent":"neon","glassOpacity":"loud"}')).toEqual(
      DEFAULT_UI_PREFERENCES
    );
    // An out-of-range opacity is clamped back into the readable band, not honoured.
    expect(parseStoredPreferences('{"accent":"ocean","glassOpacity":0}').glassOpacity).toBe(
      GLASS_OPACITY_MIN
    );
  });
});

describe('preferencesToCssVars', () => {
  it('drives every variable the theme reads for the accent', () => {
    const vars = preferencesToCssVars({ accent: 'sunset', glassOpacity: 0.6 });
    const sunset = findAccent('sunset');
    expect(vars['--primary']).toBe(sunset.primary);
    expect(vars['--ring']).toBe(sunset.primary);
    expect(vars['--sidebar-primary']).toBe(sunset.primary);
    expect(vars['--glass-opacity']).toBe('0.6');
  });

  it('emits a clamped opacity even when handed a bad one', () => {
    expect(preferencesToCssVars({ accent: 'ocean', glassOpacity: 5 })['--glass-opacity']).toBe(
      String(GLASS_OPACITY_MAX)
    );
  });
});
