QuestFit: an Expo (React Native, TypeScript strict) app on Supabase. Read `docs/ARCHITECTURE.md`
before changing game rules, and keep `docs/CHECKLIST.md` honest when behaviour changes.

## Expo has changed: do not trust your training data

This project uses Expo SDK 58 (React Native 0.88, React 19, TypeScript 6). Before touching an Expo,
EAS or React Native API, fetch the versioned docs at `https://docs.expo.dev/versions/v58.0.0/` or
the index at https://docs.expo.dev/llms.txt. Never answer from memory.

## Commands

```bash
npx expo install <package>    # always, instead of npm add: resolves SDK-compatible versions
npx expo start                # dev server (w = web)
npm run typecheck && npm run lint && npx jest --no-watchman
npm run test:db               # database engine and RLS tests (PGlite, no Docker)
npm run test:db:integration   # concurrency tests (needs `npm run db:start`)
npm run db:reset && npm run db:types   # after any migration change
npx expo-doctor
```

Run typecheck, lint and the relevant test suites before declaring a task done. Never report tests
as passing unless they were run.

## Architecture rules

- **The database is the authority.** Anything that affects progress, rankings, XP, achievements,
  streaks or unlocks lives in `app_private` PL/pgSQL (see `supabase/migrations/*_engine.sql`) and
  runs inside the write transaction. The app only submits activities and intents through public
  RPCs and reads results. Never compute or send totals from the client.
- New RPCs: `security definer`, `set search_path = ''`, derive the user from
  `app_private.require_user()`, validate input with SQLSTATE `22023`, take locks in the documented
  order, and grant execute only to `authenticated`. Add tests in `supabase/tests`.
- Idempotency comes from unique keys (`client_id`, `(challenge_id, activity_id)`, XP `source_key`,
  notification `dedupe_key`). Keep every reward path idempotent.
- Plausibility limits exist twice (`app_private.max_*` and `src/domain/activity-rules.ts`);
  `rules-parity.test.ts` must keep passing.
- Store meters and seconds; convert only for display (`src/domain/units.ts`).
- Game content (journeys, themes, achievements, levels, XP rules) is data in
  `*_content.sql`. Artwork must be original; never add franchise names, logos or images.
- Secrets: only `EXPO_PUBLIC_*` values may reach the app, and they must be safe to publish.
  Service-role keys belong to Edge Function secrets only. Never commit `.env.local`.

## App conventions

- Routes live in `src/app` (Expo Router); everything else lives outside it. Data hooks live in
  `src/features/<feature>/api.ts` (TanStack Query); pure logic lives in `src/domain` with Jest
  tests.
- Use the design system in `src/components/ui` and theme tokens from `useAppTheme()`; never
  hard-code colors that must follow the theme.
- Accessibility: use `aria-*` props (`aria-selected`, `aria-checked`, `aria-disabled`,
  `aria-valuenow`, `aria-hidden`) rather than `accessibilityState`/`accessibilityValue`, which
  react-native-web ignores. Give every pressable a role and label.
- The React Compiler lint rules apply: no setState in effects for derived state, no `Date.now()`
  during render, no mutation during render.
- Never create or edit `ios/` or `android/` by hand; configure native behaviour in
  `app.config.ts` and config plugins. Native modules need a development build, not Expo Go.
