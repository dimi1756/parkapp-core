import type { StringKey } from '@/i18n/strings';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Badge {
  tier: BadgeTier;
  labelKey: StringKey;
  minPoints: number;
  colorClass: string;
}

// Ordered highest-first so getBadgeForPoints can return the first tier a
// user's accumulated points_balance clears. Thresholds are calibrated
// against real point sizes in this app (+10 declare, +5 spotted/manual
// unpark bonus): Silver is roughly "a week of regular use", Platinum is
// "power user", not an unreachable vanity tier.
const BADGE_TIERS: Badge[] = [
  { tier: 'platinum', labelKey: 'leaderboard.badge.platinum', minPoints: 700, colorClass: 'text-sky-600 bg-sky-100' },
  { tier: 'gold', labelKey: 'leaderboard.badge.gold', minPoints: 300, colorClass: 'text-amber-600 bg-amber-100' },
  { tier: 'silver', labelKey: 'leaderboard.badge.silver', minPoints: 100, colorClass: 'text-slate-600 bg-slate-200' },
  { tier: 'bronze', labelKey: 'leaderboard.badge.bronze', minPoints: 0, colorClass: 'text-amber-800 bg-amber-200/60' },
];

export function getBadgeForPoints(points: number): Badge {
  return BADGE_TIERS.find((b) => points >= b.minPoints) ?? BADGE_TIERS[BADGE_TIERS.length - 1];
}

/** Tiers ordered lowest-first, for rendering a full progression list (League modal). */
export function getAllTiers(): Badge[] {
  return [...BADGE_TIERS].reverse();
}

export interface NextTierInfo {
  /** null once the user has already cleared the top tier (Platinum). */
  nextTier: Badge | null;
  pointsToNext: number;
}

/** +10 for declaring your own spot free ("vacating") -- the single most
 *  common, highest-value action -- used to translate a raw point gap into
 *  an approachable "~N more spots" estimate for the League modal. */
const POINTS_PER_TYPICAL_SPOT = 10;

export function getNextTierInfo(points: number): NextTierInfo {
  const currentIndex = BADGE_TIERS.findIndex((b) => points >= b.minPoints);
  const nextTier = currentIndex > 0 ? BADGE_TIERS[currentIndex - 1] : null;
  return {
    nextTier,
    pointsToNext: nextTier ? Math.max(0, nextTier.minPoints - points) : 0,
  };
}

export function estimateSpotsToNext(pointsToNext: number): number {
  return Math.ceil(pointsToNext / POINTS_PER_TYPICAL_SPOT);
}
