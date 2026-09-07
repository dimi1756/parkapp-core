import { describe, it, expect } from 'vitest';
import { buildZone, findZoneAt, pointInPolygon, zonesToGeoJson, type ParkingZone } from './zones';

// Stand-ins for what a municipality admin would draw: one diagonal street
// and one that runs east-west, so the corridor maths is exercised at more
// than one orientation.
const ZONES: ParkingZone[] = [
  buildZone({
    id: 'zone-diagonal',
    name: 'Οδός Σαχτούρη',
    kind: 'resident',
    centerline: [
      [24.4128, 38.0152],
      [24.4138, 38.0167],
      [24.4148, 38.0184],
    ],
    widthMeters: 28,
  }),
  buildZone({
    id: 'zone-straight',
    name: 'Παραλιακή Λεωφόρος',
    kind: 'controlled',
    centerline: [
      [24.415, 38.0142],
      [24.4183, 38.0145],
      [24.4212, 38.0149],
    ],
    widthMeters: 36,
  }),
];

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
    const resident = ZONES.find((z) => z.kind === 'resident')!;
    // Centroid of the ring is guaranteed inside for these convex blocks.
    const lng = resident.polygon.reduce((sum, [x]) => sum + x, 0) / resident.polygon.length;
    const lat = resident.polygon.reduce((sum, [, y]) => sum + y, 0) / resident.polygon.length;

    expect(findZoneAt(lng, lat, ZONES)?.id).toBe(resident.id);
  });

  it('returns null out at sea, well away from every zone', () => {
    expect(findZoneAt(24.5, 37.9, ZONES)).toBeNull();
  });

});

describe('zonesToGeoJson', () => {
  it('emits the street axis as a LineString for the map layer', () => {
    const features = zonesToGeoJson(ZONES).features;
    expect(features).toHaveLength(ZONES.length);
    features.forEach((feature, i) => {
      expect(feature.geometry.type).toBe('LineString');
      expect(feature.geometry.coordinates).toEqual(ZONES[i].centerline);
    });
  });

  it('carries the zone kind through for the map\'s colour matching', () => {
    const kinds = zonesToGeoJson(ZONES).features.map((f) => f.properties.kind);
    expect(kinds).toEqual(ZONES.map((z) => z.kind));
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
    for (const zone of ZONES) {
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
    for (const zone of ZONES) {
      for (const [lng, lat] of zone.centerline) {
        expect(findZoneAt(lng, lat, ZONES)?.id).toBe(zone.id);
      }
    }
  });

  it('excludes a point 100m to the side of the street', () => {
    const [lng, lat] = ZONES[0].centerline[2];
    expect(findZoneAt(lng + 0.00115, lat, ZONES)).toBeNull();
  });
});

describe('zone widths', () => {
  it('makes a wider zone cover more ground than a narrow one on the same street', () => {
    const centerline: [number, number][] = [
      [24.415, 38.016],
      [24.417, 38.016],
    ];
    const narrow = buildZone({ id: 'n', name: 'n', kind: 'resident', centerline, widthMeters: 10 });
    const wide = buildZone({ id: 'w', name: 'w', kind: 'resident', centerline, widthMeters: 60 });

    // ~20m north of the axis: outside the 10m corridor, inside the 60m one.
    const offsetLat = 38.016 + 20 / 111_320;
    expect(findZoneAt(24.416, offsetLat, [narrow])).toBeNull();
    expect(findZoneAt(24.416, offsetLat, [wide])?.id).toBe('w');
  });
});
