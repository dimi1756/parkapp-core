/**
 * Parking Availability Scoring Engine
 *
 * Combines time-decay, weather, peak-hour, reporter trust, photo evidence,
 * and community feedback into a single 0–100 score with confidence tier.
 */

// ─── Input ────────────────────────────────────────────────────────────────────

export interface ParkingAvailabilityContext {
  /** ISO timestamp or Date of when the spot was released / reported */
  reportedAt: string | Date;
  /** 0–1: derived from user level/reliability (higher = more trusted) */
  reporterTrustScore: number;
  hasPhotoEvidence: boolean;
  upvotes: number;
  downvotes: number;
  currentWeather: {
    isRaining: boolean;
    temperature: number; // °C — reserved for future heat/cold modifiers
  };
  /**
   * True during morning (08:30–10:00) and evening (17:30–20:00) rush hours
   * on weekdays. Callers may compute this from the current time; a helper
   * `isPeakHourNow()` is exported below for convenience.
   */
  isPeakHour: boolean;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type PinColor = 'green' | 'amber' | 'red';
export type SupportedLanguage = 'en' | 'gr' | 'tr' | 'pl';

export interface AvailabilityScore {
  score: number;           // 0–100, integer
  confidenceLevel: ConfidenceLevel;
  pinColor: PinColor;
  statusLabel: string;     // human-readable, in the requested language
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ConfidenceLevel, Record<SupportedLanguage, string>> = {
  HIGH: {
    en: 'Very likely available',
    gr: 'Πολύ πιθανό',
    tr: 'Büyük ihtimalle müsait',
    pl: 'Bardzo prawdopodobne',
  },
  MEDIUM: {
    en: 'Moderate availability',
    gr: 'Μέτρια διαθεσιμότητα',
    tr: 'Orta düzeyde müsait',
    pl: 'Umiarkowana dostępność',
  },
  LOW: {
    en: 'Probably taken',
    gr: 'Πιθανόν κατειλημμένο',
    tr: 'Muhtemelen dolu',
    pl: 'Prawdopodobnie zajęte',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `date` falls within a weekday rush-hour window:
 *   morning  08:30–10:00
 *   evening  17:30–20:00
 */
export function isPeakHourNow(date: Date = new Date()): boolean {
  const day = date.getDay(); // 0=Sun … 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  return (mins >= 510 && mins < 600) || (mins >= 1050 && mins < 1200);
  //      08:30–10:00                    17:30–20:00
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function minutesElapsed(reportedAt: string | Date): number {
  const reported = typeof reportedAt === 'string' ? new Date(reportedAt) : reportedAt;
  return (Date.now() - reported.getTime()) / 60_000;
}

// ─── Core algorithm ───────────────────────────────────────────────────────────

/**
 * Calculate the availability score for a reported parking spot.
 *
 * @param ctx     - Spot context (trust, weather, timing, feedback…)
 * @param lang    - Language for the status label (default: 'gr')
 * @returns       - `{ score, confidenceLevel, pinColor, statusLabel }`
 */
export function calculateAvailability(
  ctx: ParkingAvailabilityContext,
  lang: SupportedLanguage = 'gr',
): AvailabilityScore {
  // 1. Time decay ─────────────────────────────────────────────────────────────
  //    Weather and peak-hour compress the effective elapsed time so that
  //    a rainy rush-hour report ages 1.3 × 1.4 = 1.82× faster.

  const rawMinutes = minutesElapsed(ctx.reportedAt);
  let decayMultiplier = 1.0;
  if (ctx.currentWeather.isRaining) decayMultiplier *= 1.3;
  if (ctx.isPeakHour) decayMultiplier *= 1.4;
  const m = rawMinutes * decayMultiplier; // effective age in minutes

  let timeDecay: number;
  if (m <= 5) {
    timeDecay = 0;
  } else if (m <= 15) {
    timeDecay = (m - 5) * 3;           // −3 pts/min for minutes 5–15
  } else if (m <= 30) {
    timeDecay = 30 + (m - 15) * 5;    // −5 pts/min for minutes 15–30
  } else {
    // Older than 30 effective minutes → expired
    return buildResult(0, lang);
  }

  let score = 100 - timeDecay;

  // 2. Trust & evidence multiplier ────────────────────────────────────────────
  score *= 0.7 + ctx.reporterTrustScore * 0.3;
  if (ctx.hasPhotoEvidence) score += 10;

  // 3. Community feedback ─────────────────────────────────────────────────────
  score += ctx.upvotes * 5 - ctx.downvotes * 15;

  // 4. Clamp ─────────────────────────────────────────────────────────────────
  score = clamp(Math.round(score), 0, 100);

  return buildResult(score, lang);
}

function buildResult(score: number, lang: SupportedLanguage): AvailabilityScore {
  const confidenceLevel: ConfidenceLevel =
    score > 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  const pinColor: PinColor =
    confidenceLevel === 'HIGH' ? 'green' : confidenceLevel === 'MEDIUM' ? 'amber' : 'red';
  return {
    score,
    confidenceLevel,
    pinColor,
    statusLabel: STATUS_LABELS[confidenceLevel][lang],
  };
}

// ─── Worked examples (not runtime code) ───────────────────────────────────────
/*
  Example A — Fresh report, trusted reporter, sunny, off-peak
  ───────────────────────────────────────────────────────────
  ctx = {
    reportedAt: 2 minutes ago,
    reporterTrustScore: 0.9,
    hasPhotoEvidence: true,
    upvotes: 2, downvotes: 0,
    currentWeather: { isRaining: false, temperature: 20 },
    isPeakHour: false,
  }
  effectiveMinutes = 2 × 1.0 = 2  → timeDecay = 0
  score after decay      = 100
  trust multiplier       = 0.7 + 0.9×0.3 = 0.97   → 97
  photo bonus            = +10                      → 107 → clamped 100
  community              = +10                      → clamped 100
  ► score=100, HIGH, green, 'Πολύ πιθανό'

  Example B — 8 minutes old, average trust, raining, peak hour
  ─────────────────────────────────────────────────────────────
  ctx = {
    reportedAt: 8 minutes ago,
    reporterTrustScore: 0.5,
    hasPhotoEvidence: false,
    upvotes: 0, downvotes: 1,
    currentWeather: { isRaining: true, temperature: 12 },
    isPeakHour: true,
  }
  effectiveMinutes = 8 × 1.3 × 1.4 ≈ 14.56  → in range (5-15]
  timeDecay        = (14.56 - 5) × 3 ≈ 28.68
  score after decay= 100 - 28.68 ≈ 71.32
  trust multiplier = 0.7 + 0.5×0.3 = 0.85   → 60.6
  photo bonus      = 0
  community        = 0×5 - 1×15 = −15        → 45.6 → rounded 46
  ► score=46, MEDIUM, amber, 'Μέτρια διαθεσιμότητα'

  Example C — 25 minutes old, untrusted, raining (effective >30 min)
  ──────────────────────────────────────────────────────────────────
  ctx = {
    reportedAt: 25 minutes ago,
    reporterTrustScore: 0.2,
    hasPhotoEvidence: false,
    upvotes: 0, downvotes: 2,
    currentWeather: { isRaining: true, temperature: 8 },
    isPeakHour: false,
  }
  effectiveMinutes = 25 × 1.3 = 32.5  → >30 → expired
  ► score=0, LOW, red, 'Πιθανόν κατειλημμένο'
*/
