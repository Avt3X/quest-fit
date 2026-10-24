import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { type Db, createDb, createUser, expectError, hoursAgo, one, rpc, rpcRows, selectAs, submitActivity } from './harness.ts';

let db: Db;
before(async () => {
  db = await createDb();
});

const DAY_MS = 86400_000;
function dayAt(daysAgo: number, hourUtc: number): Date {
  const d = new Date(Date.now() - daysAgo * DAY_MS);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

describe('experience and levels', () => {
  test('activity XP follows the configured rules', async () => {
    const u = await createUser(db, 'Xp');
    const res = await submitActivity(db, u, { type: 'ride', distanceM: 20000, movingS: 3600 });
    const row = await one<{ amount: number }>(db, `select amount from public.experience_transactions where user_id = $1 and reason = 'activity'`, [u]);
    // ride: 10 base + 2/km * 20 + 1 per 10 min * 6 = 56
    assert.equal(row.amount, 56);
    assert.ok(res.xp_gained >= 56);
  });

  test('daily activity XP is capped and re-balanced when an activity is deleted', async () => {
    const u = await createUser(db, 'Capped');
    const a = await submitActivity(db, u, { type: 'run', distanceM: 42000, movingS: 14400, startedAt: dayAt(1, 6) });
    await submitActivity(db, u, { type: 'run', distanceM: 21000, movingS: 7200, startedAt: dayAt(1, 14) });
    const { rows } = await db.query<{ amount: number }>(
      `select amount from public.experience_transactions t join public.activities a on a.id = t.activity_id where t.user_id = $1 order by a.started_at`, [u]);
    assert.equal(rows.reduce((s, r) => s + r.amount, 0), 400, 'daily cap of 400 XP');
    assert.equal(rows[0].amount, Math.round(10 + 6 * 42 + 24), 'first activity gets its full XP');
    await rpc(db, u, 'delete_activity', { p_activity_id: a.activity_id });
    const after = await one<{ amount: number }>(db, `select amount from public.experience_transactions where user_id = $1 and reason = 'activity'`, [u]);
    assert.equal(after.amount, Math.round(10 + 6 * 21 + 12), 'freed cap is reallocated');
  });

  test('levels follow configured thresholds and notify once per level', async () => {
    const u = await createUser(db, 'Leveler');
    await db.query(`select app_private.award_xp($1, 700, 'achievement', 'test:bulk')`, [u]);
    const x = await one<{ xp_total: string; level: number }>(db, `select xp_total, level from public.user_xp where user_id = $1`, [u]);
    const expected = await one<{ level: number }>(db, `select max(level) as level from public.levels where xp_required <= 700`);
    assert.equal(x.level, expected.level);
    assert.ok(x.level >= 4);
    const notes = await one<{ n: number }>(db, `select count(*)::int as n from public.notifications where user_id = $1 and type = 'level_up'`, [u]);
    assert.equal(notes.n, 1, 'one level-up notification for a multi-level jump');
    // Re-awarding the same source key is a no-op.
    const again = await one<{ ok: boolean }>(db, `select app_private.award_xp($1, 700, 'achievement', 'test:bulk') as ok`, [u]);
    assert.equal(again.ok, false);
    assert.equal(Number((await one<{ xp_total: string }>(db, `select xp_total from public.user_xp where user_id = $1`, [u])).xp_total), 700);
  });
});

describe('achievements', () => {
  test('unlock exactly once even when evaluation runs repeatedly', async () => {
    const u = await createUser(db, 'Achiever');
    const r = await submitActivity(db, u, { distanceM: 5100, movingS: 1800 });
    assert.deepEqual(r.achievements.map((a) => a.id).sort(), ['first_5k', 'first_steps']);
    for (let i = 0; i < 3; i += 1) {
      await db.query(`select app_private.evaluate_rewards($1, null)`, [u]);
    }
    const { rows } = await db.query<{ achievement_id: string; n: number }>(
      `select achievement_id, count(*)::int as n from public.user_achievements where user_id = $1 group by 1`, [u]);
    assert.ok(rows.every((x) => x.n === 1));
    const xp = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and reason = 'achievement'`, [u]);
    assert.equal(xp.n, 2);
    const second = await submitActivity(db, u, { distanceM: 5200, movingS: 1800, startedAt: hoursAgo(1) });
    assert.equal(second.achievements.length, 0, 'nothing new on the second 5K');
  });

  test('progress view reports current value and target for every achievement', async () => {
    const u = await createUser(db, 'Progress');
    await submitActivity(db, u, { distanceM: 12000, movingS: 4000 });
    const rows = await rpcRows<{ id: string; current_value: string; target_value: string; earned_at: string | null }>(db, u, 'get_achievement_progress');
    const club = rows.find((r) => r.id === 'club_100k')!;
    assert.equal(Number(club.current_value), 12000);
    assert.equal(Number(club.target_value), 100000);
    assert.equal(club.earned_at, null);
    assert.notEqual(rows.find((r) => r.id === 'double_digits')!.earned_at, null);
  });

  test('seven-day streak is derived from consecutive local days with qualifying activity', async () => {
    const u = await createUser(db, 'Streaker');
    for (let d = 7; d >= 1; d -= 1) {
      await submitActivity(db, u, { type: 'walk', distanceM: 2000, movingS: 900, startedAt: dayAt(d, 9) });
    }
    // Too short to qualify for streaks (under 10 minutes): does not extend.
    await submitActivity(db, u, { type: 'walk', distanceM: 500, movingS: 300, startedAt: dayAt(0, Math.min(new Date().getUTCHours(), 1)) });
    const s = await one<{ daily_streak_days: number; longest_daily_streak: number; weekly_streak_weeks: number }>(
      db, `select daily_streak_days, longest_daily_streak, weekly_streak_weeks from public.user_stats where user_id = $1`, [u]);
    assert.equal(s.daily_streak_days, 7);
    assert.equal(s.longest_daily_streak, 7);
    assert.ok(s.weekly_streak_weeks >= 1);
    const ach = await one<{ n: number }>(db, `select count(*)::int as n from public.user_achievements where user_id = $1 and achievement_id = 'seven_day_streak'`, [u]);
    assert.equal(ach.n, 1);
  });

  test('streak breaks on a missing day', async () => {
    const u = await createUser(db, 'Gappy');
    for (const d of [6, 5, 3, 2, 1]) {
      await submitActivity(db, u, { type: 'walk', distanceM: 2000, movingS: 900, startedAt: dayAt(d, 9) });
    }
    const s = await one<{ daily_streak_days: number; longest_daily_streak: number }>(
      db, `select daily_streak_days, longest_daily_streak from public.user_stats where user_id = $1`, [u]);
    assert.equal(s.daily_streak_days, 3);
    assert.equal(s.longest_daily_streak, 3);
  });
});

describe('themes', () => {
  test('default theme is unlocked and equipped at sign-up', async () => {
    const u = await createUser(db, 'Fresh');
    const p = await one<{ equipped_theme_id: string }>(db, `select equipped_theme_id from public.profiles where id = $1`, [u]);
    assert.equal(p.equipped_theme_id, 'trailhead');
  });

  test('distance thresholds unlock themes once; equipping requires an unlock', async () => {
    const u = await createUser(db, 'Themer');
    await expectError(rpc(db, u, 'equip_theme', { p_theme_id: 'ember' }), /Unlock this theme/);
    const r = await submitActivity(db, u, { distanceM: 5000, movingS: 1800 });
    assert.deepEqual(r.themes.map((t) => t.id), ['ember']);
    await rpc(db, u, 'equip_theme', { p_theme_id: 'ember' });
    assert.equal((await one<{ equipped_theme_id: string }>(db, `select equipped_theme_id from public.profiles where id = $1`, [u])).equipped_theme_id, 'ember');
    const again = await submitActivity(db, u, { distanceM: 5000, movingS: 1800, startedAt: hoursAgo(1) });
    assert.equal(again.themes.length, 0);
    const notes = await one<{ n: number }>(db, `select count(*)::int as n from public.notifications where user_id = $1 and type = 'theme_unlocked'`, [u]);
    assert.equal(notes.n, 1);
  });

  test('a theme unlocked by two sources is recorded once (first source wins)', async () => {
    const u = await createUser(db, 'Conflict');
    const first = await one<{ ok: boolean }>(db, `select app_private.unlock_theme($1, 'sakura', 'journey:a') as ok`, [u]);
    const second = await one<{ ok: boolean }>(db, `select app_private.unlock_theme($1, 'sakura', 'challenge:b') as ok`, [u]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    const row = await one<{ source: string; n: number }>(db, `select min(source) as source, count(*)::int as n from public.user_unlocked_themes where user_id = $1 and theme_id = 'sakura'`, [u]);
    assert.equal(row.n, 1);
    assert.equal(row.source, 'journey:a');
  });

  test('thresholds live in data: changing them changes unlocking without code changes', async () => {
    const u = await createUser(db, 'Config');
    await db.query(`update public.themes set unlock_rule = '{"type":"total_distance","threshold_m":2000}' where id = 'summit'`);
    try {
      const r = await submitActivity(db, u, { distanceM: 2500, movingS: 900 });
      assert.ok(r.themes.some((t) => t.id === 'summit'));
    } finally {
      await db.query(`update public.themes set unlock_rule = '{"type":"total_distance","threshold_m":100000}' where id = 'summit'`);
    }
  });

  test('equipped theme is cleared if an unlock is ever revoked by an operator', async () => {
    const u = await createUser(db, 'Revoked');
    await db.query(`select app_private.unlock_theme($1, 'tidewater', 'test')`, [u]);
    await rpc(db, u, 'equip_theme', { p_theme_id: 'tidewater' });
    await db.query(`delete from public.user_unlocked_themes where user_id = $1 and theme_id = 'tidewater'`, [u]);
    const p = await one<{ equipped_theme_id: string | null }>(db, `select equipped_theme_id from public.profiles where id = $1`, [u]);
    assert.equal(p.equipped_theme_id, null);
  });
});

describe('weekly leaderboard', () => {
  test('ranks friends by this week’s non-private distance with shared ranks', async () => {
    const [me, f1, f2] = await Promise.all(['LbMe', 'LbF1', 'LbF2'].map((n) => createUser(db, n)));
    for (const f of [f1, f2]) {
      await rpc(db, me, 'send_friend_request', { p_user_id: f });
      await rpc(db, f, 'respond_friend_request', { p_user_id: me, p_accept: true });
    }
    // Started two minutes ago so the activity is inside "this week" even right after Monday 00:00.
    const recent = new Date(Date.now() - 2 * 60_000);
    await submitActivity(db, me, { distanceM: 2500, movingS: 600, startedAt: recent });
    await submitActivity(db, f1, { distanceM: 2500, movingS: 600, startedAt: recent });
    await submitActivity(db, f2, { distanceM: 3000, movingS: 600, startedAt: recent, visibility: 'private' });
    const rows = await rpcRows<{ user_id: string; rank: string; value: string }>(db, me, 'get_leaderboard', { p_period: 'week', p_scope: 'friends', p_metric: 'distance', p_limit: 10 });
    assert.equal(rows.length, 2, 'private activities are excluded from leaderboards');
    assert.deepEqual(rows.map((r) => Number(r.rank)), [1, 1]);
    void selectAs;
  });
});
