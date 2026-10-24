// Test harness: boots an in-process Postgres (PGlite), installs a minimal shim of the Supabase
// platform objects the migrations depend on (roles, auth.users, auth.uid(), storage), then applies
// every migration in supabase/migrations in order. Tests then act as specific users by setting the
// same JWT claim settings PostgREST sets and switching to the `authenticated` role, so RLS and
// SECURITY DEFINER behaviour match production.
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create schema extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
`;

export type Db = PGlite;
export type Tx = Transaction;

export async function createDb(): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_SHIM);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

let userCounter = 0;

export async function createUser(db: Db, name: string, meta: Record<string, unknown> = {}): Promise<string> {
  userCounter += 1;
  const handle = `${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}${userCounter}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${handle}@test.questfit.dev`, JSON.stringify({ display_name: name, username: handle, ...meta })],
  );
  const id = rows[0].id;
  await db.query(`update public.profiles set onboarding_completed_at = now() where id = $1`, [id]);
  return id;
}

/** Runs `fn` in a transaction as the given user, exactly as PostgREST would for a signed-in request. */
export async function asUser<T>(db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ]);
    await tx.exec(userId ? 'set local role authenticated' : 'set local role anon');
    return fn(tx);
  });
}

export async function rpc<T = unknown>(db: Db, userId: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const names = Object.keys(args);
  const params = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
  const values = names.map((n) => {
    const v = args[n];
    return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) ? JSON.stringify(v) : v;
  });
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ result: T }>(`select public.${fn}(${params}) as result`, values);
    return rows[0].result;
  });
}

export async function rpcRows<T = Record<string, unknown>>(
  db: Db,
  userId: string,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T[]> {
  const names = Object.keys(args);
  const params = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<T>(`select * from public.${fn}(${params})`, names.map((n) => args[n]));
    return rows;
  });
}

export async function selectAs<T = Record<string, unknown>>(db: Db, userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}

let clientCounter = 0;
export function clientId(): string {
  clientCounter += 1;
  const hex = clientCounter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export interface ActivityInput {
  type?: string;
  source?: 'gps' | 'manual';
  startedAt?: Date;
  distanceM?: number;
  movingS?: number;
  elapsedS?: number;
  title?: string;
  visibility?: 'public' | 'friends' | 'private';
  route?: unknown[];
  clientId?: string;
  timezone?: string;
}

export function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

export async function submitActivity(db: Db, userId: string, input: ActivityInput = {}): Promise<ActivitySummary> {
  const movingS = input.movingS ?? 1800;
  return rpc<ActivitySummary>(db, userId, 'submit_activity', {
    p_client_id: input.clientId ?? clientId(),
    p_type: input.type ?? 'run',
    p_source: input.source ?? 'manual',
    p_started_at: (input.startedAt ?? hoursAgo(2)).toISOString(),
    p_elapsed_time_s: input.elapsedS ?? movingS,
    p_moving_time_s: movingS,
    p_distance_m: input.distanceM ?? 5000,
    p_title: input.title ?? null,
    p_visibility: input.visibility ?? 'friends',
    p_timezone: input.timezone ?? 'UTC',
    p_route: input.route ? JSON.stringify(input.route) : null,
  });
}

export interface ActivitySummary {
  activity_id: string;
  replayed: boolean;
  is_eligible: boolean;
  ineligible_reason: string | null;
  distance_m: number;
  xp_gained: number;
  xp_total: number;
  level_before: number;
  level_after: number;
  challenges: { challenge_id: string; title: string; value: number; progress_value: number; completed_now: boolean; completed: boolean }[];
  journeys: { expedition_id: string; value_m: number; progress_m: number; checkpoints: string[]; completed_now: boolean }[];
  achievements: { id: string; title: string }[];
  themes: { id: string; name: string }[];
  personal_records: { kind: string; value: number }[];
}

/** Inserts a challenge directly (bypassing create_challenge validation) for time-window tests. */
export async function insertChallenge(db: Db, fields: Record<string, unknown>): Promise<string> {
  const defaults: Record<string, unknown> = {
    title: 'Test Challenge',
    mode: 'individual',
    metric: 'distance',
    target_value: 10000,
    activity_types: '{run,indoor_run,walk,hike,ride}',
    starts_at: hoursAgo(24 * 7).toISOString(),
    ends_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    visibility: 'public',
    is_official: true,
    xp_reward: 100,
  };
  const row = { ...defaults, ...fields };
  const cols = Object.keys(row);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.challenges (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    cols.map((c) => row[c]),
  );
  return rows[0].id;
}

export async function expectError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (!pattern.test(message)) {
      throw new Error(`Expected error matching ${pattern}, got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected error matching ${pattern}, but the call succeeded`);
}

/** Builds a straight GPS track heading north at `speedMps`, one sample every `intervalS` seconds. */
export function straightRoute(opts: {
  start: Date;
  points: number;
  speedMps: number;
  intervalS?: number;
  lat?: number;
  lng?: number;
  segmentBreaks?: number[];
}): number[][] {
  const intervalS = opts.intervalS ?? 5;
  const lat0 = opts.lat ?? 41.7151;
  const lng0 = opts.lng ?? 44.8271;
  const metersPerDegLat = 111_195;
  const route: number[][] = [];
  let segment = 0;
  for (let i = 0; i < opts.points; i += 1) {
    if (opts.segmentBreaks?.includes(i)) segment += 1;
    const t = opts.start.getTime() + i * intervalS * 1000;
    const lat = lat0 + (i * intervalS * opts.speedMps) / metersPerDegLat;
    route.push([lat, lng0, t, null as unknown as number, 5, segment]);
  }
  return route;
}

export const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
