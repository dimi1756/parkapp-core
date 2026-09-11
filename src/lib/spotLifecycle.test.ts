import { describe, it, expect } from 'vitest';
import {
  SPOT_FADE_OUT_MS,
  SPOT_VISIBLE_TTL_MS,
  isSpotOnMap,
  spotExpiryMs,
  spotPhase,
} from './spotLifecycle';

const NOW = new Date('2026-09-08T12:00:00Z').getTime();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('spotExpiryMs', () => {
  it("uses the server's expires_at when there is one", () => {
    const expiry = spotExpiryMs({ declared_at: iso(0), expires_at: iso(90_000) });
    expect(expiry).toBe(NOW + 90_000);
  });

  it('falls back to declared_at + TTL for an optimistic pin with no row yet', () => {
    expect(spotExpiryMs({ declared_at: iso(0) })).toBe(NOW + SPOT_VISIBLE_TTL_MS);
    expect(spotExpiryMs({ declared_at: iso(0), expires_at: null })).toBe(NOW + SPOT_VISIBLE_TTL_MS);
  });

  it('does not trust an unparseable expires_at over a usable declared_at', () => {
    expect(spotExpiryMs({ declared_at: iso(0), expires_at: 'not a date' })).toBe(
      NOW + SPOT_VISIBLE_TTL_MS
    );
  });
});

describe('spotPhase', () => {
  it('is visible for most of its life', () => {
    expect(spotPhase({ declared_at: iso(0), expires_at: iso(SPOT_VISIBLE_TTL_MS) }, NOW)).toBe('visible');
    expect(spotPhase({ declared_at: iso(0), expires_at: iso(30_000) }, NOW)).toBe('visible');
  });

  it('fades over the last few seconds rather than popping', () => {
    expect(spotPhase({ declared_at: iso(0), expires_at: iso(SPOT_FADE_OUT_MS) }, NOW)).toBe('fading');
    expect(spotPhase({ declared_at: iso(0), expires_at: iso(1_000) }, NOW)).toBe('fading');
  });

  it('is gone exactly at expiry, not a moment after', () => {
    expect(spotPhase({ declared_at: iso(0), expires_at: iso(0) }, NOW)).toBe('gone');
    expect(spotPhase({ declared_at: iso(0), expires_at: iso(-1) }, NOW)).toBe('gone');
  });

  it('drops a spot whose age cannot be established rather than showing it forever', () => {
    expect(spotPhase({ declared_at: 'garbage' }, NOW)).toBe('gone');
    expect(spotPhase({ declared_at: 'garbage', expires_at: 'garbage' }, NOW)).toBe('gone');
  });

  it('walks a spot through visible -> fading -> gone as the clock runs', () => {
    const spot = { declared_at: iso(0), expires_at: iso(SPOT_VISIBLE_TTL_MS) };
    const phases = [0, SPOT_VISIBLE_TTL_MS - SPOT_FADE_OUT_MS - 1, SPOT_VISIBLE_TTL_MS - 1, SPOT_VISIBLE_TTL_MS].map(
      (offset) => spotPhase(spot, NOW + offset)
    );
    expect(phases).toEqual(['visible', 'visible', 'fading', 'gone']);
  });
});

describe('isSpotOnMap', () => {
  it('keeps a fading spot on the map so the animation has something to run on', () => {
    expect(isSpotOnMap({ declared_at: iso(0), expires_at: iso(1_000) }, NOW)).toBe(true);
  });

  it('drops it once expired', () => {
    expect(isSpotOnMap({ declared_at: iso(0), expires_at: iso(0) }, NOW)).toBe(false);
  });
});
