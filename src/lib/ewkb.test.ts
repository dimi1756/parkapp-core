import { describe, it, expect } from 'vitest';
import { parseEwkbPoint } from './ewkb';

/** Builds the exact hex PostgREST returns for SRID=4326;POINT(lng lat). */
function ewkbHex(lng: number, lat: number): string {
  const buf = new ArrayBuffer(25);
  const view = new DataView(buf);
  view.setUint8(0, 1); // little endian
  view.setUint32(1, 0x20000001, true); // point, with SRID flag
  view.setUint32(5, 4326, true);
  view.setFloat64(9, lng, true);
  view.setFloat64(17, lat, true);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('parseEwkbPoint', () => {
  it('round-trips a point written the way the Edge Functions write them', () => {
    const point = parseEwkbPoint(ewkbHex(24.4191, 38.0193));
    expect(point?.lng).toBeCloseTo(24.4191, 9);
    expect(point?.lat).toBeCloseTo(38.0193, 9);
  });

  it('handles negative coordinates', () => {
    const point = parseEwkbPoint(ewkbHex(-0.1276, 51.5072));
    expect(point?.lng).toBeCloseTo(-0.1276, 9);
    expect(point?.lat).toBeCloseTo(51.5072, 9);
  });

  it('returns null rather than a bogus coordinate for unusable input', () => {
    expect(parseEwkbPoint('')).toBeNull();
    expect(parseEwkbPoint('0101')).toBeNull(); // too short to hold two float64s
    expect(parseEwkbPoint('zzzz')).toBeNull();
  });
});
