import { describe, it, expect } from 'vitest';
import { KARYSTOS_ZONES, findZoneAt, pointInPolygon, zonesToGeoJson } from './zones';
import { KARYSTOS_CENTER, getMockKarystosSpots } from './demoMockData';

// A plain unit square, so the expected answers are obvious by inspection.
const SQUARE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('pointInPolygon', () => {
  it('accepts a point well inside the ring', () => {
    expect(pointInPolygon(5, 5, SQUARE)).toBe(true);
  });

  it('rejects points outside on every side', () => {
    expect(pointInPolygon(-1, 5, SQUARE)).toBe(false);
    expect(pointInPolygon(11, 5, SQUARE)).toBe(false);
    expect(pointInPolygon(5, -1, SQUARE)).toBe(false);
    expect(pointInPolygon(5, 11, SQUARE)).toBe(false);
  });

  it('rejects a point sharing the ring\'s latitude but sitting off to the side', () => {
    // The classic ray-casting trap: same y as an edge, but no crossing.
    expect(pointInPolygon(20, 0, SQUARE)).toBe(false);
  });
});

describe('findZoneAt', () => {
  it('finds the zone a point falls inside, and names it', () => {
    const resident = KARYSTOS_ZONES.find((z) => z.kind === 'resident')!;
    // Centroid of the ring is guaranteed inside for these convex blocks.
    const lng = resident.polygon.reduce((sum, [x]) => sum + x, 0) / resident.polygon.length;
    const lat = resident.polygon.reduce((sum, [, y]) => sum + y, 0) / resident.polygon.length;

    expect(findZoneAt(lng, lat)?.id).toBe(resident.id);
  });

  it('returns null out at sea, well away from every zone', () => {
    expect(findZoneAt(24.5, 37.9)).toBeNull();
  });

  /**
   * A guard on the demo, not on the geometry: the zones are drawn beside the
   * town centre precisely so the demo account -- whose simulated position is
   * the map centre -- can still declare a spot. A zone edited to cover the
   * centre would silently break the pitch's main flow, so fail here instead.
   */
  it('leaves the demo centre and every demo pin declarable', () => {
    expect(findZoneAt(KARYSTOS_CENTER[0], KARYSTOS_CENTER[1])).toBeNull();
    for (const spot of getMockKarystosSpots()) {
      expect(findZoneAt(spot.lng, spot.lat)).toBeNull();
    }
  });
});

describe('zonesToGeoJson', () => {
  it('emits the street axis as a LineString for the map layer', () => {
    const features = zonesToGeoJson().features;
    expect(features).toHaveLength(KARYSTOS_ZONES.length);
    features.forEach((feature, i) => {
      expect(feature.geometry.type).toBe('LineString');
      expect(feature.geometry.coordinates).toEqual(KARYSTOS_ZONES[i].centerline);
    });
  });

  it('carries the zone kind through for the map\'s colour matching', () => {
    const kinds = zonesToGeoJson().features.map((f) => f.properties.kind);
    expect(kinds).toEqual(KARYSTOS_ZONES.map((z) => z.kind));
  });

  it('produces an empty collection when there are no zones', () => {
    expect(zonesToGeoJson([]).features).toEqual([]);
  });
});

describe('zone corridors', () => {
  it('shapes each zone as a narrow strip, not a block', () => {
    // Bounding-box proportions can't answer this: a diagonal street's box is
    // near-square however thin the corridor is. Area against the square of
    // the longest extent can -- a strip of length L and width W covers
    // roughly L*W, so the ratio lands near W/L (small), while a filled block
    // approaches 1.
    for (const zone of KARYSTOS_ZONES) {
      const metres = zone.polygon.map(([lng, lat]): [number, number] => [
        lng * 111_320 * Math.cos((38 * Math.PI) / 180),
        lat * 111_320,
      ]);

      // Shoelace formula.
      let twiceArea = 0;
      for (let i = 0, j = metres.length - 1; i < metres.length; j = i++) {
        twiceArea += metres[j][0] * metres[i][1] - metres[i][0] * metres[j][1];
      }
      const area = Math.abs(twiceArea) / 2;

      const xs = metres.map(([x]) => x);
      const ys = metres.map(([, y]) => y);
      const longest = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

      expect(area / (longest * longest)).toBeLessThan(0.25);
    }
  });

  it('keeps every centreline vertex inside its own zone', () => {
    for (const zone of KARYSTOS_ZONES) {
      for (const [lng, lat] of zone.centerline) {
        expect(findZoneAt(lng, lat)?.id).toBe(zone.id);
      }
    }
  });

  it('excludes a point 100m to the side of the street', () => {
    const [lng, lat] = KARYSTOS_ZONES[0].centerline[2];
    expect(findZoneAt(lng + 0.00115, lat)).toBeNull();
  });
});
