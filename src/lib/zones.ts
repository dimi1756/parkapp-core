// Controlled / resident parking zones.
//
// The pilot's core legal promise (Investor Package, Slide 4): the
// peer-to-peer layer never touches a municipality's controlled parking
// zones. Those spaces belong to residents and are enforced by the municipal
// police -- a crowdsourced "this spot is free" pin inside one is exactly the
// friction the product is designed to avoid. So a declaration inside a zone
// is refused at the point of declaring, and the zones are drawn on the map
// so a driver understands why before they try.
//
// ---------------------------------------------------------------------------
// THE COORDINATES BELOW ARE PLACEHOLDER PILOT DATA, NOT OFFICIAL BOUNDARIES.
// They are hand-drawn corridors approximating streets near the Karystos town
// centre -- close enough to read as "this street is protected", but traced by
// eye, not surveyed. The street names are real; the geometry under them is
// not authoritative. Before any real deployment both must come from the
// municipality's own GIS export (the schema already has somewhere to put it:
// municipalities.boundary is a PostGIS polygon column, unused so far -- see
// 0001_init_schema.sql).
// ---------------------------------------------------------------------------

export type ZoneKind =
  /** Residents-only parking. Crowdsourcing is excluded outright. */
  | 'resident'
  /** Paid/controlled municipal parking. Also excluded during the pilot. */
  | 'controlled';

export interface ParkingZone {
  id: string;
  /** Local place name -- a proper noun, so it reads the same in every UI language. */
  name: string;
  kind: ZoneKind;
  /**
   * Outer ring as [lng, lat] pairs, in order. The ring is closed implicitly:
   * the last point connects back to the first, so don't repeat it.
   */
  polygon: [number, number][];
}

/**
 * Turns a street centreline into a narrow corridor polygon.
 *
 * Zones follow streets, not city blocks -- what a municipality protects is
 * "Sahtouri street and its parking bays", not an abstract rectangle laid
 * over a neighbourhood. Offsetting each segment perpendicular by half the
 * corridor width and walking back down the other side produces exactly that
 * shape from a handful of points.
 *
 * Longitude degrees shrink with latitude, so the horizontal offset is
 * divided by cos(lat) to keep the corridor the same real-world width along
 * its whole length. Joins are butt-ended rather than mitred: at these widths
 * (25-40m) against gently curving streets the difference is centimetres.
 */
function corridorFromCenterline(centerline: [number, number][], widthMeters: number): [number, number][] {
  const METERS_PER_DEG_LAT = 111_320;
  const half = widthMeters / 2;
  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < centerline.length; i++) {
    // Direction of travel at this point: the segment ahead, or the one
    // behind for the final point.
    const [aLng, aLat] = centerline[Math.max(0, i - (i === centerline.length - 1 ? 1 : 0))];
    const [bLng, bLat] = centerline[Math.min(centerline.length - 1, i + (i === centerline.length - 1 ? 0 : 1))];

    const latScale = Math.cos((aLat * Math.PI) / 180);
    // Segment vector in metres, so the perpendicular is a true right angle
    // on the ground rather than in degree-space.
    const dx = (bLng - aLng) * METERS_PER_DEG_LAT * latScale;
    const dy = (bLat - aLat) * METERS_PER_DEG_LAT;
    const length = Math.hypot(dx, dy) || 1;
    // Unit normal, back in degrees.
    const nLng = (-dy / length) * (half / (METERS_PER_DEG_LAT * latScale));
    const nLat = (dx / length) * (half / METERS_PER_DEG_LAT);

    const [lng, lat] = centerline[i];
    left.push([lng + nLng, lat + nLat]);
    right.push([lng - nLng, lat - nLat]);
  }

  // Down one side, back up the other: a closed ring.
  return [...left, ...right.reverse()];
}

/**
 * Karystos pilot zones, as street corridors.
 *
 * Deliberately drawn *beside* the town centre rather than over it, so the
 * centre itself stays declarable -- both for real drivers and for the demo
 * account, whose simulated position sits exactly on the map centre. A test
 * guards that (see zones.test.ts).
 */
export const KARYSTOS_ZONES: ParkingZone[] = [
  {
    id: 'karystos-sahtouri',
    name: 'Οδός Σαχτούρη',
    kind: 'resident',
    // Runs inland, north-east from the shore: the commercial/residential
    // spine where resident permits actually bite.
    polygon: corridorFromCenterline(
      [
        [24.4128, 38.0152],
        [24.4136, 38.0163],
        [24.4142, 38.0174],
        [24.4148, 38.0184],
      ],
      28
    ),
  },
  {
    id: 'karystos-waterfront',
    name: 'Παραλιακή Λεωφόρος',
    kind: 'controlled',
    // The seafront strip: paid municipal parking along the promenade.
    polygon: corridorFromCenterline(
      [
        [24.415, 38.0142],
        [24.4172, 38.0144],
        [24.4194, 38.0146],
        [24.4212, 38.0149],
      ],
      36
    ),
  },
];

/**
 * Standard ray-casting point-in-polygon test: count how many times a ray
 * cast from the point crosses the ring's edges -- odd means inside. Chosen
 * over pulling in a geometry library for one predicate, and it's exact for
 * the small, simple, non-self-intersecting rings above. At city scale the
 * flat-earth approximation is far below the GPS accuracy the declaration
 * flow already tolerates.
 */
export function pointInPolygon(lng: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    // Does the edge straddle the point's latitude, and is the crossing to
    // the right of the point?
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** The zone containing this point, or null when it's free to declare in. */
export function findZoneAt(lng: number, lat: number, zones: ParkingZone[] = KARYSTOS_ZONES): ParkingZone | null {
  return zones.find((zone) => pointInPolygon(lng, lat, zone.polygon)) ?? null;
}

/**
 * Zones as a GeoJSON FeatureCollection for the map's fill/outline layers.
 * Untyped literal rather than an explicit GeoJSON.* annotation -- the global
 * GeoJSON namespace isn't resolvable in this project's tsconfig, and
 * mapboxgl's addSource accepts this shape (same approach the route layer in
 * MapboxMap already takes).
 */
export function zonesToGeoJson(zones: ParkingZone[] = KARYSTOS_ZONES) {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, name: zone.name, kind: zone.kind },
      geometry: {
        type: 'Polygon' as const,
        // GeoJSON requires the ring to be explicitly closed.
        coordinates: [[...zone.polygon, zone.polygon[0]]],
      },
    })),
  };
}
