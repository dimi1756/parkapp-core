# ParkApp — Master Plan (Task Observer)

This file is the single source of truth for the MVP → production-pilot hardening
work. It is read at the start of every execution chunk and updated at the end
of every chunk. One chunk is implemented per turn; after updating this file
the assistant stops and asks for explicit permission before starting the next
chunk.

**Process for each chunk:**
1. Read this file, find the next `[ ] PENDING` chunk.
2. Adopt the persona named in that chunk.
3. Implement only that chunk's tasks.
4. Update this file: flip the chunk to `[x] COMPLETED`, note what actually
   shipped (plans can drift from reality once real code is involved).
5. Stop. Summarize what changed. Ask for permission before moving on.

---

## Phase 1 — Immediate UI/functional updates (2026-08-05)

Done ahead of the chunked hardening work below, per direct request.

- [x] **COMPLETED** — Branded loading screen. `AuthGate.tsx`'s auth-check
  loading state showed a generic blue Mapbox-style pin + spinner. Replaced
  with the ParkApp logo centered, spinner beneath it, and a "Powered by
  Urban Sync" footer signature — mirrors `LoginScreen.tsx`'s existing
  logo/footer treatment exactly, so there's no visual jump if the loading
  state resolves straight into the login screen.
- [x] **COMPLETED** — "I saw a free space" auto-zoom. `handleToggleSelectionMode`
  already flew the camera to the user's location before enabling manual
  pin-drop mode; it just used the general `STREET_ZOOM` floor (17.5). Added
  a dedicated `SELECTION_FLY_ZOOM = 18.5` constant so pin drops get a
  stricter street-level view, reducing the odds of a tap landing on a
  building instead of the road.
- [x] **NO CHANGE NEEDED** — "Emptying a space" auto-GPS. `handleDeclare`
  already fully bypasses selection mode and submits directly on a
  guaranteed-fresh, one-shot GPS fix (`getFreshPosition()`), not just
  whatever stale `userLocation` state happened to hold — this already
  matches (and exceeds) the request. Verified via code read, left untouched
  to avoid regressing a more robust implementation.

---

## Chunk 1 — Anti-Cheat & Points/Membership Integrity (Security)
**Status:** `[x] COMPLETED` (2026-08-05)
**Persona:** Supabase/Postgres security architect (RLS, SECURITY DEFINER functions, server-side validation)

**What shipped:**
- `supabase/migrations/0008_lockdown_profile_columns.sql` — column-level
  `REVOKE UPDATE` on `membership_tier`, `membership_expires_at`,
  `points_balance`, `trust_score`, `device_fingerprint` from `authenticated`.
  RLS (row-level) is unchanged; this adds column-level enforcement on top,
  so the raw-devtools exploit (`profiles.update({membership_tier:'premium',
  points_balance:999999})`) now fails outright. Every other profile field
  (name, phone, vehicle details, municipality assignment) is untouched and
  still self-editable exactly as before.
- New `redeem_trial_premium()` SECURITY DEFINER RPC is now the only path to
  Premium — `AuthContext.upgradeToPremium()` calls it instead of a raw
  table update. It only grants the existing 15-day trial (real payment
  verification is still Chunk 3's job) and is a no-op unless the account is
  currently `free`, so it can't be replayed to keep resetting the trial.
- `points_balance`/`trust_score` need no replacement write path — they
  still move exclusively through the pre-existing `apply_points_transaction`/
  `apply_trust_event` ledger triggers, which run with elevated privileges
  independent of the calling role's column grants.
- Device fingerprinting: `src/lib/deviceFingerprint.ts` (a localStorage-
  persisted random id, honestly documented as best-effort — resettable by
  clearing storage/incognito, not hardware attestation) is now captured at
  signup (`AuthContext.signUp`) and stored once, server-side, into
  `profiles.device_fingerprint` via the `handle_new_user` trigger.
  `declare-spot/index.ts`'s rate limits (hourly/daily caps) now also check
  across every account sharing the same device fingerprint, reading it from
  the caller's own DB row (never trusted from the request body, since that
  column is no longer client-writable) — blunts "make a second free account
  on the same phone" point-farming that the per-account caps alone missed.
- Road-snap anti-spoofing (`isNearRoad` in `declare-spot/index.ts`) now
  **fails closed** instead of open when `MAPBOX_SECRET_TOKEN` isn't
  configured as a Supabase Edge Function secret.
  **⚠️ Operational action required:** run
  `supabase secrets set MAPBOX_SECRET_TOKEN=<your Mapbox token>` against the
  live project (this is a separate secret from the frontend's
  `VITE_MAPBOX_TOKEN` in `.env` — Edge Functions don't inherit Vite env
  vars). Until that secret is set, **every** spot declaration will now be
  rejected — this is intentional (fail loud beats fail silent for a
  security check), but it means this fix must not ship to the live pilot
  without the secret being set first, or declarations break entirely.

**Verified:** `eslint` clean on every changed file (only pre-existing style
warnings elsewhere in the repo); `tsc --noEmit` stays at the same 15
pre-existing errors (all from the already-known stale hand-written
`types.ts`, none related to this chunk — the new `redeem_trial_premium` RPC
was typed to avoid adding a 16th).

**Deferred, not done this chunk:** the `points_transactions_insert_own_spend`
ledger `reason` field is still an unconstrained free-text string on
client-insertable spend rows (`0004_anti_spam_support.sql:80-81`) — doesn't
enable gaining points (bounded by `greatest(0,...)`), only lets a client
fabricate a garbage reason on its own spend history, so it was left open
rather than guessed at with an incomplete allowed-reasons list (would need
`OffersTab.tsx`'s real reason strings first). `manual-unpark` was reviewed
and intentionally left unchanged — it's already self-limiting via the
one-active-session-per-user constraint plus claim-spot's own GPS/radius
checks, not an independent farming vector.

---

## Chunk 2 — Global Error Handling & Resilience
**Status:** `[ ] PENDING`
**Persona:** Senior React frontend developer (error boundaries, async error UX, loading/timeout states)

**Why:** there is no React error boundary anywhere in the app
(`grep -r ErrorBoundary src` → zero matches) — an uncaught render exception
blanks the whole app with no fallback. Multiple async Supabase calls have no
error handling at all, degrading to silent stale/zero/empty UI instead of a
visible error state:
- `useAdminAccess.ts:33-42` — a failed/rejected RPC leaves `loading` `true`
  forever; the admin dashboard spinner never resolves, no error, no timeout.
- `AdminDashboard.tsx:33-45` (`loadData`) — none of the 3 parallel RPC
  results are checked for `.error`; failures render as empty KPIs/map/chart
  with no error banner.
- `useActiveSession.ts:33-40`, `useMunicipalitySettings.ts:34-43` — same
  pattern, error silently discarded.
- `useLeaderboard.ts:55-63` **does** capture an `error` state, but
  `LeaderboardTab.tsx:20` never reads it — caught but never surfaced.

**Tasks:**
- [ ] Add a top-level React error boundary in `App.tsx` (or wrapping
  `AuthGate`) with a real fallback UI (not a blank white screen) and a
  "reload" action.
- [ ] `useAdminAccess.ts`: add `.catch`/error branch and a timeout, so a
  failed RPC surfaces an error state instead of an infinite spinner.
- [ ] `AdminDashboard.tsx` `loadData`: check `.error` on each of the 3 RPCs,
  render an error banner (not just empty zero-state) when one fails, keep a
  retry path via the existing Refresh button.
- [ ] `LeaderboardTab.tsx`: actually read and display `useLeaderboard`'s
  existing `error` state instead of discarding it.
- [ ] `useActiveSession.ts`, `useMunicipalitySettings.ts`: add real error
  handling (at minimum a console/telemetry log + don't silently pretend
  "no data" means "no error").

**Acceptance criteria:** killing network access mid-session (or forcing a
Supabase RPC to reject) produces a visible, dismissible error state
somewhere in the UI for every path above — never an infinite spinner or a
silent stale/empty render; a thrown render error shows the boundary's
fallback, not a blank page.

---

## Chunk 3 — Payments & Plans: Real Verification
**Status:** `[ ] PENDING`
**Persona:** Full-stack engineer, payments/billing integration

**Why:** the entire "Premium" subscription flow is currently a client-side
mock with a real-looking UI and no backend behind it:
- `PlansTab.tsx` "Start Trial" calls `upgradeToPremium()` directly on click
  — no payment step, no processor SDK anywhere in `package.json`.
- The municipality resident-code verification (`handleVerify`,
  `PlansTab.tsx:18-33`) accepts **any non-empty string** — it never checks
  the code against a real registry.
- `membership_expires_at` exists in the schema but nothing ever sets it, so
  a "15-day trial" never actually expires.

This chunk depends on Chunk 1 landing first (the `profiles` write-lockdown),
otherwise a real payment integration would sit on top of a table that's
still directly forgeable.

**Tasks:**
- [ ] Decide + document the actual pilot payment approach (Stripe Checkout
  is the standard low-lift option for a Vite/Supabase stack) — this needs a
  product decision, not just code, so this task starts with a short written
  recommendation + your sign-off before wiring anything.
- [ ] Real resident-code verification: either a lookup table/RPC per
  municipality, or (pilot-simpler) a per-municipality shared code stored in
  `municipality_settings`, checked server-side.
- [ ] Set and enforce `membership_expires_at` on trial start; a scheduled
  check (cron Edge Function or a check-on-read pattern) that downgrades
  expired trials back to `free`.
- [ ] Update pricing copy to reflect whatever's actually wired, not
  aspirational numbers.

**Acceptance criteria:** no path in the app can set `membership_tier =
'premium'` without going through the new server-verified flow; a trial
that's past its expiry date is reflected as expired on next load.

---

## Chunk 4 — Type Safety & Test Coverage Safety Net
**Status:** `[ ] PENDING`
**Persona:** TypeScript/QA engineer

**Why:** `src/integrations/supabase/types.ts` is hand-written and out of
sync with the real schema/RPC surface — `tsc --noEmit` currently reports 16
errors across `AdminDashboard.tsx`, `AuthGate.tsx`, `AuthContext.tsx`,
`useAdminAccess.ts`, `useMunicipalitySettings.ts`, `parking.ts`, and
`MapboxMap.tsx`. Vite's transpile-only build still succeeds, so this is
silent — but it means the type system isn't actually catching schema
mismatches right now. Separately, real test coverage is effectively zero:
`vitest`/`@testing-library/react` are fully configured, but the only test
file in the repo is a single trivial placeholder assertion. None of the
scoring/anti-cheat logic, RLS behavior, or critical hooks have any coverage.

**Tasks:**
- [ ] Regenerate `types.ts` from the live Supabase project
  (`npx supabase gen types typescript`) once linked, or hand-sync it against
  all 7 migrations if a live project isn't available yet; get `tsc --noEmit`
  to zero errors.
- [ ] Add real unit tests for the highest-risk logic first: `declareSpot`/
  `claimSpot`/`manualUnpark` client wrapper behavior, the rate-limit/trust
  logic surface, and the profile-write lockdown from Chunk 1 (a test that
  proves a client can't self-grant premium is exactly the kind of
  regression guard this needs).
- [ ] Add a couple of component-level tests for the highest-traffic
  screens (MapTab's declare/claim buttons, LoginScreen).

**Acceptance criteria:** `tsc --noEmit` clean; `npm run test` runs a real,
non-trivial suite exercising the Chunk 1 security fix and the core
declare/claim flow; CI-ready (even if CI isn't wired up yet).
