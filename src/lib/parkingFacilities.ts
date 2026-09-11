// Off-street parking: public and private closed lots and garages.
//
// This is the layer that answers the cold-start question (Investor Package,
// Q&A #1). Peer-to-peer needs drivers before it has anything to show; a
// municipal car park is useful on day one, before a single user has declared
// anything. So it renders alongside the community pins rather than as a
// separate mode.
//
// ---------------------------------------------------------------------------
// PILOT SEED DATA, NOT A LIVE FEED. Occupancy here is a fixed number in a
// file, not a reading from a barrier system. The real version is an
// integration with each operator's gate/barrier API (Phase 2 in the
// investor material) writing into a parking_facilities table; this module's
// shape is deliberately what that table would return, so swapping the
// source is a change of loader, not of UI. Do not present these occupancy
// figures as live.
// ---------------------------------------------------------------------------

export type FacilityKind = 'public' | 'private';

export interface ParkingFacility {
  id: string;
  name: string;
  kind: FacilityKind;
  lng: number;
  lat: number;
  /** Total spaces. */
  capacity: number;
  /** Spaces currently taken. Never above capacity. */
  occupied: number;
  /** Euro per hour; null for a free municipal lot. */
  pricePerHour: number | null;
  /** Free-text opening hours, already localised where it matters ("24/7" reads the same everywhere). */
  hours: string;
}

export type OccupancyLevel = 'low' | 'medium' | 'full';

/** Fraction of spaces taken, 0-1. Guards against a zero capacity in bad data. */
export function occupancyRatio(facility: ParkingFacility): number {
  if (facility.capacity <= 0) return 1;
  return Math.min(1, Math.max(0, facility.occupied / facility.capacity));
}

export function freeSpaces(facility: ParkingFacility): number {
  return Math.max(0, facility.capacity - facility.occupied);
}

/**
 * Green / amber / red, on the same thresholds the map markers and the
 * details card both read from -- a marker that shows green next to a card
 * that says "nearly full" is worse than no indicator at all.
 */
export function occupancyLevel(facility: ParkingFacility): OccupancyLevel {
  const ratio = occupancyRatio(facility);
  if (ratio < 0.7) return 'low';
  if (ratio < 0.9) return 'medium';
  return 'full';
}

/** Marker/bar colour per level. Matches the app's success/warning/destructive roles. */
export const OCCUPANCY_COLOR: Record<OccupancyLevel, string> = {
  low: '#16a34a',
  medium: '#f59e0b',
  full: '#dc2626',
};

/**
 * Karystos pilot facilities. Positioned around the town centre and port so
 * they read as distinct locations rather than one cluster, and deliberately
 * spread across all three occupancy levels so the indicator is legible at a
 * glance during a demo.
 */
export const PILOT_FACILITIES: ParkingFacility[] = [
  {
    id: 'facility-dimotiko',
    name: 'Δημοτικό Πάρκινγκ Καρύστου',
    kind: 'public',
    lng: 24.4189,
    lat: 38.0178,
    capacity: 120,
    occupied: 61,
    pricePerHour: null,
    hours: '24/7',
  },
  {
    id: 'facility-limani',
    name: 'Πάρκινγκ Λιμένος',
    kind: 'public',
    lng: 24.4205,
    lat: 38.0155,
    capacity: 80,
    occupied: 62,
    pricePerHour: 1,
    hours: '07:00 – 23:00',
  },
  {
    id: 'facility-plaza',
    name: 'Plaza Garage',
    kind: 'private',
    lng: 24.4142,
    lat: 38.0196,
    capacity: 45,
    occupied: 43,
    pricePerHour: 2.5,
    hours: '08:00 – 22:00',
  },
];
