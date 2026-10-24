// Row Level Security and privilege tests. Every query here runs as the `authenticated` role with a
// forged-but-valid JWT subject, i.e. what a malicious app user could send through PostgREST.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { type Db, asUser, createDb, createUser, expectError, insertChallenge, one, rpc, selectAs, submitActivity } from './harness.ts';

let db: Db;
let alice: string;
let bob: string; // Alice's friend
let eve: string; // stranger
let aliceActivities: Record<'public' | 'friends' | 'private', string>;

before(async () => {
  db = await createDb();
  alice = await createUser(db, 'Alice');
  bob = await createUser(db, 'Bob');
  eve = await createUser(db, 'Eve');
  await rpc(db, alice, 'send_friend_request', { p_user_id: bob });
  await rpc(db, bob, 'respond_friend_request', { p_user_id: alice, p_accept: true });
  aliceActivities = {
    public: (await submitActivity(db, alice, { visibility: 'public', distanceM: 5000 })).activity_id,
    friends: (await submitActivity(db, alice, { visibility: 'friends', distanceM: 6000 })).activity_id,
    private: (await submitActivity(db, alice, { visibility: 'private', distanceM: 7000 })).activity_id,
  };
});

async function visibleActivities(viewer: string): Promise<string[]> {
  const rows = await selectAs<{ id: string }>(db, viewer, `select id from public.activities where user_id = $1`, [alice]);
  return rows.map((r) => r.id).sort();
}

describe('activity privacy', () => {
  test('visibility levels are enforced for friends and strangers', async () => {
    assert.deepEqual(await visibleActivities(alice), Object.values(aliceActivities).sort());
    assert.deepEqual(await visibleActivities(bob), [aliceActivities.public, aliceActivities.friends].sort());
    assert.deepEqual(await visibleActivities(eve), [aliceActivities.public]);
  });

  test('profile visibility tightens activity visibility', async () => {
    await db.query(`update public.profiles set profile_visibility = 'friends' where id = $1`, [alice]);
    try {
      assert.deepEqual(await visibleActivities(eve), []);
      assert.deepEqual(await visibleActivities(bob), [aliceActivities.public, aliceActivities.friends].sort());
      const stats = await selectAs(db, eve, `select * from public.user_stats where user_id = $1`, [alice]);
      assert.equal(stats.length, 0, 'stats hidden from non-friends');
    } finally {
      await db.query(`update public.profiles set profile_visibility = 'public' where id = $1`, [alice]);
    }
  });

  test('feed and public profile respect privacy', async () => {
    const feed = await selectAs<{ kind: string; item_id: string }>(db, bob, `select kind, item_id from public.get_feed(null, 50)`);
    const ids = feed.filter((f) => f.kind === 'activity').map((f) => f.item_id);
    assert.ok(ids.includes(aliceActivities.friends));
    assert.ok(!ids.includes(aliceActivities.private));
    const eveFeed = await selectAs<{ item_id: string }>(db, eve, `select item_id from public.get_feed(null, 50)`);
    assert.ok(!eveFeed.some((f) => Object.values(aliceActivities).includes(f.item_id)), 'feed is friends-only');
  });

  test('reactions and comments require permission to view the activity', async () => {
    await expectError(rpc(db, eve, 'toggle_reaction', { p_activity_id: aliceActivities.friends }), /not found/);
    await expectError(rpc(db, eve, 'add_comment', { p_activity_id: aliceActivities.private, p_body: 'hi' }), /not found/);
    const r = await rpc<{ reacted: boolean; count: number }>(db, bob, 'toggle_reaction', { p_activity_id: aliceActivities.friends });
    assert.equal(r.reacted, true);
    const undo = await rpc<{ reacted: boolean; count: number }>(db, bob, 'toggle_reaction', { p_activity_id: aliceActivities.friends });
    assert.equal(undo.reacted, false);
    await rpc(db, eve, 'add_comment', { p_activity_id: aliceActivities.public, p_body: 'Nice pace!' });
    const comments = await selectAs(db, bob, `select * from public.activity_comments where activity_id = $1`, [aliceActivities.public]);
    assert.equal(comments.length, 1);
  });
});

describe('write protection', () => {
  test('direct table writes are rejected for everything except own profile/settings columns', async () => {
    const attempts: [string, unknown[]][] = [
      [`insert into public.activities (user_id, client_id, type, source, title, visibility, started_at, ended_at, local_date, moving_time_s, elapsed_time_s) values ($1, gen_random_uuid(), 'run', 'manual', 'x', 'public', now(), now(), current_date, 60, 60)`, [eve]],
      [`update public.activities set distance_m = 1 where id = $1`, [aliceActivities.public]],
      [`delete from public.activities where id = $1`, [aliceActivities.public]],
      [`insert into public.user_achievements (user_id, achievement_id) values ($1, 'explorer_1000k')`, [eve]],
      [`insert into public.experience_transactions (user_id, amount, reason, source_key) values ($1, 10000, 'achievement', 'cheat')`, [eve]],
      [`update public.user_xp set xp_total = 999999 where user_id = $1`, [eve]],
      [`update public.user_stats set total_distance_m = 99999999 where user_id = $1`, [eve]],
      [`insert into public.user_unlocked_themes (user_id, theme_id, source) values ($1, 'mythic', 'cheat')`, [eve]],
      [`update public.challenges set total_progress = 99999999`, []],
      [`update public.challenge_participants set progress_value = 99999999 where user_id = $1`, [eve]],
      [`insert into public.challenge_contributions (challenge_id, user_id, value, activity_started_at) select id, $1, 999999, now() from public.challenges limit 1`, [eve]],
      [`insert into public.challenge_participants (challenge_id, user_id) select id, $1 from public.challenges limit 1`, [eve]],
      [`insert into public.friendships (user_low, user_high, requested_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'accepted')`, [eve, alice]],
      [`insert into public.notifications (user_id, type, title, body) values ($1, 'level_up', 'spam', 'spam')`, [alice]],
      [`update public.profiles set display_name = 'hacked' where id = $1`, [alice]],
      [`update public.journeys set total_distance_m = 1`, []],
      [`update public.themes set unlock_rule = '{"type":"default"}'`, []],
    ];
    for (const [sql, params] of attempts) {
      let changed = 0;
      try {
        changed = await asUser(db, eve, async (tx) => (await tx.query(sql, params)).affectedRows ?? 0);
      } catch (error) {
        assert.match((error as Error).message, /permission denied|violates row-level security/, sql);
        continue;
      }
      assert.equal(changed, 0, `statement unexpectedly changed rows: ${sql}`);
    }
    const name = await one<{ display_name: string }>(db, `select display_name from public.profiles where id = $1`, [alice]);
    assert.notEqual(name.display_name, 'hacked');
  });

  test('users can update their own allowed profile columns but not privileged ones', async () => {
    await asUser(db, eve, (tx) => tx.query(`update public.profiles set bio = 'Runner from Tbilisi' where id = $1`, [eve]));
    assert.equal((await one<{ bio: string }>(db, `select bio from public.profiles where id = $1`, [eve])).bio, 'Runner from Tbilisi');
    await expectError(asUser(db, eve, (tx) => tx.query(`update public.profiles set created_at = now() - interval '10 years' where id = $1`, [eve])), /permission denied/);
    await expectError(asUser(db, eve, (tx) => tx.query(`update public.profiles set id = gen_random_uuid() where id = $1`, [eve])), /permission denied/);
  });

  test('users can complete onboarding and change their own settings through the API', async () => {
    const u = await createUser(db, 'Settler');
    await asUser(db, u, async (tx) => {
      await tx.query(`update public.user_settings set measurement_system = 'imperial', timezone = 'Asia/Tbilisi', default_activity_visibility = 'private', hide_route_endpoints = false where user_id = $1`, [u]);
      await tx.query(`update public.profiles set display_name = 'Settler Prime', username = 'settler_prime', onboarding_completed_at = now(), preferred_activity_types = '{run,hike}' where id = $1`, [u]);
    });
    const s = await one<{ measurement_system: string; timezone: string }>(db, `select measurement_system, timezone from public.user_settings where user_id = $1`, [u]);
    assert.deepEqual(s, { measurement_system: 'imperial', timezone: 'Asia/Tbilisi' });
    await expectError(
      asUser(db, u, (tx) => tx.query(`update public.user_settings set timezone = 'Not/AZone' where user_id = $1`, [u])),
      /Unknown time zone/,
    );
    const other = await createUser(db, 'OtherSettler');
    const changed = await asUser(db, u, async (tx) => (await tx.query(`update public.user_settings set measurement_system = 'imperial' where user_id = $1`, [other])).affectedRows ?? 0);
    assert.equal(changed, 0, 'cannot touch someone else’s settings');
  });

  test('equipping a locked theme through a direct update is rejected by the database', async () => {
    await expectError(
      asUser(db, eve, (tx) => tx.query(`update public.profiles set equipped_theme_id = 'mythic' where id = $1`, [eve])),
      /violates foreign key constraint/,
    );
  });

  test('internal engine functions are not callable by app users', async () => {
    await expectError(
      asUser(db, eve, (tx) => tx.query(`select app_private.award_xp($1, 5000, 'achievement', 'cheat')`, [eve])),
      /permission denied/,
    );
    await expectError(
      asUser(db, eve, (tx) => tx.query(`select app_private.unlock_theme($1, 'mythic', 'cheat')`, [eve])),
      /permission denied/,
    );
    await expectError(
      asUser(db, eve, (tx) => tx.query(`select app_private.finalize_challenge(gen_random_uuid())`)),
      /permission denied/,
    );
  });

  test('anonymous callers can read nothing and call nothing', async () => {
    await expectError(asUser(db, null, (tx) => tx.query(`select * from public.profiles`)), /permission denied/);
    await expectError(asUser(db, null, (tx) => tx.query(`select * from public.challenges`)), /permission denied/);
    await expectError(asUser(db, null, (tx) => tx.query(`select public.refresh_challenges()`)), /permission denied/);
  });

  test('private settings, routes, contributions and XP ledgers are owner-only', async () => {
    for (const table of ['user_settings', 'activity_routes', 'challenge_contributions', 'experience_transactions', 'notifications', 'activity_processing', 'user_unlocked_themes']) {
      const rows = await selectAs(db, eve, `select * from public.${table} where user_id = $1`, [alice]);
      assert.equal(rows.length, 0, `${table} leaked`);
    }
  });
});

describe('score and reward manipulation', () => {
  test('client-claimed GPS distance is ignored in favour of the route', async () => {
    const u = await createUser(db, 'Liar');
    const start = new Date(Date.now() - 3600_000);
    const route = [0, 1, 2, 3].map((i) => [41.7 + i * 0.0001, 44.8, start.getTime() + i * 10_000, null, 5, 0]);
    const res = await submitActivity(db, u, { source: 'gps', route, startedAt: start, movingS: 40, elapsedS: 40, distanceM: 42195 });
    assert.ok(res.distance_m < 40, `server distance ${res.distance_m}`);
  });

  test('cannot contribute to challenges you have not joined or with ineligible activities', async () => {
    const u = await createUser(db, 'Sneaky');
    const c = await insertChallenge(db, { target_value: 5000 });
    const res = await submitActivity(db, u, { distanceM: 6000 });
    assert.equal(res.challenges.length, 0);
    const p = await selectAs(db, u, `select * from public.challenge_participants where challenge_id = $1 and user_id = $2`, [c, u]);
    assert.equal(p.length, 0);
  });

  test('a user cannot submit activities on behalf of someone else', async () => {
    // The RPC derives the owner from the JWT; there is no user parameter to forge.
    const res = await submitActivity(db, eve, { distanceM: 1000, movingS: 600 });
    const owner = await one<{ user_id: string }>(db, `select user_id from public.activities where id = $1`, [res.activity_id]);
    assert.equal(owner.user_id, eve);
  });

  test('blocking hides profiles both ways and prevents interaction', async () => {
    const [x, y] = await Promise.all(['BlockX', 'BlockY'].map((n) => createUser(db, n)));
    const act = await submitActivity(db, y, { visibility: 'public' });
    await rpc(db, x, 'block_user', { p_user_id: y });
    assert.equal((await selectAs(db, y, `select id from public.profiles where id = $1`, [x])).length, 0);
    assert.equal((await selectAs(db, x, `select id from public.activities where id = $1`, [act.activity_id])).length, 0);
    await expectError(rpc(db, y, 'send_friend_request', { p_user_id: x }), /not found/);
    await expectError(rpc(db, y, 'get_public_profile', { p_user_id: x }), /not found/);
    const search = await selectAs<{ id: string }>(db, y, `select id from public.search_profiles($1, 20)`, ['blockx']);
    assert.equal(search.length, 0);
    await rpc(db, x, 'unblock_user', { p_user_id: y });
    assert.equal((await selectAs(db, y, `select id from public.profiles where id = $1`, [x])).length, 1);
  });

  test('private profiles are excluded from search but still appear by name in shared contexts', async () => {
    const hidden = await createUser(db, 'Hermit');
    await db.query(`update public.profiles set profile_visibility = 'private' where id = $1`, [hidden]);
    const rows = await selectAs<{ id: string }>(db, eve, `select id from public.search_profiles($1, 20)`, ['hermit']);
    assert.equal(rows.length, 0);
    const profile = await rpc<{ can_view_details: boolean; stats: unknown }>(db, eve, 'get_public_profile', { p_user_id: hidden });
    assert.equal(profile.can_view_details, false);
    assert.equal(profile.stats, null);
  });
});

describe('account deletion', () => {
  test('deleting an account removes the user’s data and keeps shared totals consistent', async () => {
    const [stay, leave] = await Promise.all(['Stayer', 'Leaver'].map((n) => createUser(db, n)));
    const c = await insertChallenge(db, { mode: 'collaborative', target_value: 1_000_000 });
    for (const u of [stay, leave]) await rpc(db, u, 'join_challenge', { p_challenge_id: c, p_team_id: null, p_invite_code: null });
    await submitActivity(db, stay, { distanceM: 3000 });
    await submitActivity(db, leave, { distanceM: 4000 });
    await rpc(db, leave, 'delete_my_account');
    const gone = await one<{ p: number; a: number; u: number }>(db, `
      select (select count(*)::int from public.profiles where id = $1) as p,
             (select count(*)::int from public.activities where user_id = $1) as a,
             (select count(*)::int from auth.users where id = $1) as u`, [leave]);
    assert.deepEqual(gone, { p: 0, a: 0, u: 0 });
    const ch = await one<{ total_progress: string; participant_count: number }>(db, `select total_progress, participant_count from public.challenges where id = $1`, [c]);
    assert.equal(Number(ch.total_progress), 3000);
    assert.equal(ch.participant_count, 1);
  });
});
