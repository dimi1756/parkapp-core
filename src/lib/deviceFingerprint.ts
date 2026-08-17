const STORAGE_KEY = 'parkapp_device_id';

/**
 * Best-effort per-device identifier: a random id persisted in localStorage
 * the first time it's needed, then reused forever after on that browser.
 * This is not hardware attestation -- it's trivially reset by clearing
 * browser storage or opening a private window -- but it raises the bar over
 * having nothing at all. It's written once to profiles.device_fingerprint at
 * signup (see AuthContext.signUp), letting declare-spot's Edge Function
 * scope its hourly/daily rate limits to "this browser install" in addition
 * to "this account", so spinning up a second free account on the same
 * device doesn't reset the clock.
 */
export function getDeviceFingerprint(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Storage disabled/full/blocked (private mode in some browsers) -- no
    // fingerprint this session rather than a broken signup.
    return null;
  }
}
