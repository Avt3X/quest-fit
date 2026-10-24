import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import {
  type Db,
  clientId,
  createDb,
  createUser,
  expectError,
  hoursAgo,
  one,
  rpc,
  rpcRows,
  selectAs,
  straightRoute,
  submitActivity,
} from './harness.ts';

let db: Db;
before(async () => {
  db = await createDb();
});

describe('activity submission', () => {
  test('manual activity is stored with canonical units and a default title', async () => {
    const u = await createUser(db, 'Mira');
    const res = await submitActivity(db, u, { type: 'walk', distanceM: 3250, movingS: 2400, startedAt: new Date('2026-10-20T07:30:00Z'), timezone: 'Asia/Tbilisi' });
    const row = await one<{ distance_m: number; moving_time_s: number; title: string; local_date: string; source: string; has_route: boolean }>(db, 
      `select distance_m, moving_time_s, title, local_date::text, source, has_route from public.activities where id = $1`,
      [res.activity_id],
    );
    assert.equal(row.distance_m, 3250);
    assert.equal(row.moving_time_s, 2400);
    // 07:30 UTC is 11:30 in Tbilisi (UTC+4): a lunch walk on the local date.
    assert.equal(row.title, 'Lunch Walk');
    assert.equal(row.local_date, '2026-10-20');
    assert.equal(row.source, 'manual');
    assert.equal(row.has_route, false);
  });

  test('duplicate submission with the same client_id is idempotent', async () => {
    const u = await createUser(db, 'Dup');
    const cid = clientId();
    const first = await submitActivity(db, u, { clientId: cid, distanceM: 5000 });
    const second = await submitActivity(db, u, { clientId: cid, distanceM: 5000 });
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(second.activity_id, first.activity_id);
    assert.equal(second.xp_gained, first.xp_gained, 'replay returns the original summary');
    const count = await one<{ n: number }>(db, `select count(*)::int as n from public.activities where user_id = $1`, [u]);
    assert.equal(count.n, 1);
    const xp = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and reason = 'activity'`, [u]);
    assert.equal(xp.n, 1);
  });

  test('the same client_id from two different users creates two activities', async () => {
    const a = await createUser(db, 'Ann');
    const b = await createUser(db, 'Ben');
    const cid = clientId();
    const ra = await submitActivity(db, a, { clientId: cid });
    const rb = await submitActivity(db, b, { clientId: cid });
    assert.notEqual(ra.activity_id, rb.activity_id);
  });

  test('rejects invalid metrics', async () => {
    const u = await createUser(db, 'Invalid');
    await expectError(submitActivity(db, u, { movingS: 10, elapsedS: 600 }), /Moving time must be between/);
    await expectError(submitActivity(db, u, { movingS: 10, elapsedS: 10 }), /Elapsed time must be between/);
    await expectError(submitActivity(db, u, { movingS: 1800, elapsedS: 1200 }), /Moving time cannot exceed elapsed time/);
    await expectError(submitActivity(db, u, { distanceM: -5 }), /Distance must be between/);
    await expectError(submitActivity(db, u, { type: 'run', distanceM: 400_000 }), /Distance must be between 0 and 300 km/);
    await expectError(submitActivity(db, u, { startedAt: new Date(Date.now() + 3600_000) }), /cannot end in the future/);
    await expectError(submitActivity(db, u, { startedAt: new Date(Date.now() - 400 * 86400_000) }), /older than one year/);
    await expectError(submitActivity(db, u, { timezone: 'Mars/Olympus' }), /Unknown time zone/);
  });

  test('implausible speed is kept but marked ineligible and earns nothing', async () => {
    const u = await createUser(db, 'Speedy');
    const res = await submitActivity(db, u, { type: 'run', distanceM: 20000, movingS: 1800 });
    assert.equal(res.is_eligible, false);
    assert.match(res.ineligible_reason ?? '', /40\.0 km\/h is not plausible/);
    assert.equal(res.xp_gained, 0);
    assert.equal(res.achievements.length, 0);
    const stats = await one<{ activity_count: number; total_distance_m: string }>(db, 
      `select activity_count, total_distance_m from public.user_stats where user_id = $1`, [u]);
    assert.equal(stats.activity_count, 0, 'ineligible activities are excluded from stats');
  });

  test('manual activities cannot carry a route and indoor types cannot be GPS', async () => {
    const u = await createUser(db, 'Rules');
    const route = straightRoute({ start: hoursAgo(1), points: 10, speedMps: 3 });
    await expectError(submitActivity(db, u, { source: 'manual', route }), /cannot include a GPS route/);
    await expectError(submitActivity(db, u, { source: 'gps', type: 'indoor_run', route }), /only available for outdoor/);
  });
});

describe('GPS routes', () => {
  test('server recomputes distance from the samples and ignores the client figure', async () => {
    const u = await createUser(db, 'Gps');
    const start = hoursAgo(1);
    // 121 samples, 5 s apart, 3 m/s north => 600 s and about 1,800 m.
    const route = straightRoute({ start, points: 121, speedMps: 3 });
    const res = await submitActivity(db, u, { source: 'gps', route, startedAt: start, movingS: 600, distanceM: 99_999 });
    assert.ok(Math.abs(res.distance_m - 1800) <= 2, `expected ~1800 m, got ${res.distance_m}`);
  });

  test('GPS jumps faster than plausible add no distance', async () => {
    const u = await createUser(db, 'Jumpy');
    const start = hoursAgo(1);
    const route = straightRoute({ start, points: 61, speedMps: 3 });
    // Teleport sample #30 one degree away (about 111 km): a classic GPS glitch.
    route[30] = [route[30][0] + 1, route[30][1], route[30][2], 0, 50, 0];
    const res = await submitActivity(db, u, { source: 'gps', route, startedAt: start, movingS: 300 });
    assert.ok(res.distance_m >= 890 && res.distance_m <= 902, `glitch filtered, got ${res.distance_m}`);
  });

  test('distance is not counted across a pause (new segment)', async () => {
    const u = await createUser(db, 'Pause');
    const start = hoursAgo(1);
    const route = straightRoute({ start, points: 41, speedMps: 3, segmentBreaks: [20] });
    const res = await submitActivity(db, u, { source: 'gps', route, startedAt: start, movingS: 200, elapsedS: 200 });
    // 39 counted gaps of 15 m instead of 40.
    assert.ok(Math.abs(res.distance_m - 585) <= 2, `got ${res.distance_m}`);
  });

  test('rejects malformed routes', async () => {
    const u = await createUser(db, 'Malformed');
    const start = hoursAgo(1);
    const good = straightRoute({ start, points: 10, speedMps: 3 });
    await expectError(submitActivity(db, u, { source: 'gps', route: [good[0]], startedAt: start }), /at least two GPS points/);
    const outOfRange = good.map((p) => [...p]);
    outOfRange[3][0] = 123;
    await expectError(submitActivity(db, u, { source: 'gps', route: outOfRange, startedAt: start }), /out of range/);
    const backwards = good.map((p) => [...p]);
    backwards[5][2] = backwards[2][2];
    await expectError(submitActivity(db, u, { source: 'gps', route: backwards, startedAt: start }), /chronological/);
    const outside = good.map((p) => [...p]);
    outside[9][2] = start.getTime() + 10 * 3600_000;
    await expectError(submitActivity(db, u, { source: 'gps', route: outside, startedAt: start, movingS: 60, elapsedS: 60 }), /outside the activity time window/);
  });

  test('published preview hides the start and finish and never exposes raw samples', async () => {
    const owner = await createUser(db, 'Owner');
    const friend = await createUser(db, 'Friend');
    await rpc(db, owner, 'send_friend_request', { p_user_id: friend });
    await rpc(db, friend, 'respond_friend_request', { p_user_id: owner, p_accept: true });
    const start = hoursAgo(1);
    const route = straightRoute({ start, points: 241, speedMps: 3 }); // ~3.6 km straight line
    const res = await submitActivity(db, owner, { source: 'gps', route, startedAt: start, movingS: 1200, visibility: 'friends' });

    const [seen] = await selectAs<{ route_preview: number[][] }>(db, friend, `select route_preview from public.activities where id = $1`, [res.activity_id]);
    assert.ok(seen.route_preview.length >= 2);
    const first = seen.route_preview[0];
    const last = seen.route_preview[seen.route_preview.length - 1];
    const metersFromStart = (first[0] - route[0][0]) * 111_195;
    const metersFromEnd = (route[route.length - 1][0] - last[0]) * 111_195;
    assert.ok(metersFromStart > 200, `start trimmed by ${metersFromStart} m`);
    assert.ok(metersFromEnd > 200, `end trimmed by ${metersFromEnd} m`);

    const friendRoutes = await selectAs(db, friend, `select * from public.activity_routes where activity_id = $1`, [res.activity_id]);
    assert.equal(friendRoutes.length, 0, 'raw route is owner-only');
    const ownerRoutes = await selectAs(db, owner, `select point_count from public.activity_routes where activity_id = $1`, [res.activity_id]);
    assert.equal(ownerRoutes.length, 1);
  });

  test('share_routes=false publishes no preview; route can be deleted later', async () => {
    const u = await createUser(db, 'Quiet');
    await db.query(`update public.user_settings set share_routes = false where user_id = $1`, [u]);
    const start = hoursAgo(1);
    const res = await submitActivity(db, u, { source: 'gps', route: straightRoute({ start, points: 50, speedMps: 3 }), startedAt: start, movingS: 245 });
    const row = await one<{ route_preview: unknown }>(db, `select route_preview from public.activities where id = $1`, [res.activity_id]);
    assert.equal(row.route_preview, null);
    await rpc(db, u, 'remove_activity_route', { p_activity_id: res.activity_id });
    const left = await one<{ n: number }>(db, `select count(*)::int as n from public.activity_routes where activity_id = $1`, [res.activity_id]);
    assert.equal(left.n, 0);
  });
});

describe('editing and deleting activities', () => {
  test('editing a manual activity recalculates stats and XP without duplicates', async () => {
    const u = await createUser(db, 'Editor');
    const res = await submitActivity(db, u, { distanceM: 4000, movingS: 1500 });
    await rpc(db, u, 'update_activity', { p_activity_id: res.activity_id, p_patch: { distance_m: 8000, moving_time_s: 2700, elapsed_time_s: 2700 } });
    const stats = await one<{ total_distance_m: string }>(db, `select total_distance_m from public.user_stats where user_id = $1`, [u]);
    assert.equal(Number(stats.total_distance_m), 8000);
    const xpRows = await one<{ n: number; amount: number }>(db, 
      `select count(*)::int as n, max(amount) as amount from public.experience_transactions where user_id = $1 and reason = 'activity'`, [u]);
    assert.equal(xpRows.n, 1);
    // 10 base + 6/km * 8 + 1 per 10 min * 4.5 = 62.5 -> 63
    assert.equal(xpRows.amount, 63);
  });

  test('GPS metrics cannot be edited, but title and visibility can', async () => {
    const u = await createUser(db, 'GpsEdit');
    const start = hoursAgo(1);
    const res = await submitActivity(db, u, { source: 'gps', route: straightRoute({ start, points: 50, speedMps: 3 }), startedAt: start, movingS: 245 });
    await expectError(
      rpc(db, u, 'update_activity', { p_activity_id: res.activity_id, p_patch: { distance_m: 50000 } }),
      /cannot be edited/,
    );
    const [updated] = await rpcRows<{ title: string; visibility: string }>(db, u, 'update_activity', {
      p_activity_id: res.activity_id, p_patch: JSON.stringify({ title: 'Sunrise loop', visibility: 'private' }),
    });
    assert.equal(updated.title, 'Sunrise loop');
    assert.equal(updated.visibility, 'private');
    await expectError(
      rpc(db, u, 'update_activity', { p_activity_id: res.activity_id, p_patch: { user_id: u } }),
      /cannot be edited/,
    );
  });

  test('users cannot edit or delete someone else’s activity', async () => {
    const owner = await createUser(db, 'Mine');
    const other = await createUser(db, 'Thief');
    const res = await submitActivity(db, owner, { visibility: 'public' });
    await expectError(rpc(db, other, 'update_activity', { p_activity_id: res.activity_id, p_patch: { title: 'pwned' } }), /Activity not found/);
    await expectError(rpc(db, other, 'delete_activity', { p_activity_id: res.activity_id }), /Activity not found/);
    const row = await one<{ title: string }>(db, `select title from public.activities where id = $1`, [res.activity_id]);
    assert.notEqual(row.title, 'pwned');
  });

  test('deleting an activity removes its XP and stats but keeps earned achievements', async () => {
    const u = await createUser(db, 'Deleter');
    const res = await submitActivity(db, u, { distanceM: 5000, movingS: 1800 });
    assert.ok(res.achievements.some((a) => a.id === 'first_5k'));
    await rpc(db, u, 'delete_activity', { p_activity_id: res.activity_id });
    const stats = await one<{ activity_count: number }>(db, `select activity_count from public.user_stats where user_id = $1`, [u]);
    assert.equal(stats.activity_count, 0);
    const xp = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and reason = 'activity'`, [u]);
    assert.equal(xp.n, 0);
    const ach = await one<{ n: number }>(db, `select count(*)::int as n from public.user_achievements where user_id = $1 and achievement_id = 'first_5k'`, [u]);
    assert.equal(ach.n, 1, 'achievement history is preserved');
  });
});

describe('statistics and records', () => {
  test('weekly buckets and personal records reflect eligible activities only', async () => {
    const u = await createUser(db, 'Stats');
    await submitActivity(db, u, { distanceM: 5000, movingS: 1800, startedAt: hoursAgo(30) });
    await submitActivity(db, u, { distanceM: 10000, movingS: 3300, startedAt: hoursAgo(5) });
    await submitActivity(db, u, { distanceM: 30000, movingS: 1800, startedAt: hoursAgo(3) }); // implausible
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const rows = await selectAs<{ distance_m: string; activity_count: number }>(
      db, u, `select * from public.get_activity_stats($1::date, $2::date, 'day')`, [weekAgo, today]);
    const total = rows.reduce((s, r) => s + Number(r.distance_m), 0);
    const count = rows.reduce((s, r) => s + r.activity_count, 0);
    assert.equal(total, 15000);
    assert.equal(count, 2);

    const [records] = await selectAs<{ r: { type: string; longest_distance: { value: number } }[] }>(
      db, u, `select public.get_personal_records() as r`);
    const run = records.r.find((r) => r.type === 'run');
    assert.equal(run?.longest_distance.value, 10000);
  });

  test('second activity reports a new distance record against the first', async () => {
    const u = await createUser(db, 'Records');
    await submitActivity(db, u, { distanceM: 5000, movingS: 1800, startedAt: hoursAgo(30) });
    const res = await submitActivity(db, u, { distanceM: 7000, movingS: 2400, startedAt: hoursAgo(2) });
    const kinds = res.personal_records.map((r) => r.kind);
    assert.ok(kinds.includes('longest_distance'));
    assert.ok(kinds.includes('longest_duration'));
  });
});
