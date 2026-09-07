import { describe, it, expect } from 'vitest';
import { placeHours, placeRating, formatPlaceDistance } from './placeMeta';

describe('placeRating', () => {
  it('is stable for the same id, so the row does not reshuffle between keystrokes', () => {
    const first = placeRating('poi.12345');
    for (let i = 0; i < 5; i++) {
      expect(placeRating('poi.12345')).toEqual(first);
    }
  });

  it('stays inside the range the row renders', () => {
    for (const id of ['a', 'poi.1', 'poi.2', 'dXJuOm1ieHBvaTo', 'ΦΑΡΜΑΚΕΙΟ']) {
      const { rating, reviews } = placeRating(id);
      expect(rating).toBeGreaterThanOrEqual(3.6);
      expect(rating).toBeLessThanOrEqual(4.9);
      expect(reviews).toBeGreaterThanOrEqual(12);
      expect(reviews).toBeLessThanOrEqual(511);
    }
  });

  it('gives different places different numbers', () => {
    const ratings = new Set(
      Array.from({ length: 30 }, (_, i) => JSON.stringify(placeRating(`poi.${i}`)))
    );
    expect(ratings.size).toBeGreaterThan(20);
  });
});

describe('placeHours', () => {
  it('reports open during the day and closed overnight', () => {
    const id = 'poi.12345';
    // Opening is 07:00-10:00 and closing 17:00-23:00, so 13:00 is inside
    // every possible window and 04:00 outside every one of them.
    expect(placeHours(id, new Date(2026, 8, 7, 13, 0)).open).toBe(true);
    expect(placeHours(id, new Date(2026, 8, 7, 4, 0)).open).toBe(false);
  });

  it('shows the closing time while open and the opening time while closed', () => {
    const id = 'poi.999';
    const openNow = placeHours(id, new Date(2026, 8, 7, 13, 0));
    const closedNow = placeHours(id, new Date(2026, 8, 7, 4, 0));
    expect(Number(openNow.time.slice(0, 2))).toBeGreaterThanOrEqual(17);
    expect(Number(closedNow.time.slice(0, 2))).toBeLessThanOrEqual(10);
  });

  it('always formats as a zero-padded HH:00', () => {
    for (let i = 0; i < 20; i++) {
      expect(placeHours(`poi.${i}`, new Date(2026, 8, 7, 4, 0)).time).toMatch(/^\d{2}:00$/);
    }
  });

  it('is stable for the same id and hour', () => {
    const when = new Date(2026, 8, 7, 13, 0);
    expect(placeHours('poi.7', when)).toEqual(placeHours('poi.7', when));
  });
});

describe('formatPlaceDistance', () => {
  it('uses metres below a kilometre and kilometres above it', () => {
    expect(formatPlaceDistance(0)).toBe('0 m');
    expect(formatPlaceDistance(780)).toBe('780 m');
    expect(formatPlaceDistance(1200)).toBe('1.2 km');
    expect(formatPlaceDistance(15400)).toBe('15.4 km');
  });

  it('renders nothing rather than "NaN m" for a missing distance', () => {
    expect(formatPlaceDistance(Number.NaN)).toBe('');
    expect(formatPlaceDistance(-1)).toBe('');
  });
});
