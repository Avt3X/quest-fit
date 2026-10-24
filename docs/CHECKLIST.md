# Requirement checklist

Status labels:

- **Complete and tested**: implemented and verified by automated tests and/or by running it in the
  app (web build against the local Supabase stack).
- **Implemented but not fully verified**: code is in place and type-checks/bundles for iOS and
  Android, but some part (usually device-only behaviour) has not been exercised.
- **Partially implemented**: works with known gaps, listed in the notes.
- **Blocked by external dependency**: needs accounts, credentials or hardware not available here.

Evidence keys: **DB** = `npm run test:db` (PGlite), **CONC** = `npm run test:db:integration` (real
Postgres), **JEST** = `npm test`, **WEB** = exercised by hand in the web build with the local backend,
**BUNDLE** = `expo export` for iOS and Android succeeded.

## Authentication and onboarding

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Email + password sign-up | Complete and tested | WEB |
| Email verification (6-digit code, resend) | Complete and tested | WEB with Mailpit |
| Sign in / sign out, wrong-password errors | Complete and tested | WEB |
| Password reset (code + new password) | Complete and tested | WEB: new password accepted by Auth API, old one rejected |
| Persistent sessions | Complete and tested (web) | WEB reloads keep the session. iOS/Android use Keychain/Keystore via `expo-secure-store`: implemented, not run on a device |
| Apple / Google sign-in | Blocked by external dependency | Implemented (native Apple, OAuth for Google), hidden until provider credentials are configured |
| Onboarding: display name, username (live availability), avatar, activities, units, goal, privacy; optional steps skippable | Complete and tested | WEB (username-taken check, completion). Avatar upload code path not exercised in the browser |
| Missing/invalid session handling | Complete and tested | WEB (deleted user is signed out locally with a message) |

## Activity tracking

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Start / pause / resume / finish; cancel needs confirmation | Complete and tested (web) | JEST state machine; WEB with simulated geolocation |
| Live metrics (time, moving time, distance, pace/speed, elevation, GPS quality) | Complete and tested (web) | JEST, WEB |
| GPS filtering (accuracy, jitter, jumps, segments) | Complete and tested | JEST, DB (server recomputation and jump rule) |
| Server recomputes GPS distance | Complete and tested | DB, WEB (267 m server vs 0.27 km client) |
| Background tracking (Android foreground service, iOS background mode) | Implemented but not fully verified | Config verified with `expo config --type introspect`; needs a physical device |
| Native route map (react-native-maps) | Implemented but not fully verified | BUNDLE; web uses the SVG preview. Android release needs a Google Maps key |
| Interruption recovery | Complete and tested | JEST, WEB (session restored after full reload) |
| Never lose a finished recording (durable outbox, retries) | Complete and tested | JEST (network failure, rejection, single flush) |
| No duplicate activities | Complete and tested | DB, CONC (8 concurrent submissions → 1 activity) |
| Manual activities with validation and plausibility | Complete and tested | DB, JEST, WEB |
| Indoor timer-only recording | Complete and tested | WEB |
| Activity summary (stats, route, challenge/journey/XP impact, PRs) | Complete and tested | WEB, DB. Per-kilometre splits are not implemented |
| Edit / delete activities (re-counting, retraction) | Complete and tested (logic) | DB. Edit/delete screens type-check but were not exercised in the browser |
| History, weekly/monthly charts, filters, personal records | Complete and tested | WEB, DB |
| Units (km/mi) at presentation only | Complete and tested | JEST |

## Challenges

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Individual, competitive, collaborative, team modes | Complete and tested | DB, WEB |
| Distance, duration, activity-count metrics; activity type filters | Complete and tested | DB |
| Weekly / monthly / yearly / custom windows; recurring series | Complete and tested | DB, JEST |
| Create (public/private), join, leave, invite, join by code | Complete and tested | DB, WEB (private team challenge with code and retroactive backfill) |
| Server-side, idempotent processing; no double counting | Complete and tested | DB, CONC |
| Late uploads (grace period), late joining, retroactive joins | Complete and tested | DB |
| Leaderboards with consistent ties and own row | Complete and tested | DB, JEST, WEB |
| Finalization and podium rewards | Complete and tested | DB. Runs when the app opens; scheduled pg_cron jobs are documented but not configured here |

## Epic journeys

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Configurable journeys and checkpoints (data only) | Complete and tested | DB content-integrity test |
| Map with route, marker, checkpoints, story | Complete and tested | WEB, JEST (label placement never overlaps and stays next to its own checkpoint) |
| Solo and group expeditions, shared marker, personal share | Complete and tested | DB, WEB |
| Checkpoint/completion rewards once; replay | Complete and tested | DB |
| Original artwork only | Complete and tested | Procedural SVG art; no third-party assets in the repository |

## Themes and gamification

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Themes unlocked by DB thresholds; unlocked vs equipped; persisted | Complete and tested | DB, WEB (equip re-skins the app) |
| Palette validation and WCAG contrast | Complete and tested | JEST over every palette in the migration |
| Light / dark / system appearance | Complete and tested (web) | WEB (both schemes) |
| XP ledger, daily cap, configurable levels | Complete and tested | DB |
| Achievements granted once, with progress | Complete and tested | DB, WEB |
| Daily and weekly streaks in local time | Complete and tested | DB, JEST |

## Social

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Search, friend requests, accept/decline, remove | Complete and tested | DB, WEB (accepting granted "Fellowship" and notified the sender) |
| Public profiles with privacy | Complete and tested | DB |
| Block / unblock (hidden both ways) | Complete and tested (logic) | DB. Blocked-users screen not exercised in the browser |
| Feed, kudos, comments | Complete and tested (logic) | DB, WEB for feed and kudos. Posting a comment was not exercised in the browser |
| In-app notifications with unread badge and deep links | Complete and tested | DB, WEB |
| Challenge and expedition invitations | Complete and tested (logic) | DB; invite picker type-checks, not exercised in the browser |
| Push notifications | Blocked by external dependency | Edge Function and token registration implemented; requires an EAS project, APNs/FCM credentials and deployment |

## Explore, Home, Profile, Settings

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Explore (challenges, journeys, people) | Complete and tested | WEB |
| Home dashboard (week, streaks, level, milestone, journeys, challenges, invitations, banners) | Complete and tested | WEB |
| Profile and statistics | Complete and tested | WEB |
| Settings: profile, privacy, units, themes, haptics, background tracking, blocked users | Implemented but not fully verified | Themes verified on WEB; others type-check and use tested RPCs/RLS |
| Account deletion | Complete and tested (logic) | DB (data removed, shared totals consistent); not run from the UI |

## Backend, security, reliability, privacy

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Normalized schema with migrations | Complete and tested | `supabase db reset` applies cleanly |
| RLS on every table; no direct writes to protected data | Complete and tested | DB security suite |
| Clients cannot grant XP/achievements/themes or change totals | Complete and tested | DB |
| Service-role key never in the app | Complete and tested | Only `EXPO_PUBLIC_*` anon values reach the bundle; the Edge Function reads its key from the runtime environment |
| Threat model documented | Complete and tested | `docs/ARCHITECTURE.md` |
| Concurrency (no lost updates, single completion) | Complete and tested | CONC (16 concurrent contributors) |
| Offline handling and retries | Complete and tested | JEST |
| Time zones (local days/weeks, challenge time zone) | Complete and tested | DB, JEST |
| Route privacy (owner-only raw routes, trimmed previews, route deletion) | Complete and tested | DB, WEB |
| Location permission flow with explanations | Implemented but not fully verified | WEB (browser permission); native prompts need a device |

## Quality and delivery

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| TypeScript strict, ESLint | Complete and tested | `npm run typecheck`, `npm run lint` |
| Unit, business-logic, integration and component tests | Complete and tested | JEST, DB, CONC |
| End-to-end tests | Partially implemented | Flows were verified by driving the web build; there is no automated E2E suite (Maestro/Detox) yet |
| iOS and Android bundles | Complete and tested | BUNDLE (Hermes) and `expo-doctor` 20/20 |
| Signed native builds (EAS) | Blocked by external dependency | Needs an Expo account plus Apple/Google developer credentials |
| Accessibility (labels, roles, states, contrast, touch targets) | Implemented but not fully verified | ARIA state checked on WEB, contrast in JEST; not tested with VoiceOver/TalkBack |
