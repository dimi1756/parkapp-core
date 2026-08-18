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
**Status:** `[x] COMPLETED` (2026-08-17)
**Persona:** Senior Frontend Architect & Reliability Engineer

**What shipped:**
- `src/components/ErrorBoundary.tsx` (new) — a top-level React error boundary
  wrapping the app in `App.tsx` (inside `LanguageProvider` so its fallback
  can be translated, outside `AuthProvider`/`AppProvider` so a crash in
  either is also caught). Branded fallback (ParkApp logo, friendly message,
  reload button) instead of a blank white screen; logs the full error +
  component stack to console.
- `useAdminAccess.ts`: added an `error` field, a two-argument `.then`
  (handles both a resolved-with-error response and an outright rejected
  promise), and always resolves `loading` — previously a failed/rejected RPC
  left the admin dashboard spinning forever with no error and no timeout.
- `AdminDashboard.tsx`: new `accessError` branch (distinct from "not
  authorized" — "we couldn't check" vs "the answer is no"), and `loadData`
  now checks `.error` on all 3 parallel RPCs, surfacing a dismissible error
  banner with a retry button instead of silently rendering empty KPIs/map/
  chart; `handleRefresh`'s toast now reflects failure too, not just success.
- `useActiveSession.ts`: `refetch` now checks `.error`, logs it, and keeps
  the last-known session state instead of silently overwriting it with
  `null` on a transient failure.
- `useMunicipalitySettings.ts`: load failures are now distinguishable from
  "no settings saved yet" (`loadError`, previously both silently fell back
  to defaults identically); wired into `AdminSettings.tsx` as a toast.
- `LeaderboardTab.tsx`: now reads and displays `useLeaderboard`'s `error`
  state (it was already captured by the hook, just never consumed) — a
  load failure now shows "Couldn't load the leaderboard" instead of the
  misleading "no rankings yet" empty state.
- `MapTab.tsx` — genuine optimistic UI with rollback, not just immediate-
  paint-on-success:
  - `handleDeclare` ("Emptying a space"): the pin now appears the instant
    the request goes out, and is rolled back (`setOptimisticSpot(null)`) if
    `declareSpot` returns an error, alongside the existing failure toast.
  - `handleConfirmSelection` ("I saw a free space" confirm): on failure, the
    manually-placed pin and selection mode now stay put instead of silently
    clearing, so the driver can see exactly what they tried to submit and
    hit Confirm again rather than having to re-drop the pin. On success, it
    hands off directly to the optimistic "mine" pin at the same coordinates
    so there's no gap where nothing is shown while realtime catches up.
- `MapboxMap.tsx`'s routing/search helpers (`geocodeAddress`, `searchPlaces`,
  `retrievePlace`, `getDrivingDirections`, `snapToRoad`) were reviewed and
  found already properly try/caught, returning `null`/`[]` on any failure
  rather than throwing — no changes needed there.
- 12 new i18n keys added across en/gr/tr for all of the above (error
  boundary chrome, admin access/data-load errors, leaderboard load error,
  settings load error).

**Verified live** (not just lint/tsc): logged into the demo account against
this environment's Supabase project and found it naturally exercising the
new error paths — `useLeaderboard` genuinely failed (see "Found, not fixed"
below) and rendered the new "Couldn't load the leaderboard" state correctly;
Admin Dashboard loaded real data cleanly with no false-positive error
banner. `eslint` clean (one pre-existing-pattern warning in
`ErrorBoundary.tsx` for co-locating a helper component, consistent with
several other files in this codebase); `tsc --noEmit` stays at the same 15
pre-existing stale-`types.ts` errors (0 new).

**Found, not fixed (out of scope for this chunk):** while verifying live,
`useLeaderboard.ts`'s query unconditionally selects both `points_today` and
`points_this_week` from whichever view it's querying, but
`leaderboard_daily` only has `points_today` and `leaderboard_weekly` only
has `points_this_week` — so it always fails with `column ... does not
exist` on one of the two, on both existing environments not just a
misconfigured one. This is a genuine, pre-existing, unrelated bug in the
leaderboard feature itself (unmasked, not caused, by this chunk's improved
error surfacing) — worth a fast one-line fix (`select` only the column the
active `view`/`pointsCol` needs) whenever convenient, flagged here rather
than fixed silently since it's outside Chunk 2's scope.

---

## Chunk 3 — Payments & Plans: Real Verification
**Status:** `[x] COMPLETED` (2026-08-17)
**Persona:** Full-Stack Systems Architect & Payment Integration Specialist

**Quick patch — `useLeaderboard.ts` query bug:** it unconditionally selected
both `points_today` and `points_this_week` from whichever view it queried,
but `leaderboard_daily` only has the former and `leaderboard_weekly` only
the latter — every load failed with `column ... does not exist`. Now
selects only the column the active `view`/`pointsCol` needs. **Verified
live**: previously logged `[useLeaderboard] failed to load leaderboard_weekly:
... column ... does not exist`; after the fix, same account/environment now
loads cleanly with no query error (renders the genuine "No rankings yet"
empty state instead of the error state Chunk 2 added).

**What shipped (Resident Code Validation):**
- `supabase/migrations/0009_resident_verification.sql` — new
  `profiles.resident_verified` column (client-write-locked, same treatment
  as the Chunk 1 columns) and `municipality_settings.resident_code` (each
  municipality's own admins can set one; null = not configured yet). New
  `redeem_resident_code(p_code)` RPC: looks up the caller's own
  municipality, compares the submitted code against that municipality's
  `resident_code` (case-insensitive/trimmed), and only on a match sets
  `membership_tier='premium'`, `resident_verified=true`,
  `membership_expires_at=null` (permanent, not a 15-day clock — this is a
  municipal benefit, not a promo). Previously `handleVerify` accepted any
  non-empty string and called the exact same trial RPC as "Start Trial" —
  there was no verification happening at all.
- `AuthContext.redeemResidentCode(code)` — new method calling the RPC;
  `PlansTab.handleVerify` now shows a real "that code didn't work" error on
  a mismatch instead of silently succeeding for any input.
- **Not built this chunk (flagged, not silently skipped):** an admin UI
  control to actually *set* `resident_code` — currently requires direct SQL
  (Supabase dashboard/CLI) per municipality. Wasn't asked for and would
  have expanded this chunk into admin-settings UI work; natural fast-follow
  whenever wanted.

**What shipped (Plans & Trial System Hardening):**
- New `src/lib/membership.ts` — single source of truth for tier status
  (`free` / `trial` (with days remaining) / `resident` / `expired`),
  derived only from server-written columns. Two exports:
  `getMembershipStatus()` for display, `isPremiumActive()` for gating.
- **Removed a second, entirely disconnected "plan" system.**
  `AppContext.tsx` had its own `plan`/`citizenVerified` client-only state
  (defaulting to `'free'` on every mount, never synced with the real
  `profiles.membership_tier`) with its own fake `upgradeToPremium()`/
  `verifyCitizen()` setters — and `incrementSearches()` (the daily search
  cap) was gating against *that* fake state, not the real one. This meant
  a genuinely Premium account's search limit silently reset to free-tier
  behavior on every page reload. Deleted the fake state entirely;
  `incrementSearches` now reads `isPremiumActive(profile)` from the real
  `AuthContext` profile via `useAuth()`.
- **Self-healing trial expiry** — no cron/scheduled-function infra exists
  for a pilot, so instead of a background job, `AuthContext.fetchProfile`
  now calls a new `sync_expired_membership()` RPC (0009) on every
  session load/refresh: downgrades `membership_tier` back to `'free'` only
  for a premium, non-resident row whose `membership_expires_at` has
  passed. Resident grants (no expiry) and active trials are never touched.
  This is genuine server-side, timestamp-driven enforcement without
  needing pg_cron.
- `PlansTab.tsx` reworked around `getMembershipStatus()`: shows "N days
  left in your trial" for an active trial, "Free forever as a verified
  resident" for a resident grant, and a dismissible "your trial has ended"
  notice when `status.kind === 'expired'`. Both "Start Trial" and "Verify"
  now show a loading spinner (both are real network round-trips now, not
  instant client state flips) and are disabled while in flight.
- **Duplicate-trial prevention**, defense in depth: the RPC itself
  (`redeem_trial_premium`, 0008) already only fires from `membership_tier
  = 'free'`; the "Start Trial" button is additionally disabled client-side
  whenever `status.kind` is `trial` or `resident` — so both an accidental
  double-click and a determined client bypass are covered.
- `ProfileTab.tsx`: the "Resident" badge now reads real
  `profile.resident_verified` instead of the fake `AppContext.citizenVerified`
  (which reset on every reload regardless of actual status); `isPremium`
  now uses `isPremiumActive()` so it correctly reflects trial expiry too.
- 10 new i18n keys across en/gr/tr (invalid-code error, trial-days-left,
  trial-expired notice, resident-active label).

**⚠️ Operational action required:** migrations `0008` and `0009` need to be
applied to the live Supabase project (SQL editor or `supabase db push`) —
verified live in this session that at least `0009`'s RPCs
(`redeem_resident_code`, `sync_expired_membership`) 404 against the current
database, meaning they likely haven't been applied yet (same probably
applies to `0008`'s `redeem_trial_premium`, unconfirmed either way). The
app degrades gracefully either way (every new RPC call is error-checked,
never throws to the UI), but none of Chunk 1 or Chunk 3's server-side
guarantees are actually live until these migrations run.

**Verified:** `eslint` clean (same pre-existing warning pattern as before,
0 new); `tsc --noEmit` — 15 pre-existing errors unchanged, **+1 new**:
`AuthContext.tsx`'s `redeem_resident_code` call hits the exact same
pre-existing "RPC args typed as `never`" bug that already affects 3 other
call sites in this codebase (root cause is the stale hand-written
`types.ts`/`Database` generic shape, not this call specifically — confirmed
by checking that even a correctly-typed `Functions` entry still triggers
it, matching the pattern of every other args-taking RPC already in the
file). Deferred to Chunk 4, which already owns fixing this class of issue
for the whole codebase, rather than a speculative workaround here. Live
end-to-end test: the leaderboard patch confirmed fixed against the real
environment; Plans tab renders correctly (including a legacy account whose
`membership_tier='premium'` predates any expiry tracking, handled
gracefully as "Active" rather than crashing on `Infinity` days-left); the
resident-code flow degrades cleanly (no crash) when its RPC isn't live yet.

**Still genuinely open (not part of this chunk's scope):** real payment
processing. The €3/mo pricing shown is still display-only — no Stripe (or
other processor) integration exists, and "Start Trial" still only grants
the existing free 15-day trial, same as before this chunk. Deciding and
wiring an actual payment approach (Stripe Checkout is the standard
low-lift option for a Vite/Supabase stack) is a product decision requiring
sign-off, not something to guess at unprompted — flagged here as a clear
next step whenever wanted, not silently left ambiguous.

---

## Chunk 3.5 — Map UX Fixes & Investor Demo Showcase
**Status:** `[x] COMPLETED` (2026-08-18)
**Persona:** Mapbox UX Expert & Product Manager

Inserted ahead of Chunk 4 per direct request — map data-scoping/UX fixes plus
gamification and demo-pitch features. Confirmed migrations 0008/0009 are now
live on the Supabase project (RPCs active).

**1. Driver map decluttered, admin gets the full picture:**
`useNearbySpots.ts` now queries `status='active'` + a 30-minute recency
floor explicitly, instead of relying on RLS alone. RLS's own 5-minute TTL
(0007) already capped *other* drivers' spots, but `parking_spots_select_own`
has no time bound at all -- a user's entire history of long-expired/claimed
spots was accumulating on their own map forever, and (separately) an
already-claimed spot with no status check could wrongly surface as
"nearest claimable." Both fixed by the same query change. `admin_live_spots`
(0005) already returned every status over 24h -- no change needed there;
instead `CityMap.tsx` now renders that fuller dataset as a genuine Mapbox
heatmap layer (density-by-recency) underneath the existing per-spot
markers, plus auto-fits the camera to wherever the real data actually is
instead of a static default center.

**2. "Emptying a space" GPS fix:** code review found `handleDeclare`
already used real GPS coordinates (fresh fix or GeolocateControl), not a
viewport-center value -- the actual bug was more subtle: if geolocation had
*never* produced a real fix (permission denied, no signal), the code
silently fell through and submitted at `userLngLat`'s untouched initial
value, `MAP_CENTER` (a hardcoded fallback) -- which looks exactly like "the
pin always drops at the same wrong spot." Now fails loudly with a clear
error toast instead of guessing a location. Also updated `MAP_CENTER`
itself from the old Chalkida coordinates to Karystos, the actual pilot/demo
city.

**3. "I saw a free space":** clarified with the user before touching this
-- removing GPS-direct capture would have made it functionally identical to
"Emptying a space," eliminating the ability to report a spot seen elsewhere
while driving. Kept tap-to-drop as-is (confirmed correct); the "annoying
dot" was already gated to the demo account only (`showCustomUserDot={isDemoAccount
&& selectionMode}`), not shown to real users at all. No code change needed
here beyond what item 1's cleanup already touches.

**4. League/progression modal:** `src/lib/badges.ts` extended with
`getAllTiers()`/`getNextTierInfo()`/`estimateSpotsToNext()`, reusing the
existing 4-tier Bronze/Silver/Gold/Platinum thresholds rather than
inventing a parallel system. New `LeagueModal.tsx`, opened by tapping the
rank badge chip on the Leaderboard tab -- shows every tier, which one the
account is on, and "N points (~M spots) to the next tier."

**5. City Leaderboard:** new `city_leaderboard` view (0010, same live/
ledger-derived pattern as the existing daily/weekly driver views) ranks
municipalities by total points their drivers have generated. New
`useCityLeaderboard.ts` hook; replaces the old static "Coming Soon" card on
the Leaderboard tab (`data-tour="leaderboard-future"` retargeted to this
real section; its tour copy updated to match).

**6. Demo account mock data (investor pitch):** new `src/lib/demoMockData.ts`
-- the single place all of this lives, gated everywhere by `isDemoAccount`
and never reachable for a real user. Injects: 8 realistic driver-leaderboard
entries (with the real demo account spliced in at a believable rank, not
replaced); a 6-city leaderboard (Karystos in first place, plus Chania,
Rhodes, Chalkida, Athens, Thessaloniki); admin KPIs/weekly-trend/spots
(47 active drivers, 128 declared today, 6.4min avg, 94% trust); and 4
"active" map pins scattered a few hundred meters apart around Karystos,
each independently timestamped 1-6 minutes ago so their spot-details cards
don't all show identical numbers.

**7. Spot interaction & routing:** `MapboxMap.tsx` gained an `onPinClick`
callback -- 'mine'/'reported' pins now open the new `SpotDetailsCard.tsx`
bottom card (distance, time-since-declared with a live 30s tick, an ETA
estimate) instead of Mapbox's own text popup. "Get Directions" calls
`navigateToSpotPin` verbatim -- the exact same Directions-API routing path
`runDestinationSearch`/the search bar already uses, just pointed straight
at this pin instead of going through the nearest-spot-to-a-searched-POI
lookup (irrelevant here, since the spot is already known).

**Verified live**, not just lint/tsc: logged in as the demo account and
confirmed all of the above render correctly -- 4 Karystos pins on the map;
tapping one opened the details card (`103m` / `2m ago` / `1′` ETA); "Get
Directions" triggered real turn-by-turn routing ("Turn left. 66m... 0.1 km
· 0 min drive"); League modal showed correct tier math (120 pts → "180
points (~18 spots) to Gold"); driver leaderboard showed the demo account
at a real rank (#5) among the mock drivers; City Leaderboard showed
Karystos in first place; Admin Dashboard showed the exact mock KPI numbers
and a 278-total weekly chart; selection-mode tap-to-drop still worked
unchanged. `eslint` clean (0 new warnings beyond the pre-existing pattern);
`tsc --noEmit` at 16 errors, unchanged from the Chunk 3 baseline (a
GeoJSON-namespace error the new heatmap code would otherwise have added
was avoided by using an untyped literal instead of propagating the same
pre-existing typing gap into a new file).

---

## Chunk 4 — Type Safety & Test Coverage Safety Net
**Status:** `[x] COMPLETED` (2026-08-18)
**Persona:** Senior TypeScript Engineer & QA Lead

**Why:** `src/integrations/supabase/types.ts` was hand-written and out of
sync with the real schema/RPC surface — `tsc --noEmit` reported 16 errors,
almost all the same root cause: the hand-written `Database` generic shape
didn't satisfy `@supabase/supabase-js`'s constraints, so every RPC call's
argument type collapsed to `never`. Real test coverage was effectively
zero: only a single trivial placeholder assertion existed.

**What shipped (real generated types, not a hand patch):** with live
Supabase MCP access now available, generated `types.ts` directly from the
actual live database schema (`generate_typescript_types`) instead of
hand-guessing it — the previous approach of manually appending entries for
each new RPC was the root cause of the drift in the first place. This
immediately resolved every RPC-args-as-`never` error, since the real
`Database` type satisfies the generic constraints the stale hand-written
one didn't.

**4 real (non-`never`) type errors surfaced once real types were in place
— all fixed at the root, no `@ts-ignore`:**
- `AdminDashboard.tsx` — `admin_live_spots` returns `status` as plain
  Postgres `text` (not a DB-level enum), so it doesn't structurally match
  `LiveSpot['status']`. Added a runtime type guard (`isLiveSpotStatus`) at
  the RPC boundary: a recognized value passes through typed, an
  unrecognized one degrades to `'invalid'` with a `console.warn` instead of
  either an unsafe cast or a crash.
- `MapboxMap.tsx` — same pre-existing `GeoJSON` namespace-not-resolvable
  gap already fixed in `CityMap.tsx` during Chunk 3.5; applied the same fix
  (untyped literal with `as const` tags instead of an explicit
  `GeoJSON.Feature<GeoJSON.LineString>` annotation) to the route-drawing code.
- `useLeaderboard.ts` — the real generated types caught a genuine
  correctness gap the old stale types had masked: querying `.from(view)`
  with a runtime-computed table name (`'leaderboard_daily' |
  'leaderboard_weekly'`) means Supabase's query builder can't statically
  resolve which columns exist, so the row type resolved to
  `SelectQueryError`. Rewritten as two static branches (one literal
  `.from('leaderboard_daily')...`, one literal `.from('leaderboard_weekly')...`)
  so each branch gets its real, precise inferred row type instead of an
  error type.

**Verified:** `tsc --noEmit -p tsconfig.app.json` — **0 errors** (down from
16). `npx vite build` — succeeds. `eslint` — 2 pre-existing errors / 20
pre-existing warnings unchanged, all in untouched shadcn/ui boilerplate
(`command.tsx`, `textarea.tsx`, Fast Refresh warnings) — not part of this
chunk's "zero tsc errors" scope and not touched.

**What shipped (test suite):**
- `src/lib/membership.test.ts` (13 tests) — every `MembershipStatus` kind
  (`free`/`trial`/`resident`/`expired`) including edge cases: null/undefined
  profile, non-premium tier, resident overriding an already-past expiry,
  trial with no expiry set (`daysLeft = Infinity`), correct day-rounding for
  a future expiry, exact-instant expiry, and `isPremiumActive()`'s
  true/false boundary across all four kinds.
- `src/lib/demoMockData.test.ts` (19 tests) — driver leaderboard determinism,
  descending sort, correct "You" row injection only when a `currentUserId`
  is passed, daily-vs-weekly point-range separation; city leaderboard
  determinism, exactly-Karystos-is-own-city, descending sort, no duplicate
  cities; admin KPI sanity bounds; Karystos spot generation (bounded
  distance from city center, unique ids, declared-in-past/expires-in-future
  relative to "now") and admin spot status cycling — both using
  `vi.useFakeTimers()`/`vi.setSystemTime()` since the source functions call
  `Date.now()`/`new Date()` directly with no injectable clock; weekly trend
  shape (7 consecutive days ending today, non-negative counts).
- `npm run test` (`vitest run`) — **33/33 passing**, 3 test files.

**Two live-database discoveries surfaced during this chunk, flagged rather
than silently absorbed or silently fixed:**
1. **Supabase's security advisor** flags `city_leaderboard`,
   `leaderboard_daily`, and `leaderboard_weekly` as ERROR-level "Security
   Definer View" — meaning they evaluate under the view-creator's
   privileges rather than the querying user's, bypassing that user's own
   RLS. Reviewed this deliberately rather than auto-"fixing" it: this
   behavior is *load-bearing*, not accidental — a security-invoker
   leaderboard would only ever show a normal user their own row (per
   `profiles` RLS), breaking the entire "see other drivers'/cities' rank"
   feature. The exposed columns are already minimal (name + points +
   municipality, no PII beyond `full_name`). No code change made; recorded
   here as a reviewed-and-accepted advisory, not an open bug.
2. **Live schema drift beyond what's in this repo's migration files.**
   `list_migrations` (Supabase's own migration-tracking table) returns
   empty despite migrations 0008–0010 being confirmed live — consistent
   with them having been run directly via the SQL editor rather than a
   tracked `supabase db push`, not itself a problem. Separately, and more
   notably: the live database has 6 tables
   (`parking_spots`, `user_gamification`, `parking_sessions`,
   `friend_squads`, `squad_members`, `partner_stores`) and 3 functions
   (`cleanup_expired_spots`, `release_claim`, `use_reservation_credit`) that
   appear in **none** of this repo's migration files (`0001`–`0010`) and
   are **not referenced anywhere in the current app code**. Inspected their
   definitions directly: they implement a coherent, unrelated feature set
   (spot claiming/reservation credits, friend squads, partner-store
   rewards) — almost certainly leftover from the original pre-Chunk-1
   Lovable scaffold, dormant and inert, not something any of my Chunk 1–4
   work touches or depends on. Not modified or removed (out of scope, and
   deleting live schema unprompted is exactly the kind of action this
   process treats as needing explicit sign-off) — flagged here so it's a
   known, documented fact rather than silent drift for whoever picks this
   up next.

**Acceptance criteria met:** `tsc --noEmit` clean (0 errors); `npm run
test` runs a real, non-trivial suite (33 tests) covering the membership/
trial state machine and the demo mock-data generation exactly as scoped;
no `@ts-ignore` used anywhere in this chunk's fixes.
