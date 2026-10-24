// Concurrency tests against a real Postgres (the local Supabase database by default). PGlite is
// single-connection, so true races can only be exercised here. Skips when no database is reachable.
//   SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db:integration
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new pg.Pool({ connectionString: url, max: 30 });
const createdUsers: string[] = [];
const createdChallenges: string[] = [];
let available = true;

before(async () => {
  try {
    await pool.query('select 1');
  } catch {
    available = false;
  }
});

after(async () => {
  if (available) {
    if (createdChallenges.length) await pool.query('delete from public.challenges where id = any($1)', [createdChallenges]);
    if (createdUsers.length) await pool.query('delete from auth.users where id = any($1)', [createdUsers]);
  }
  await pool.end();
});

async function createUser(tag: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
    [id, `${tag}-${id.slice(0, 8)}@concurrency.test`, JSON.stringify({ display_name: tag })],
  );
  createdUsers.push(id);
  return id;
}

/** Runs one RPC in its own connection and transaction, as PostgREST does per request. */
async function asUser<T>(userId: string, sql: string, params: unknown[]): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await client.query('set local role authenticated');
    const { rows } = await client.query(sql, params);
    await client.query('commit');
    return rows[0] as T;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function submit(userId: string, clientId: string, distanceM: number) {
  return asUser<{ result: { activity_id: string; replayed: boolean } }>(
    userId,
    `select public.submit_activity(p_client_id => $1, p_type => 'run', p_source => 'manual',
       p_started_at => now() - interval '2 hours', p_elapsed_time_s => 1500, p_moving_time_s => 1500,
       p_distance_m => $2, p_timezone => 'UTC') as result`,
    [clientId, distanceM],
  );
}

describe('concurrent contributions', { skip: false }, () => {
  test('many participants contributing at the same instant keep exact totals and complete once', async (t) => {
    if (!available) return t.skip('no database');
    const users = await Promise.all(Array.from({ length: 16 }, (_, i) => createUser(`racer${i}`)));
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.challenges (title, mode, metric, target_value, activity_types, starts_at, ends_at, is_official, xp_reward)
       values ('Concurrency goal', 'collaborative', 'distance', 40000, '{run}', now() - interval '1 day', now() + interval '6 days', true, 50)
       returning id`,
    );
    const challengeId = rows[0].id;
    createdChallenges.push(challengeId);
    await Promise.all(users.map((u) => asUser(u, `select public.join_challenge($1) as result`, [challengeId])));

    // Everyone submits simultaneously; the goal (40 km) is crossed somewhere in the middle.
    await Promise.all(users.map((u) => submit(u, randomUUID(), 3000)));

    const check = await pool.query<{ total: string; ledger: string; parts: string; reached: string | null; completed: string; xp: string }>(
      `select c.total_progress as total,
              (select sum(value) from public.challenge_contributions where challenge_id = c.id) as ledger,
              (select sum(progress_value) from public.challenge_participants where challenge_id = c.id) as parts,
              c.goal_reached_at as reached,
              (select count(*) from public.challenge_participants where challenge_id = c.id and completed_at is not null) as completed,
              (select count(*) from public.experience_transactions where source_key = 'challenge:' || c.id) as xp
       from public.challenges c where c.id = $1`,
      [challengeId],
    );
    const r = check.rows[0];
    assert.equal(Number(r.total), 16 * 3000);
    assert.equal(Number(r.ledger), 16 * 3000);
    assert.equal(Number(r.parts), 16 * 3000);
    assert.notEqual(r.reached, null);
    assert.equal(Number(r.completed), 16, 'every contributor completed');
    assert.equal(Number(r.xp), 16, 'exactly one completion reward per participant');
  });

  test('the same recording submitted concurrently from several connections is saved once', async (t) => {
    if (!available) return t.skip('no database');
    const user = await createUser('retrier');
    const clientId = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => submit(user, clientId, 5000)));
    const ids = new Set(results.map((r) => r.result.activity_id));
    assert.equal(ids.size, 1, 'all retries resolve to the same activity');
    assert.equal(results.filter((r) => !r.result.replayed).length, 1, 'only one request actually inserted');
    const count = await pool.query<{ n: string }>('select count(*) as n from public.activities where user_id = $1', [user]);
    assert.equal(Number(count.rows[0].n), 1);
    const xp = await pool.query<{ n: string }>(`select count(*) as n from public.experience_transactions where user_id = $1 and reason = 'activity'`, [user]);
    assert.equal(Number(xp.rows[0].n), 1);
  });

  test('concurrent team contributions aggregate per team without lost updates', async (t) => {
    if (!available) return t.skip('no database');
    const users = await Promise.all(Array.from({ length: 10 }, (_, i) => createUser(`teammate${i}`)));
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.challenges (title, mode, metric, target_value, activity_types, starts_at, ends_at, is_official)
       values ('Concurrent teams', 'team', 'distance', null, '{run}', now() - interval '1 day', now() + interval '6 days', true)
       returning id`,
    );
    const challengeId = rows[0].id;
    createdChallenges.push(challengeId);
    await pool.query(`insert into public.challenge_teams (challenge_id, name, color) values ($1, 'North', '#112233'), ($1, 'South', '#332211')`, [challengeId]);
    for (const u of users) await asUser(u, `select public.join_challenge($1) as result`, [challengeId]);
    await Promise.all(users.flatMap((u) => [submit(u, randomUUID(), 2000), submit(u, randomUUID(), 1000)]));
    const teams = await pool.query<{ total_progress: string; member_count: number; sum: string }>(
      `select t.total_progress, t.member_count,
              (select coalesce(sum(value), 0) from public.challenge_contributions cc where cc.team_id = t.id) as sum
       from public.challenge_teams t where t.challenge_id = $1`,
      [challengeId],
    );
    assert.equal(teams.rows.reduce((s, t) => s + t.member_count, 0), 10);
    for (const team of teams.rows) assert.equal(Number(team.total_progress), Number(team.sum));
    assert.equal(teams.rows.reduce((s, t) => s + Number(t.total_progress), 0), 10 * 3000);
  });
});
