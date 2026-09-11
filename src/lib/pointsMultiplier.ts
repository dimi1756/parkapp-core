// Multiplier helper used by any component that awards or displays points.
// The canonical check lives in confirm_spot_arrival RPC (server-side authority);
// this mirrors it client-side for UI feedback only -- never trust it for writes.

export interface MultiplierProfile {
  multiplier_active_until?: string | null;
}

export interface PointsResult {
  finalPoints: number;
  multiplier: number;
  multiplierActive: boolean;
  expiresAt: Date | null;
}

export function calculatePoints(basePoints: number, profile: MultiplierProfile): PointsResult {
  const expiresAt = profile.multiplier_active_until
    ? new Date(profile.multiplier_active_until)
    : null;

  const multiplierActive = expiresAt !== null && new Date() < expiresAt;
  const multiplier = multiplierActive ? 2 : 1;

  return {
    finalPoints: Math.floor(basePoints * multiplier),
    multiplier,
    multiplierActive,
    expiresAt,
  };
}

// Remaining duration string for UI badge, e.g. "18h 32m"
export function formatMultiplierRemaining(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return '';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
