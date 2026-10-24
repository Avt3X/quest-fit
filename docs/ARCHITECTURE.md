# QuestFit architecture

QuestFit is one Expo (React Native) code base for iOS, Android and web, backed by Supabase
(PostgreSQL, Auth, Storage, Edge Functions). The defining design decision is that **every rule that
affects progress, rankings or rewards runs inside PostgreSQL**, in the same transaction as the write
that triggered it. The app is treated as an untrusted client: it submits activities and intents
(join, leave, invite, equip) and only ever reads totals.

```
┌───────────────────────── Expo app (TypeScript, strict) ─────────────────────────┐
│ src/app (Expo Router screens)                                                    │
│   (auth)/…  onboarding  (app)/(tabs)/{home,explore,record,challenges,profile} …  │
│ src/features/* (screens' data hooks + feature components)                        │
│   recording/ ── location-service (TaskManager / watch) ── recording-store ──┐    │
│                 track-storage (chunked, on device)      upload-queue (outbox)│    │
│ src/domain/* (pure, unit-tested: units, GPS filter, recording state machine, │    │
│               progress, ranking, periods, activity rules)                    │    │
│ src/theme/*  (tokens + DB palettes → contrast-checked colors)                │    │
│ TanStack Query (server state) · Zustand (preferences, recording, outbox)     │    │
└──────────────────────────────────────────────┬───────────────────────────────┘    │
                                               │ supabase-js (anon key + user JWT)   │
┌──────────────────────────────────────────────▼────────────────────────────────────┐
│ PostgREST → public RPCs (SECURITY DEFINER)   RLS-protected tables (read-mostly)    │
│ submit_activity · update/delete_activity · create/join/leave_challenge · …        │
│            │                                                                       │
│            ▼                                                                       │
│ app_private.* engine (not exposed by the API)                                      │
│   process_activity → challenges → journeys → XP → stats/streaks → achievements →  │
│   themes · finalize_challenge · roll_recurring_challenges                          │
│ Supabase Auth (email+OTP, Apple, Google) · Storage (avatars) · Edge Function       │
│ (push-dispatch, optional)                                                          │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app` | Expo Router routes only. `(auth)`, `onboarding`, `(app)` (signed-in stack with `(tabs)`), `setup` (no backend configured), `index` (redirect). |
| `src/features/<feature>` | Data hooks (`api.ts`) and components per feature: activities, challenges, journeys, gamification, social, notifications, profile, recording, auth, home, app runtime. |
| `src/domain` | Pure business logic with no React or Supabase imports (tested with Jest). |
| `src/components` | Design system (`ui/`), brand art (`brand/`), shared form controls. |
| `src/theme` | Tokens, palette parsing, WCAG contrast enforcement, theme provider. |
| `src/lib` | Supabase client, secure session storage, env, errors, query client, formatting. |
| `src/state` | Zustand stores persisted to device storage (preferences). |
| `src/validation` | Zod schemas for forms. |
| `src/types/database.ts` | Generated from the live schema (`npm run db:types`). |
| `supabase/migrations` | Schema, engine, RPCs, RLS, storage policies, production content. |
| `supabase/seed.sql` | **Development fixtures only** (demo users and activities). |
| `supabase/tests` | Database tests on PGlite (no Docker needed). |
| `supabase/integration` | Concurrency tests against a real Postgres (local Supabase). |
| `supabase/functions/push-dispatch` | Optional push delivery Edge Function. |

## Units

Canonical storage is **meters** (distance) and **seconds** (time) in integer columns. Challenge
targets use the metric's canonical unit (meters, seconds or activity count). Conversion to km/mi,
pace (min/km, min/mi) and speed happens only in `src/domain/units.ts` at render time, so switching
the measurement system never touches stored data or calculations.

## Activities

- **Submission**: `submit_activity` derives the owner from the JWT, validates everything, inserts
  the activity (and route), runs the whole progression pipeline and stores the resulting summary.
- **Idempotency**: every recording gets a UUID `client_id` on the device when it starts. The table
  has `unique (user_id, client_id)`, and the RPC first locks the user's `user_stats` row, so
  concurrent retries are serialized and the second one returns the original summary
  (`replayed: true`). Verified by `supabase/integration/concurrency.test.ts` with 8 parallel
  submissions of the same recording.
- **GPS vs manual**: `source = 'gps'` only for outdoor types (DB constraint); manual activities
  cannot carry a route (RPC check). GPS distance is **recomputed on the server** from the submitted
  samples; the client's figure is ignored.
- **Plausibility**: implausible average speed (e.g. > 7.5 m/s for a run) keeps the activity but sets
  `is_eligible = false` with a reason. Ineligible activities never count toward challenges,
  journeys, XP, stats, streaks or achievements. Limits are mirrored in `src/domain/activity-rules.ts`
  for instant form feedback and kept identical by `supabase/tests/rules-parity.test.ts`.
- **Edits**: title, description, visibility and type can always change; distance/time/start only for
  manual entries. A metric change retracts the activity from every challenge still open for
  submissions and every active expedition, then reprocesses it. XP for the affected days is
  recomputed. Finished challenges and completed journeys keep their history.
- **Deletes**: same retraction, then delete. Contributions to finalized challenges keep their value
  with `activity_id` set to null so final results do not change. Earned achievements are kept.

### GPS recording on the device

`src/domain/recording.ts` is a pure state machine; time is always derived from timestamps, never
from tick counting, so values stay correct across suspension and restarts.

- **Filtering** (`src/domain/gps-filter.ts`):
  - discard fixes with reported accuracy worse than 35 m, invalid coordinates or out-of-order times;
  - movement smaller than a jitter threshold (half the reported accuracy, at least 3 m or 5 m for
    rides, at most 12 m) is *deferred*,
    not discarded: the anchor does not move, so slow real movement accumulates;
  - a fix implying a speed above the type's plausible maximum (run 12 m/s, walk/hike 8 m/s,
    ride 35 m/s) is a jump and is discarded; the server applies the same jump rule;
  - pause/resume starts a new segment; distance is never counted across segments.
- **Signal loss**: when fixes stop, the UI shows "weak"/"lost"; when they resume, the straight line
  since the last good fix is counted only if it is physically plausible. No points are invented.
- **Background**: with "Always"/"Allow all the time" permission, `Location.startLocationUpdatesAsync`
  delivers fixes to a TaskManager task defined at module load, so the OS can wake the JS runtime
  (Android foreground service notification; iOS background location indicator). Without it, a
  foreground watch is used and the UI says tracking stops in the background. Web uses the browser
  Geolocation API directly (foreground only).
- **Interruption**: the session is persisted on every change; points are appended to chunked
  on-device storage. On relaunch, a session idle for more than 2 minutes is converted to *paused at
  the last sign of life*, so dead time is not counted. The user can resume or save it.
- **Saving**: the recording is handed to the durable outbox before any network call
  (`src/features/recording/upload-queue.ts`). Network failures keep it pending (retried on
  reconnect, foreground and every minute); validation rejections are marked failed with the
  server's message and shown on the Pending uploads screen. Nothing is silently discarded.

## Challenges

Modes: `individual`, `competitive`, `collaborative`, `team`. Metrics: distance, duration (moving
time), activity count. Mixed activity types are allowed. Periods: weekly, monthly, yearly or custom;
recurring series (weekly/monthly/yearly) align to calendar periods in the challenge time zone.

| Rule | Behaviour |
| --- | --- |
| Window | An activity belongs to a challenge if it **started** in `[starts_at, ends_at)`. An activity crossing the deadline counts fully. |
| Late uploads | Accepted until `ends_at + submission_grace_hours` (default 72 h) for offline recordings. |
| Late joining | Allowed until `join_deadline` (if set) or the end. With `retroactive = true` (default), eligible activities since the start are back-filled at join time; otherwise only activities started after joining count. |
| Leaving | Allowed before the end. The participant row is deleted and all contributions are withdrawn from participant, team and challenge totals. A shared goal already reached stays reached. |
| Manual entries | Counted unless `allow_manual = false`. |
| Completion | Individual/competitive with a target: reaching it. Collaborative: the shared total reaches the goal; every participant with at least one contribution completes (also later first-time contributors). Team: a team reaching the target completes its contributing members. |
| Finalization | After the grace period, `finalize_challenge` writes final ranks once (row-locked, idempotent), awards podium XP (competitive top 3, team winners) and notifies participants. Triggered lazily by `refresh_challenges()` (app calls it on open, throttled) and optionally by pg_cron. |
| Recurrence | `roll_recurring_challenges()` creates only the current period's instance (never back-fills missed periods), copies teams and re-enrolls previous participants. Idempotent via `unique (series_id, starts_at)` and an advisory lock. |
| Rankings | Standard competition ranking (`rank()`): equal totals share a rank ("1, 2, 2, 4"); within a tie, whoever reached the value first (start time of their latest contributing activity) is listed first. The caller's own row is always returned. Only totals are exposed, never activity details. |

### Consistency strategy

- **Ledger + maintained aggregates**: `challenge_contributions` is the source of truth with
  `unique (challenge_id, activity_id)`, which is the core guarantee that an activity is never counted
  twice. Triggers maintain participant, team and challenge totals by delta inside the same
  transaction; tests assert aggregates always equal the ledger.
- **Lock ordering** (documented at the top of `20261024000002_engine.sql`): the acting user's
  `user_stats` row → challenge rows (ascending id) → team/participant rows → expedition rows →
  member rows → `user_xp` rows. XP totals live in their own table so rewarding *other* users (when a
  shared goal completes) never contends with their own processing lock. This ordering is what lets
  16 users contribute to the same goal concurrently without deadlocks or lost updates (verified on
  real Postgres).
- **Completion exactly once**: completion flags are set with `... where completed_at is null` and
  rewards use unique ledger keys (`experience_transactions (user_id, source_key)`), so retries,
  reprocessing and races cannot double-reward.

Trade-off: very large community challenges serialize contributions on the challenge row for the
rest of the submitting transaction. Throughput is ample for normal use; a sharded counter would be
the next step at very high volume.

## Epic journeys

Content (`journeys`, `journey_checkpoints`) is data: new journeys, distances, story text, rewards
and map paths can be added with SQL, with no app release. Artwork is original and procedurally
drawn from an `art_key` (`src/features/journeys/JourneyArt.tsx`); no film stills, logos or
franchise names are used. The fantasy "Road to the Ashen Peak" is an original alternative to a
trademarked setting; a licensed pack could be added the same way. Real-world distances are
approximate game values, stated in the app.

- An **expedition** is one traversal of a journey by a solo traveller or a group party; a user has at
  most one active expedition per journey (partial unique index).
- Only eligible activities of the journey's types that **started after the member joined** count;
  each activity counts once per expedition (`unique (expedition_id, activity_id)`).
- Every checkpoint at or behind the marker is unlocked once (`primary key (expedition_id,
  checkpoint_id)`), rewards active members and notifies them. At the total distance the expedition
  completes, rewards XP and the journey's theme, and frees members to replay.
- Group progress is shared; each member's `contributed_m` is tracked separately and shown as
  "your share". Leaving keeps your past distance with the party (the marker never moves backwards
  when someone leaves); the last member leaving abandons the expedition.

## Gamification

- **XP** is a ledger (`experience_transactions`) with a unique natural key per event. Activity XP
  comes from configurable `xp_rules` per type and is **capped per local day** (`game_settings.
  daily_activity_xp_cap`, 400) so XP never rewards over-training; allocation is deterministic by
  start time and re-balanced on edits/deletes.
- **Levels** are configurable thresholds in `levels`; a trigger keeps `user_xp.level` in sync and
  sends one notification per level jump.
- **Achievements** are rules in data (`achievements.rule`) evaluated only from validated server data;
  granted once (`primary key (user_id, achievement_id)`), with XP, optional theme and notification.
  Evaluation loops to a fixpoint so level achievements unlocked by achievement XP are not missed.
- **Streaks**: daily streak = consecutive *calendar days in the activity's time zone* with a
  qualifying activity (eligible, ≥ 10 minutes); weekly streak = consecutive ISO weeks with one.
  The weekly streak and copy in the app emphasise that rest days are fine; journeys and challenges
  never lose progress because of a missed day.
- **Themes**: `themes.unlock_rule` is data (`default`, `total_distance` with threshold, `level`, or
  `reward` from journeys/challenges/achievements). Unlocks are idempotent; when two sources unlock
  the same theme, the first source is recorded. The **equipped** theme lives on `profiles` with a
  composite foreign key to `user_unlocked_themes`, so the database itself refuses equipping a theme
  that is not unlocked. Palettes are validated with Zod and every derived text color is pushed to
  WCAG 4.5:1 contrast (`src/theme/registry.ts`, tested against every palette in the migration).

## Security model

- RLS is enabled on every table; nothing is granted to `anon`. Authenticated users can read what
  policies allow and **update only whitelisted columns** of their own profile and settings
  (column-level grants). All other writes go through SECURITY DEFINER RPCs with `search_path = ''`.
- Internal functions live in `app_private`, which PostgREST does not expose; only read-only
  visibility helpers used inside policies are executable by `authenticated`.
- Visibility: an activity's effective visibility is the stricter of its own setting and the owner's
  profile visibility; blocked users are hidden from each other everywhere (profiles, feed, search,
  comments, leaderboards).
- Raw GPS routes (`activity_routes`) are owner-only. Others see a simplified preview with the area
  within 200 m of the start and finish removed (default on), or nothing if route sharing is off.
- Tests (`supabase/tests/security.test.ts`) run as the `authenticated` role with forged claims and
  try to: write activities/stats/XP/achievements/themes/totals directly, edit others' data, call
  internal functions, read private data as strangers and anonymous users, equip locked themes, and
  inflate GPS distance. All are rejected.

### Threat model for activity manipulation

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Forging totals, ranks, XP, unlocks via API | No write access; server derives everything | None known |
| Claiming a larger GPS distance than recorded | Server recomputes from samples; jump filter | — |
| Submitting the same activity twice | `client_id` idempotency; one contribution per activity per challenge | — |
| Typing impossible manual activities | Hard limits + plausibility → ineligible | Plausible-but-fake manual entries are accepted. Challenges can require GPS (`allow_manual = false`). |
| Fabricated GPS tracks (spoofing apps, scripts) | Timestamp window, coordinate and ordering checks, per-segment speed limits | A determined user can generate a plausible fake track. Not preventable without device attestation or trusted hardware; out of scope for v1. |
| Driving/cycling while recording a run | Average and segment speed limits per type | Short vehicle segments at plausible speeds may pass. |
| Back-dating activities into closed challenges | Start-time window + grace period; finalized results frozen | Back-dating within the grace window is allowed by design. |
| Farming achievements by add/delete | Achievements are permanent but derived from eligible data; XP for deleted activities is removed | A deleted fake activity's achievement stays (documented trade-off for stable history). |

## Privacy and location safety

- Location permission is requested only when the user starts their first GPS recording, after an
  explanation; background permission only after an explicit opt-in with its own explanation.
- Location is used only during an active recording. No coordinates are logged by the app or the
  server functions; the push function forwards only identifiers.
- Activity visibility (everyone / friends / only me), profile visibility, route sharing and endpoint
  hiding are user settings, enforced in RLS and in every RPC (feed, leaderboards, profiles,
  comments). Private activities still count toward challenges you joined and your journeys, but
  other participants only ever see your total. The friends and global leaderboards count only
  non-private activities.
- **Retention**: full-resolution routes are kept while the activity exists. Users can delete a
  route at any time (stats remain) or the whole activity. On-device tracks are deleted after a
  successful upload or when a recording is discarded.
- **Account deletion** (`delete_my_account`): removes avatar files, then the auth user; every
  user-owned row cascades (profile, settings, activities, routes, contributions, memberships,
  achievements, XP, notifications, friendships, tokens). Contributions are removed from shared
  totals. Unsynced local data is cleared on the device.
- Credentials: the Supabase session is stored in the iOS Keychain / Android Keystore via
  `expo-secure-store` (chunked to stay within size limits); on web, `localStorage`. In-progress
  recordings and the outbox are stored in the app's private storage (AsyncStorage), which is
  sandboxed per app and covered by OS file encryption; they contain the route until upload.
- No location data is sent to third parties. Map tiles on Android come from Google Maps (requires
  an API key in release builds) and on iOS from Apple Maps; shared previews are drawn locally with
  SVG.

## Notifications

All notifications are rows in `notifications` created by the engine with optional dedupe keys
(e.g. one "Checkpoint reached" per expedition and checkpoint). The app shows them in-app with an
unread badge. Push delivery is a separate, optional transport (`push-dispatch` Edge Function on a
database webhook, Expo Push API); it requires an EAS project id and a development/production build.

## Error handling

- `src/lib/errors.ts` maps PostgREST/Auth/network errors and the database's SQLSTATE-classified
  messages (validation `22023`, permission `42501`, not found `P0002`, conflict `23505`) to
  user-facing text; network vs permanent errors drive retry behaviour.
- TanStack Query retries transient failures only; screens have loading, empty and error states with
  retry. A root error boundary keeps the app recoverable and reminds users that recordings are safe.
- Expired sessions sign the user out with a message; a token for a deleted account signs out locally.
