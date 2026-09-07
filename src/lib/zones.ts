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
// They are hand-drawn blocks near the Karystos town centre, shaped to be
// plausible and to demonstrate the mechanism. Before any real deployment
// they must be replaced with the municipality's own surveyed zone geometry
// (the schema already has somewhere to put it: municipalities.boundary is a
// PostGIS polygon column, unused so far -- see 0001_init_schema.sql).
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
 * Karystos pilot zones. Deliberately drawn *beside* the town centre rather
 * than over it, so the centre itself stays declarable -- both for real
 * drivers and for the demo account, whose simulated position sits exactly on
 * the map centre.
 */
export const KARYSTOS_ZONES: ParkingZone[] = [
  {
    id: 'karystos-centre-west',
    name: 'Κέντρο — Δυτικό Τμήμα',
    kind: 'resident',
    polygon: [
      [24.412, 38.0182],
      [24.4152, 38.0182],
      [24.4152, 38.016],
      [24.412, 38.016],
    ],
  },
  {
    id: 'karystos-port',
    name: 'Παραλιακή — Λιμάνι',
    kind: 'controlled',
    polygon: [
      [24.418, 38.016],
      [24.4215, 38.016],
      [24.4215, 38.014],
      [24.418, 38.014],
    ],
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
