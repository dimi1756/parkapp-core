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
   * The street axis, as [lng, lat] pairs. This is what gets DRAWN: a thick
   * line following the road reads as "this street is protected", where a
   * polygon inevitably spilled over the buildings either side of it.
   */
  centerline: [number, number][];
  /** How far the rule reaches either side of the axis, in metres. */
  widthMeters: number;
  /**
   * Corridor ring derived from the centreline, used for the point-in-zone
   * TEST only -- never drawn. Closed implicitly: the last point connects
   * back to the first, so it isn't repeated.
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
/** Pushes the first and last vertices outward along their own direction of travel. */
function extendEnds(centerline: [number, number][], meters: number): [number, number][] {
  if (centerline.length < 2) return centerline;
  const METERS_PER_DEG_LAT = 111_320;

  const push = (from: [number, number], toward: [number, number]): [number, number] => {
    const latScale = Math.cos((from[1] * Math.PI) / 180);
    const dx = (from[0] - toward[0]) * METERS_PER_DEG_LAT * latScale;
    const dy = (from[1] - toward[1]) * METERS_PER_DEG_LAT;
    const length = Math.hypot(dx, dy) || 1;
    return [
      from[0] + ((dx / length) * meters) / (METERS_PER_DEG_LAT * latScale),
      from[1] + ((dy / length) * meters) / METERS_PER_DEG_LAT,
    ];
  };

  const first = push(centerline[0], centerline[1]);
  const last = push(centerline[centerline.length - 1], centerline[centerline.length - 2]);
  return [first, ...centerline.slice(1, -1), last];
}

function corridorFromCenterline(rawCenterline: [number, number][], widthMeters: number): [number, number][] {
  const METERS_PER_DEG_LAT = 111_320;
  const half = widthMeters / 2;

  // Extend half a width past each end before offsetting. Without it the end
  // caps pass exactly through the first and last vertices, leaving them on
  // the boundary rather than inside -- and a street's parking rule doesn't
  // stop dead at the last point someone happened to trace, either.
  const centerline = extendEnds(rawCenterline, half);

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
const SAHTOURI_AXIS: [number, number][] = [
  [24.4128, 38.0152],
  [24.4133, 38.0159],
  [24.4138, 38.0167],
  [24.4143, 38.0176],
  [24.4148, 38.0184],
];

const WATERFRONT_AXIS: [number, number][] = [
  [24.415, 38.0142],
  [24.4161, 38.0143],
  [24.4172, 38.0144],
  [24.4183, 38.0145],
  [24.4194, 38.0146],
  [24.4203, 38.0147],
  [24.4212, 38.0149],
];

function zone(
  id: string,
  name: string,
  kind: ZoneKind,
  centerline: [number, number][],
  widthMeters: number
): ParkingZone {
  return { id, name, kind, centerline, widthMeters, polygon: corridorFromCenterline(centerline, widthMeters) };
}

/**
 * Karystos pilot zones, as street axes.
 *
 * Deliberately drawn *beside* the town centre rather than over it, so the
 * centre itself stays declarable -- both for real drivers and for the demo
 * account, whose simulated position sits exactly on the map centre. A test
 * guards that (see zones.test.ts).
 */
export const KARYSTOS_ZONES: ParkingZone[] = [
  zone('karystos-sahtouri', 'Οδός Σαχτούρη', 'resident', SAHTOURI_AXIS, 28),
  zone('karystos-waterfront', 'Παραλιακή Λεωφόρος', 'controlled', WATERFRONT_AXIS, 36),
];

/** Midpoint of a zone's axis -- where its info marker sits. */
export function zoneCenter(zone: ParkingZone): [number, number] {
  return zone.centerline[Math.floor(zone.centerline.length / 2)];
}

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
 * Zones as GeoJSON LineStrings for the map's line layer.
 *
 * Rendering the axis as a thick line rather than filling the corridor
 * polygon is what makes this read as a street: a wide `line-width` hugs the
 * road at every zoom, while a polygon drawn from the same data visibly
 * covered the buildings on either side. The corridor polygon still exists,
 * but only as the hit test behind findZoneAt.
 *
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
        type: 'LineString' as const,
        coordinates: zone.centerline,
      },
    })),
  };
}
