// PostGIS geography columns come back from PostgREST as WKB hex.
//
// Only one shape is ever written by this app -- "SRID=4326;POINT(lng lat)",
// via toEwkt in the Edge Functions -- so this reads exactly that subset
// rather than pulling in a full WKB parser for a single field.
//
// Layout of the 25 bytes we care about: byte 0 is the endianness flag,
// bytes 1-4 the geometry type, 5-8 the SRID, then two float64s -- longitude
// at offset 9, latitude at 17.

export interface LngLat {
  lng: number;
  lat: number;
}

/** Returns null for anything that isn't a parseable point, so callers can drop the row. */
export function parseEwkbPoint(hex: string): LngLat | null {
  try {
    const bytes = hex.match(/.{1,2}/g);
    if (!bytes || bytes.length < 25) return null;
    const buf = new Uint8Array(bytes.map((b) => parseInt(b, 16)));
    const view = new DataView(buf.buffer);
    const littleEndian = buf[0] === 1;
    const lng = view.getFloat64(9, littleEndian);
    const lat = view.getFloat64(17, littleEndian);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
