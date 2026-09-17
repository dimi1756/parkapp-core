/**
 * Greek → Latin transliteration (ELOT 743 / ISO 843 simplified).
 * Safe to call on any string: non-Greek characters pass through unchanged.
 * Intended for display only — not for official documents or IDs.
 */

// Diphthongs and digraphs must be matched before their component letters.
const MULTI: [RegExp, string][] = [
  // ου
  [/ΟΥ/g, 'OU'], [/Ου/g, 'Ou'], [/ου/g, 'ou'],
  // αι
  [/ΑΙ/g, 'AI'], [/Αι/g, 'Ai'], [/αι/g, 'ai'],
  // ει
  [/ΕΙ/g, 'EI'], [/Ει/g, 'Ei'], [/ει/g, 'ei'],
  // οι
  [/ΟΙ/g, 'OI'], [/Οι/g, 'Oi'], [/οι/g, 'oi'],
  // αυ / ευ — simplified to av/ev (correct ~85 % of the time)
  [/ΑΥ/g, 'AV'], [/Αυ/g, 'Av'], [/αυ/g, 'av'],
  [/ΕΥ/g, 'EV'], [/Ευ/g, 'Ev'], [/ευ/g, 'ev'],
  // μπ → b
  [/ΜΠ/g, 'B'],  [/Μπ/g, 'B'],  [/μπ/g, 'b'],
  // γκ → g
  [/ΓΚ/g, 'G'],  [/Γκ/g, 'G'],  [/γκ/g, 'g'],
  // γγ → ng
  [/ΓΓ/g, 'NG'], [/γγ/g, 'ng'],
  // τσ / τζ
  [/ΤΣ/g, 'TS'], [/Τσ/g, 'Ts'], [/τσ/g, 'ts'],
  [/ΤΖ/g, 'TZ'], [/Τζ/g, 'Tz'], [/τζ/g, 'tz'],
];

const SINGLE: [RegExp, string][] = [
  [/[Αά]/g, 'A'], [/[αά]/g, 'a'],
  [/Β/g, 'V'], [/β/g, 'v'],
  [/Γ/g, 'G'], [/γ/g, 'g'],
  [/Δ/g, 'D'], [/δ/g, 'd'],
  [/[Εέ]/g, 'E'], [/[εέ]/g, 'e'],
  [/Ζ/g, 'Z'], [/ζ/g, 'z'],
  [/[Ηή]/g, 'I'], [/[ηή]/g, 'i'],
  [/Θ/g, 'Th'], [/θ/g, 'th'],
  [/[Ιίϊΐ]/g, 'I'], [/[ιίϊΐ]/g, 'i'],
  [/Κ/g, 'K'], [/κ/g, 'k'],
  [/Λ/g, 'L'], [/λ/g, 'l'],
  [/Μ/g, 'M'], [/μ/g, 'm'],
  [/Ν/g, 'N'], [/ν/g, 'n'],
  [/Ξ/g, 'X'], [/ξ/g, 'x'],
  [/[Οό]/g, 'O'], [/[οό]/g, 'o'],
  [/Π/g, 'P'], [/π/g, 'p'],
  [/Ρ/g, 'R'], [/ρ/g, 'r'],
  [/Σ/g, 'S'], [/[σς]/g, 's'],
  [/Τ/g, 'T'], [/τ/g, 't'],
  [/[Υύϋΰ]/g, 'Y'], [/[υύϋΰ]/g, 'y'],
  [/Φ/g, 'F'], [/φ/g, 'f'],
  [/Χ/g, 'Ch'], [/χ/g, 'ch'],
  [/Ψ/g, 'Ps'], [/ψ/g, 'ps'],
  [/[Ωώ]/g, 'O'], [/[ωώ]/g, 'o'],
];

export function transliterateGreek(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of MULTI) result = result.replace(pattern, replacement);
  for (const [pattern, replacement] of SINGLE) result = result.replace(pattern, replacement);
  return result;
}
