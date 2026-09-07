import { describe, it, expect } from 'vitest';
import { buildPredictions, candidatePoints, scoreStreet, walkMinutes } from './prediction';

const DESTINATION = { lng: 24.4167, lat: 38.0167 };

const CONTEXT = {
  destination: DESTINATION,
  reportedSpots: [],
  hour: 15, // off-peak, so the peak penalty doesn't mask other terms
};

/** ~metres east of the destination, at this latitude. */
function eastOf(meters: number) {
  const dLng = meters / (111_320 * Math.cos((DESTINATION.lat * Math.PI) / 180));
  return { lng: DESTINATION.lng + dLng, lat: DESTINATION.lat };
}

describe('candidatePoints', () => {
  it('rings the destination without repeating a point', () => {
    const points = candidatePoints(DESTINATION, 6, 280);
    expect(points).toHaveLength(6);
    const unique = new Set(points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`));
    expect(unique.size).toBe(6);
  });

  it('places them at roughly the requested radius', () => {
    for (const point of candidatePoints(DESTINATION, 8, 280)) {
      const dLat = (point.lat - DESTINATION.lat) * 111_320;
      const dLng =
        (point.lng - DESTINATION.lng) * 111_320 * Math.cos((DESTINATION.lat * Math.PI) / 180);
      expect(Math.hypot(dLat, dLng)).toBeGreaterThan(250);
      expect(Math.hypot(dLat, dLng)).toBeLessThan(310);
    }
  });
});

describe('scoreStreet', () => {
  it('is deterministic -- the same street scores the same every call', () => {
    const street = { name: 'Οδός Σαχτούρη', ...eastOf(300) };
    const first = scoreStreet(street, CONTEXT);
    for (let i = 0; i < 5; i++) {
      expect(scoreStreet(street, CONTEXT)).toBe(first);
    }
  });

  it('stays inside the range the UI renders as a bar', () => {
    for (const meters of [0, 100, 300, 900, 5000]) {
      const score = scoreStreet({ name: `Street ${meters}`, ...eastOf(meters) }, CONTEXT);
      expect(score).toBeGreaterThanOrEqual(45);
      expect(score).toBeLessThanOrEqual(93);
    }
  });

  it('rates a street further from the destination higher than one on top of it', () => {
    const near = { name: 'Same Name', ...eastOf(40) };
    const far = { name: 'Same Name', ...eastOf(600) };
    // Identical names, so the per-street offset cancels and only distance moves.
    expect(scoreStreet(far, CONTEXT)).toBeGreaterThan(scoreStreet(near, CONTEXT));
  });

  it('rates a street with reported activity nearby higher than a quiet one', () => {
    const street = { name: 'Same Name', ...eastOf(300) };
    const quiet = scoreStreet(street, CONTEXT);
    const busy = scoreStreet(street, {
      ...CONTEXT,
      reportedSpots: [eastOf(300), eastOf(320), eastOf(280)],
    });
    expect(busy).toBeGreaterThan(quiet);
  });

  it('is harder at peak hours than off-peak', () => {
    const street = { name: 'Same Name', ...eastOf(300) };
    expect(scoreStreet(street, { ...CONTEXT, hour: 20 })).toBeLessThan(
      scoreStreet(street, { ...CONTEXT, hour: 15 })
    );
  });
});

describe('buildPredictions', () => {
  const STREETS = [
    { name: 'Alpha', ...eastOf(200) },
    { name: 'Beta', ...eastOf(400) },
    { name: 'Gamma', ...eastOf(600) },
    { name: 'Delta', ...eastOf(800) },
  ];

  it('returns at most the requested number, ranked by probability', () => {
    const results = buildPredictions(STREETS, CONTEXT, 3);
    expect(results).toHaveLength(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].probability).toBeGreaterThanOrEqual(results[i].probability);
    }
  });

  it('collapses a repeated street to its closest point', () => {
    const results = buildPredictions(
      [
        { name: 'Alpha', ...eastOf(600) },
        { name: 'Alpha', ...eastOf(200) },
      ],
      CONTEXT,
      3
    );
    expect(results).toHaveLength(1);
    expect(results[0].distanceMeters).toBeLessThan(300);
  });

  it('drops unnamed candidates rather than rendering a blank row', () => {
    const results = buildPredictions([{ name: '   ', ...eastOf(300) }], CONTEXT, 3);
    expect(results).toEqual([]);
  });

  it('carries a walk time that matches the distance', () => {
    const [first] = buildPredictions([{ name: 'Alpha', ...eastOf(400) }], CONTEXT, 1);
    expect(first.walkMinutes).toBe(walkMinutes(first.distanceMeters));
    expect(first.walkMinutes).toBeGreaterThan(0);
  });

  it('is stable across calls, so the list never reshuffles between renders', () => {
    expect(buildPredictions(STREETS, CONTEXT, 3)).toEqual(buildPredictions(STREETS, CONTEXT, 3));
  });
});
