import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { type Db, createDb, createUser, expectError, hoursAgo, one, rpc, selectAs, submitActivity } from './harness.ts';

let db: Db;
before(async () => {
  db = await createDb();
  // A small journey so tests can reach every checkpoint quickly.
  await db.exec(`
    insert into public.journeys (slug, title, subtitle, description, art_key, total_distance_m, activity_types, map_path, completion_xp, reward_theme_id)
    values ('test-trail', 'Test Trail', 'Short', 'A short test journey', 'ashen', 10000, '{run,walk}', '[[0,0],[1,1]]', 300, 'alpenglow');
    insert into public.journey_checkpoints (journey_id, position, name, description, distance_m, xp_reward)
    select id, p.pos, p.name, p.name, p.d, 40 from public.journeys j,
      (values (0, 'Start', 0), (1, 'Bridge', 3000), (2, 'Ridge', 6000), (3, 'Summit', 10000)) as p(pos, name, d)
    where j.slug = 'test-trail';
  `);
});

async function journeyId(slug = 'test-trail'): Promise<string> {
  return (await one<{ id: string }>(db, `select id from public.journeys where slug = $1`, [slug])).id;
}

async function expedition(id: string) {
  return one<{ progress_m: string; status: string; completed_at: string | null; invite_code: string | null }>(
    db, `select progress_m, status, completed_at, invite_code from public.journey_expeditions where id = $1`, [id]);
}

async function unlockedNames(expeditionId: string): Promise<string[]> {
  const rows = await selectAs<{ name: string }>(db, null, `select 1`); // warm-up no-op
  void rows;
  const { rows: names } = await db.query<{ name: string }>(
    `select c.name from public.expedition_checkpoint_unlocks u join public.journey_checkpoints c on c.id = u.checkpoint_id where u.expedition_id = $1 order by c.position`,
    [expeditionId]);
  return names.map((n) => n.name);
}

describe('solo journeys', () => {
  test('progress moves the marker, unlocks checkpoints in order and completes the journey', async () => {
    const u = await createUser(db, 'Walker');
    const exp = await rpc<string>(db, u, 'start_expedition', { p_journey_id: await journeyId(), p_mode: 'solo', p_name: null });
    assert.deepEqual(await unlockedNames(exp), ['Start']);
    // The member joined just now; activities must start after joining.
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [exp]);

    const r1 = await submitActivity(db, u, { distanceM: 5000, movingS: 1800, startedAt: hoursAgo(20) });
    assert.equal(r1.journeys.length, 1);
    assert.deepEqual(r1.journeys[0].checkpoints, ['Bridge']);
    assert.equal(Number((await expedition(exp)).progress_m), 5000);

    const r2 = await submitActivity(db, u, { distanceM: 6000, movingS: 2200, startedAt: hoursAgo(10) });
    assert.deepEqual(r2.journeys[0].checkpoints, ['Ridge', 'Summit']);
    assert.equal(r2.journeys[0].completed_now, true);
    const e = await expedition(exp);
    assert.equal(e.status, 'completed');
    assert.deepEqual(await unlockedNames(exp), ['Start', 'Bridge', 'Ridge', 'Summit']);

    const xp = await one<{ n: number; total: string }>(db,
      `select count(*)::int as n, sum(amount) as total from public.experience_transactions where user_id = $1 and reason in ('journey_checkpoint', 'journey_completed')`, [u]);
    assert.equal(xp.n, 4, 'three checkpoints and completion');
    assert.equal(Number(xp.total), 40 * 3 + 300);
    const theme = await one<{ n: number }>(db, `select count(*)::int as n from public.user_unlocked_themes where user_id = $1 and theme_id = 'alpenglow'`, [u]);
    assert.equal(theme.n, 1, 'completion theme granted');
    const ach = await one<{ n: number }>(db, `select count(*)::int as n from public.user_achievements where user_id = $1 and achievement_id = 'epic_journey'`, [u]);
    assert.equal(ach.n, 1);

    // After completion new activities no longer contribute to the finished expedition.
    const r3 = await submitActivity(db, u, { distanceM: 3000, movingS: 1200, startedAt: hoursAgo(2) });
    assert.equal(r3.journeys.length, 0);
  });

  test('ineligible types, implausible activities and activities before joining do not count', async () => {
    const u = await createUser(db, 'Rider');
    const exp = await rpc<string>(db, u, 'start_expedition', { p_journey_id: await journeyId(), p_mode: 'solo', p_name: null });
    const before = await submitActivity(db, u, { distanceM: 2000, startedAt: hoursAgo(3) });
    assert.equal(before.journeys.length, 0, 'started before joining');
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [exp]);
    const ride = await submitActivity(db, u, { type: 'ride', distanceM: 9000, movingS: 1800, startedAt: hoursAgo(5) });
    assert.equal(ride.journeys.length, 0, 'rides are not eligible for this journey');
    const fake = await submitActivity(db, u, { distanceM: 9000, movingS: 600, startedAt: hoursAgo(4) });
    assert.equal(fake.journeys.length, 0, 'implausible speed');
    assert.equal(Number((await expedition(exp)).progress_m), 0);
  });

  test('an activity is never counted twice and edits re-count it once', async () => {
    const u = await createUser(db, 'Twice');
    const exp = await rpc<string>(db, u, 'start_expedition', { p_journey_id: await journeyId(), p_mode: 'solo', p_name: null });
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [exp]);
    const res = await submitActivity(db, u, { distanceM: 2000, movingS: 900, startedAt: hoursAgo(5) });
    await db.query(`select app_private.process_activity($1)`, [res.activity_id]);
    await db.query(`select app_private.process_activity_journeys($1, $2)`, [res.activity_id, u]);
    assert.equal(Number((await expedition(exp)).progress_m), 2000);
    await rpc(db, u, 'update_activity', { p_activity_id: res.activity_id, p_patch: { distance_m: 2500 } });
    assert.equal(Number((await expedition(exp)).progress_m), 2500);
    const contributions = await one<{ n: number }>(db, `select count(*)::int as n from public.journey_contributions where expedition_id = $1`, [exp]);
    assert.equal(contributions.n, 1);
  });

  test('one active expedition per journey; replay is allowed after completion', async () => {
    const u = await createUser(db, 'Replay');
    const jid = await journeyId();
    const first = await rpc<string>(db, u, 'start_expedition', { p_journey_id: jid, p_mode: 'solo', p_name: null });
    await expectError(rpc(db, u, 'start_expedition', { p_journey_id: jid, p_mode: 'solo', p_name: null }), /already on this journey/);
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [first]);
    await submitActivity(db, u, { distanceM: 10000, movingS: 3600, startedAt: hoursAgo(5) });
    assert.equal((await expedition(first)).status, 'completed');
    const second = await rpc<string>(db, u, 'start_expedition', { p_journey_id: jid, p_mode: 'solo', p_name: null });
    assert.notEqual(second, first);
    const history = await selectAs<{ status: string }>(db, u,
      `select e.status from public.journey_expeditions e join public.journey_expedition_members m on m.expedition_id = e.id where m.user_id = $1 order by e.created_at`, [u]);
    assert.deepEqual(history.map((h) => h.status), ['completed', 'active']);
  });

  test('solo-only modes are enforced', async () => {
    const u = await createUser(db, 'Solo');
    const lantern = await journeyId('sky-lantern');
    await expectError(rpc(db, u, 'start_expedition', { p_journey_id: lantern, p_mode: 'solo', p_name: null }), /does not support that mode/);
  });
});

describe('group journeys', () => {
  test('members share one marker; personal contribution is tracked separately', async () => {
    const [leader, friend, stranger] = await Promise.all(['Leader', 'Mate', 'Nobody'].map((n) => createUser(db, n)));
    await rpc(db, leader, 'send_friend_request', { p_user_id: friend });
    await rpc(db, friend, 'respond_friend_request', { p_user_id: leader, p_accept: true });
    const exp = await rpc<string>(db, leader, 'start_expedition', { p_journey_id: await journeyId(), p_mode: 'group', p_name: 'The Fellowship of Ten Km' });
    const { invite_code } = await expedition(exp);
    assert.ok(invite_code);

    await expectError(rpc(db, stranger, 'join_expedition', { p_expedition_id: exp, p_code: null }), /invitation or invite code/);
    assert.equal((await selectAs(db, stranger, `select id from public.journey_expeditions where id = $1`, [exp])).length, 0, 'not visible to outsiders');

    const invited = await rpc<number>(db, leader, 'invite_to_expedition', { p_expedition_id: exp, p_user_ids: [friend, stranger] });
    assert.equal(invited, 1);
    await rpc(db, friend, 'join_expedition', { p_expedition_id: exp, p_code: null });
    await rpc(db, stranger, 'join_expedition', { p_expedition_id: null, p_code: invite_code });
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [exp]);

    await submitActivity(db, leader, { distanceM: 4000, movingS: 1500, startedAt: hoursAgo(9) });
    await submitActivity(db, friend, { distanceM: 3500, movingS: 1400, startedAt: hoursAgo(8) });
    const members = await selectAs<{ user_id: string; contributed_m: string }>(db, friend,
      `select user_id, contributed_m from public.journey_expedition_members where expedition_id = $1 order by contributed_m desc`, [exp]);
    assert.equal(members.length, 3);
    assert.equal(Number(members[0].contributed_m), 4000);
    assert.equal(Number(members[1].contributed_m), 3500);
    assert.equal(Number((await expedition(exp)).progress_m), 7500);
    // Bridge was reached by the leader's run; everyone active got the checkpoint reward.
    for (const u of [leader, friend, stranger]) {
      const xp = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and reason = 'journey_checkpoint'`, [u]);
      assert.equal(xp.n, 2, 'Bridge and Ridge');
    }
  });

  test('leaving keeps contributed distance with the party; last one out abandons it', async () => {
    const [a, b] = await Promise.all(['PartyA', 'PartyB'].map((n) => createUser(db, n)));
    const exp = await rpc<string>(db, a, 'start_expedition', { p_journey_id: await journeyId(), p_mode: 'group', p_name: null });
    const { invite_code } = await expedition(exp);
    await rpc(db, b, 'join_expedition', { p_expedition_id: null, p_code: invite_code });
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [exp]);
    await submitActivity(db, b, { distanceM: 2000, movingS: 900, startedAt: hoursAgo(3) });
    await rpc(db, b, 'leave_expedition', { p_expedition_id: exp });
    assert.equal(Number((await expedition(exp)).progress_m), 2000);
    const after = await submitActivity(db, b, { distanceM: 1000, movingS: 500, startedAt: hoursAgo(1) });
    assert.equal(after.journeys.length, 0, 'left members stop contributing');
    await rpc(db, a, 'leave_expedition', { p_expedition_id: exp });
    assert.equal((await expedition(exp)).status, 'abandoned');
  });

  test('group completion rewards every active member exactly once', async () => {
    const [a, b] = await Promise.all(['DoneA', 'DoneB'].map((n) => createUser(db, n)));
    const exp = await rpc<string>(db, a, 'start_expedition', { p_journey_id: await journeyId(), p_mode: 'group', p_name: null });
    const { invite_code } = await expedition(exp);
    await rpc(db, b, 'join_expedition', { p_expedition_id: null, p_code: invite_code });
    await db.query(`update public.journey_expedition_members set joined_at = now() - interval '1 day' where expedition_id = $1`, [exp]);
    await submitActivity(db, a, { distanceM: 6000, movingS: 2200, startedAt: hoursAgo(6) });
    await submitActivity(db, b, { distanceM: 4500, movingS: 1800, startedAt: hoursAgo(5) });
    assert.equal((await expedition(exp)).status, 'completed');
    for (const u of [a, b]) {
      const done = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and reason = 'journey_completed'`, [u]);
      assert.equal(done.n, 1);
      const ach = await one<{ n: number }>(db, `select count(*)::int as n from public.user_achievements where user_id = $1 and achievement_id = 'epic_journey'`, [u]);
      assert.equal(ach.n, 1);
    }
  });
});

describe('journey content integrity', () => {
  test('every published journey starts at 0 and ends exactly at its total distance', async () => {
    const { rows } = await db.query<{ slug: string; total_distance_m: string; first_d: string; last_d: string; n: number; paths: number }>(`
      select j.slug, j.total_distance_m,
             min(c.distance_m) as first_d, max(c.distance_m) as last_d, count(c.*)::int as n,
             jsonb_array_length(j.map_path) as paths
      from public.journeys j join public.journey_checkpoints c on c.journey_id = j.id
      group by j.id`);
    assert.ok(rows.length >= 6);
    for (const r of rows) {
      assert.equal(Number(r.first_d), 0, `${r.slug} starts at 0`);
      assert.equal(Number(r.last_d), Number(r.total_distance_m), `${r.slug} final checkpoint`);
      assert.ok(r.n >= 4, `${r.slug} has checkpoints`);
      assert.ok(r.paths >= 2, `${r.slug} has a map path`);
    }
  });
});
