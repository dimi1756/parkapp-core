// The circle a municipality's pilot actually covers.
//
// Two jobs: draw the boundary on the driver's map, and refuse actions taken
// outside it. Both need the same shape, so the geometry lives here rather
// than being derived twice.

export interface OperatingArea {
  /** Centre of the covered area, [lng, lat]. */
  center: [number, number];
  radiusKm: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. Same haversine the Edge Functions use. */
export function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Is this point inside the covered area?
 *
 * A null area means the municipality hasn't drawn its boundary yet, and that
 * is deliberately treated as "everywhere is allowed": an unconfigured city
 * must not lock its own drivers out of an app that worked yesterday.
 */
export function isInsideOperatingArea(lng: number, lat: number, area: OperatingArea | null): boolean {
  if (!area) return true;
  return distanceMeters(lng, lat, area.center[0], area.center[1]) <= area.radiusKm * 1000;
}

/** How far outside the area a point is, in km. 0 when inside, or with no area set. */
export function distanceOutsideKm(lng: number, lat: number, area: OperatingArea | null): number {
  if (!area) return 0;
  const km = distanceMeters(lng, lat, area.center[0], area.center[1]) / 1000;
  return Math.max(0, km - area.radiusKm);
}

/**
 * The area as a GeoJSON Polygon, for the map's fill/outline layers.
 *
 * Built here rather than with turf.circle: this is one loop of trigonometry,
 * and Turf would be a new runtime dependency carried into every bundle for
 * it. Latitude is offset directly; longitude is divided by cos(lat) so the
 * ring stays circular on the ground instead of squashing as it moves north.
 *
 * Untyped literal rather than a GeoJSON.* annotation -- the global GeoJSON
 * namespace isn't resolvable in this project's tsconfig, and mapboxgl's
 * addSource accepts this shape (the same approach the route and zone layers
 * already take).
 */
export function operatingAreaToGeoJson(area: OperatingArea, steps = 96) {
  const [centerLng, centerLat] = area.center;
  const radiusDegLat = (area.radiusKm * 1000) / 111_320;
  const radiusDegLng = radiusDegLat / Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01);

  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([centerLng + radiusDegLng * Math.cos(angle), centerLat + radiusDegLat * Math.sin(angle)]);
  }
  // GeoJSON requires the ring to be explicitly closed.
  ring.push(ring[0]);

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      },
    ],
  };
}
