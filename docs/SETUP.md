# Setup and deployment

## Requirements

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 20.19+ (tested with 22.23) | App, tooling, tests |
| Docker Desktop | recent | Local Supabase stack |
| Supabase CLI | installed as a dev dependency (`npx supabase …`) | Migrations, local stack, type generation |
| Xcode 16+ / Android Studio | optional | Local native builds (EAS Build works without them) |
| EAS CLI | `npx eas-cli@latest` | Cloud builds and submissions |

## 1. Run everything locally

```bash
npm install
npm run db:start             # supabase start: Postgres, Auth, Storage, Mailpit
npm run db:reset             # applies supabase/migrations and supabase/seed.sql (dev fixtures)
cp .env.example .env.local   # then set the two values printed by `npx supabase status`
npx expo start               # press w for web, or scan the QR code with a development build
```

`.env.local` for the local stack:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321   # use your LAN IP on a physical phone
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from `npx supabase status`>
```

Demo accounts created by `supabase/seed.sql` (local only), all with password `questfit-dev-1`:
`alice@questfit.dev` (rich history, friends, solo and group journeys), `bob@questfit.dev`,
`chen@questfit.dev`, `dana@questfit.dev` (new user with a pending friend request).

Confirmation and password-reset emails are captured by Mailpit at <http://127.0.0.1:54324>. The
templates in `supabase/templates` include the 6-digit code the app asks for.

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Expo config, React Compiler rules) |
| `npm test` | Jest: domain logic, theme contrast, outbox, components |
| `npm run test:db` | Database tests on PGlite: engine, RLS, rules parity (no Docker needed) |
| `npm run test:db:integration` | Concurrency tests against the local Supabase Postgres |
| `npm run db:types` | Regenerates `src/types/database.ts` from the local schema |
| `npm run export:check` | Bundles iOS, Android and web (`expo export`) |

> Expo Go: most screens work in Expo Go, but background location, Apple Sign In, push tokens and
> react-native-maps on recent SDKs need a **development build** (`npx expo run:ios|android` or
> `eas build --profile development`).

## 2. Hosted Supabase project

1. Create a project at <https://supabase.com/dashboard>.
2. Link and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies every file in supabase/migrations
   ```
   The content migration (`20261024000006_content.sql`) creates the production themes, levels,
   XP rules, achievements, journeys and official recurring challenges. **Do not run `seed.sql` in
   production**; it only contains demo users.
3. App configuration: copy the project URL and the anon/publishable key into the app's
   environment (EAS secrets or `.env.local`):
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never ship the service-role key.
4. **Auth → URL configuration**: Site URL = your web origin (if any); add redirect URLs
   `questfit://**` (and `exp://**` for development).
5. **Auth → Providers → Email**: enable "Confirm email". **Auth → Email templates**: paste
   `supabase/templates/confirmation.html` ("Confirm signup") and `recovery.html` ("Reset
   password"); both include `{{ .Token }}` so users can type the code. Configure custom SMTP for
   production deliverability.
6. Optional providers:
   - **Apple** (iOS): enable the Apple provider with your Services ID / key; the app uses native
     Sign in with Apple and `signInWithIdToken`. Set `EXPO_PUBLIC_AUTH_APPLE_ENABLED=true` and keep
     `usesAppleSignIn` in `app.config.ts`.
   - **Google**: enable the Google provider with OAuth client credentials and add
     `questfit://auth/callback` as an allowed redirect. Set `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
   Buttons stay hidden until these flags are set, so unconfigured providers never appear.
7. Storage: the `avatars` bucket and its policies are created by migration `…005_storage.sql`.

### Scheduled housekeeping (recommended)

The app calls `refresh_challenges()` when it opens, which rolls recurring challenges into the
current period and finalizes ended ones. To do this independently of app traffic, enable the
`pg_cron` extension and schedule:

```sql
select cron.schedule('questfit-roll', '5 * * * *', $$select app_private.roll_recurring_challenges()$$);
select cron.schedule('questfit-finalize', '15 * * * *', $$select app_private.finalize_due_challenges(100)$$);
```

### Push notifications (optional)

In-app notifications work without this.

1. `npx eas-cli init` and set `EAS_PROJECT_ID` (read by `app.config.ts`); configure APNs and FCM
   credentials with `eas credentials`.
2. Deploy the function and its secrets:
   ```bash
   npx supabase functions deploy push-dispatch --no-verify-jwt
   npx supabase secrets set PUSH_WEBHOOK_SECRET=<random string> EXPO_ACCESS_TOKEN=<optional>
   ```
3. Dashboard → Database → Webhooks → create a webhook on `public.notifications`, event `INSERT`,
   type "Supabase Edge Function" → `push-dispatch`, HTTP header
   `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`.
4. Users enable push in Settings; the app registers the Expo push token via
   `register_push_token`.

## 3. Environment variables

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | App | Yes | Supabase API URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | App | Yes | Anon/publishable key (RLS-restricted, safe to ship) |
| `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED` | App | No | Shows "Continue with Google" when `true` |
| `EXPO_PUBLIC_AUTH_APPLE_ENABLED` | App | No | Shows "Continue with Apple" on iOS when `true` |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Build | Android release | Google Maps SDK key for map tiles |
| `EAS_PROJECT_ID` | Build | For push | Expo push token project id |
| `IOS_BUNDLE_IDENTIFIER`, `ANDROID_PACKAGE` | Build | No | Override `com.questfit.app` |
| `PUSH_WEBHOOK_SECRET` | Edge Function secret | For push | Authenticates the webhook |
| `EXPO_ACCESS_TOKEN` | Edge Function secret | No | Enhanced push security |
| `SUPABASE_DB_URL` | CI / local | No | Database URL for `test:db:integration` |

Without `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` the app shows a "Connect a backend" screen and does
not fake any data.

## 4. iOS

- Background location: `app.config.ts` enables `UIBackgroundModes: location` and sets the three
  `NSLocation*UsageDescription` strings via the `expo-location` plugin. Apple review expects the
  "Always" explanation to match real use (only during recordings), which it does.
- Development build: `npx expo run:ios` (Xcode) or `eas build --profile development --platform ios`.
- Release: `eas build --profile production --platform ios`, then `eas submit -p ios`.
- Sign in with Apple requires the capability on the bundle id (EAS handles it with `usesAppleSignIn`).
- Maps use Apple Maps (no key needed).

## 5. Android

- Permissions declared: fine/coarse location, background location, foreground service (location),
  post notifications. Background location is requested at runtime only after the user opts in;
  while recording, a foreground-service notification is shown. Google Play requires the
  background-location declaration form describing this use.
- Set `GOOGLE_MAPS_ANDROID_API_KEY` for release builds (Maps SDK for Android, restricted to the
  app's package and signing certificate).
- Development build: `npx expo run:android` or `eas build --profile development --platform android`.
- Release: `eas build --profile production --platform android`, then `eas submit -p android`.

## 6. Web

`npx expo start --web` for development; `npx expo export --platform web` produces a static SPA in
`dist/`. GPS recording on the web is foreground-only; maps are drawn with SVG.

## Troubleshooting

- **Phone cannot reach the local stack**: use your computer's LAN IP in `EXPO_PUBLIC_SUPABASE_URL`
  and make sure port 54321 is reachable.
- **"You do not have permission to do that"** on writes: the migrations were not all applied; run
  `npm run db:reset` locally or `supabase db push` remotely.
- **Changed `.env.local` but nothing happened**: restart Metro with `npx expo start -c`.
