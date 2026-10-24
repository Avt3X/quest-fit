import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import {
  type Db,
  createDb,
  createUser,
  expectError,
  hoursAgo,
  insertChallenge,
  one,
  rpc,
  rpcRows,
  selectAs,
  submitActivity,
} from './harness.ts';

let db: Db;
before(async () => {
  db = await createDb();
});

const DAY = 86400_000;
const days = (n: number) => new Date(Date.now() + n * DAY).toISOString();

async function join(userId: string, challengeId: string, teamId: string | null = null) {
  return rpc(db, userId, 'join_challenge', { p_challenge_id: challengeId, p_team_id: teamId, p_invite_code: null });
}

async function participant(challengeId: string, userId: string) {
  return one<{ progress_value: string; contribution_count: number; completed_at: string | null; team_id: string | null }>(
    db,
    `select progress_value, contribution_count, completed_at, team_id from public.challenge_participants where challenge_id = $1 and user_id = $2`,
    [challengeId, userId],
  );
}

async function challenge(challengeId: string) {
  return one<{ total_progress: string; participant_count: number; goal_reached_at: string | null; finalized_at: string | null }>(
    db, `select total_progress, participant_count, goal_reached_at, finalized_at from public.challenges where id = $1`, [challengeId]);
}

describe('individual challenges', () => {
  test('eligible distance counts toward the personal goal and completes it once', async () => {
    const u = await createUser(db, 'Indy');
    const c = await insertChallenge(db, { target_value: 10000, xp_reward: 100 });
    await join(u, c);
    const r1 = await submitActivity(db, u, { distanceM: 6000, movingS: 2000, startedAt: hoursAgo(10) });
    assert.equal(r1.challenges.length, 1);
    assert.equal(r1.challenges[0].completed_now, false);
    const r2 = await submitActivity(db, u, { distanceM: 5000, movingS: 1800, startedAt: hoursAgo(5) });
    assert.equal(r2.challenges[0].completed_now, true);
    assert.equal(Number(r2.challenges[0].progress_value), 11000);
    const r3 = await submitActivity(db, u, { distanceM: 5000, movingS: 1800, startedAt: hoursAgo(2) });
    assert.equal(r3.challenges[0].completed_now, false, 'completion is reported only once');
    const xp = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and source_key = $2`, [u, `challenge:${c}`]);
    assert.equal(xp.n, 1);
    const halfway = await one<{ n: number }>(db, `select count(*)::int as n from public.notifications where user_id = $1 and type = 'challenge_milestone'`, [u]);
    assert.equal(halfway.n, 1);
  });

  test('wrong activity type and manual entries (when disallowed) do not count', async () => {
    const u = await createUser(db, 'Picky');
    const c = await insertChallenge(db, { activity_types: '{ride}', allow_manual: false });
    await join(u, c);
    const run = await submitActivity(db, u, { type: 'run', distanceM: 5000 });
    assert.equal(run.challenges.length, 0);
    const manualRide = await submitActivity(db, u, { type: 'ride', distanceM: 20000, movingS: 3600 });
    assert.equal(manualRide.challenges.length, 0);
  });

  test('duration and count metrics use moving time and activity count', async () => {
    const u = await createUser(db, 'Metrics');
    const dur = await insertChallenge(db, { metric: 'duration', target_value: 3600, activity_types: '{run,workout}' });
    const cnt = await insertChallenge(db, { metric: 'count', target_value: 2, activity_types: '{run,workout}' });
    await join(u, dur);
    await join(u, cnt);
    await submitActivity(db, u, { type: 'workout', distanceM: 0, movingS: 2400, startedAt: hoursAgo(6) });
    await submitActivity(db, u, { type: 'run', distanceM: 4000, movingS: 1500, startedAt: hoursAgo(3) });
    assert.equal(Number((await participant(dur, u)).progress_value), 3900);
    assert.equal(Number((await participant(cnt, u)).progress_value), 2);
    assert.notEqual((await participant(cnt, u)).completed_at, null);
  });

  test('ineligible activities never contribute', async () => {
    const u = await createUser(db, 'Cheater');
    const c = await insertChallenge(db, {});
    await join(u, c);
    const res = await submitActivity(db, u, { distanceM: 50000, movingS: 1800 });
    assert.equal(res.is_eligible, false);
    assert.equal(res.challenges.length, 0);
  });
});

describe('challenge time windows', () => {
  test('activities count by start time: inside the window counts, before or after does not', async () => {
    const u = await createUser(db, 'Window');
    const c = await insertChallenge(db, { starts_at: hoursAgo(48).toISOString(), ends_at: hoursAgo(12).toISOString(), target_value: 100000 });
    await db.query(`insert into public.challenge_participants (challenge_id, user_id, joined_at) values ($1, $2, now() - interval '3 days')`, [c, u]);
    const before = await submitActivity(db, u, { startedAt: hoursAgo(49), movingS: 1800 });
    // Starts inside the window, finishes after it ends: the whole activity counts.
    const crossing = await submitActivity(db, u, { startedAt: hoursAgo(12.25), movingS: 1800, distanceM: 4000 });
    const after = await submitActivity(db, u, { startedAt: hoursAgo(11), movingS: 1800 });
    assert.equal(before.challenges.length, 0);
    assert.equal(crossing.challenges.length, 1);
    assert.equal(crossing.challenges[0].value, 4000);
    assert.equal(after.challenges.length, 0);
  });

  test('late submissions are accepted within the grace period and rejected after it', async () => {
    const u = await createUser(db, 'Late');
    const graceOpen = await insertChallenge(db, { starts_at: hoursAgo(96).toISOString(), ends_at: hoursAgo(24).toISOString(), submission_grace_hours: 72 });
    const graceClosed = await insertChallenge(db, { starts_at: hoursAgo(96).toISOString(), ends_at: hoursAgo(24).toISOString(), submission_grace_hours: 12 });
    for (const c of [graceOpen, graceClosed]) {
      await db.query(`insert into public.challenge_participants (challenge_id, user_id, joined_at) values ($1, $2, now() - interval '5 days')`, [c, u]);
    }
    const res = await submitActivity(db, u, { startedAt: hoursAgo(48) });
    const ids = res.challenges.map((x) => x.challenge_id);
    assert.ok(ids.includes(graceOpen));
    assert.ok(!ids.includes(graceClosed));
  });

  test('joining after the start backfills retroactive challenges only', async () => {
    const u = await createUser(db, 'Latecomer');
    await submitActivity(db, u, { distanceM: 3000, movingS: 1200, startedAt: hoursAgo(30) });
    await submitActivity(db, u, { distanceM: 2000, movingS: 900, startedAt: hoursAgo(200) }); // before start
    const retro = await insertChallenge(db, { starts_at: hoursAgo(72).toISOString(), retroactive: true });
    const strict = await insertChallenge(db, { starts_at: hoursAgo(72).toISOString(), retroactive: false });
    await join(u, retro);
    await join(u, strict);
    assert.equal(Number((await participant(retro, u)).progress_value), 3000);
    assert.equal(Number((await participant(strict, u)).progress_value), 0);
    // Pretend the join happened an hour ago, then record something that started after joining.
    await db.query(`update public.challenge_participants set joined_at = now() - interval '1 hour' where challenge_id = $1 and user_id = $2`, [strict, u]);
    await submitActivity(db, u, { distanceM: 1000, movingS: 400, startedAt: new Date(Date.now() - 60_000 * 15) });
    assert.equal(Number((await participant(strict, u)).progress_value), 1000);
    await submitActivity(db, u, { distanceM: 1500, movingS: 600, startedAt: new Date(Date.now() - 60_000 * 90) });
    assert.equal(Number((await participant(strict, u)).progress_value), 1000, 'started before joining');
  });

  test('cannot join ended challenges, after the deadline, or when full', async () => {
    const u = await createUser(db, 'Blocked');
    const v = await createUser(db, 'Second');
    const ended = await insertChallenge(db, { starts_at: hoursAgo(72).toISOString(), ends_at: hoursAgo(1).toISOString() });
    await expectError(join(u, ended), /already ended/);
    const deadline = await insertChallenge(db, { join_deadline: hoursAgo(1).toISOString() });
    await expectError(join(u, deadline), /deadline/);
    const full = await insertChallenge(db, { max_participants: 2 });
    await join(u, full);
    await join(v, full);
    const w = await createUser(db, 'Third');
    await expectError(join(w, full), /full/);
  });

  test('joining twice is idempotent', async () => {
    const u = await createUser(db, 'Twice');
    const c = await insertChallenge(db, {});
    await join(u, c);
    await join(u, c);
    assert.equal((await challenge(c)).participant_count, 1);
  });
});

describe('duplicate and repeated processing', () => {
  test('an activity never contributes twice to the same challenge', async () => {
    const u = await createUser(db, 'Once');
    const c = await insertChallenge(db, { target_value: 100000 });
    await join(u, c);
    const res = await submitActivity(db, u, { distanceM: 5000 });
    // Re-run the pipeline and backfill directly, as a retry or a bug might.
    await db.query(`select app_private.process_activity($1)`, [res.activity_id]);
    await db.query(`select app_private.backfill_challenge($1, $2)`, [c, u]);
    await db.query(`select app_private.contribute_to_challenge($1, $2, $3)`, [c, res.activity_id, u]);
    const p = await participant(c, u);
    assert.equal(Number(p.progress_value), 5000);
    assert.equal(p.contribution_count, 1);
    assert.equal(Number((await challenge(c)).total_progress), 5000);
  });

  test('editing an activity re-counts it once with the new value', async () => {
    const u = await createUser(db, 'Recount');
    const c = await insertChallenge(db, { target_value: 100000 });
    await join(u, c);
    const res = await submitActivity(db, u, { distanceM: 5000, movingS: 1800 });
    await rpc(db, u, 'update_activity', { p_activity_id: res.activity_id, p_patch: { distance_m: 7000 } });
    const p = await participant(c, u);
    assert.equal(Number(p.progress_value), 7000);
    assert.equal(p.contribution_count, 1);
    await rpc(db, u, 'update_activity', { p_activity_id: res.activity_id, p_patch: { type: 'ride' } });
    // Rides are eligible in the default fixture, so it still counts exactly once.
    assert.equal((await participant(c, u)).contribution_count, 1);
    await rpc(db, u, 'delete_activity', { p_activity_id: res.activity_id });
    assert.equal(Number((await participant(c, u)).progress_value), 0);
    assert.equal(Number((await challenge(c)).total_progress), 0);
  });

  test('aggregates always equal the sum of the contribution ledger', async () => {
    const users = await Promise.all(['Agg1', 'Agg2', 'Agg3'].map((n) => createUser(db, n)));
    const c = await insertChallenge(db, { mode: 'collaborative', target_value: 1_000_000 });
    for (const u of users) await join(u, c);
    for (let i = 0; i < 9; i += 1) {
      await submitActivity(db, users[i % 3], { distanceM: 1000 + i * 137, movingS: 900, startedAt: hoursAgo(20 - i) });
    }
    const check = await one<{ total: string; ledger: string; parts: string }>(db, `
      select c.total_progress as total,
             (select sum(value) from public.challenge_contributions where challenge_id = c.id) as ledger,
             (select sum(progress_value) from public.challenge_participants where challenge_id = c.id) as parts
      from public.challenges c where c.id = $1`, [c]);
    assert.equal(Number(check.total), Number(check.ledger));
    assert.equal(Number(check.total), Number(check.parts));
  });
});

describe('collaborative challenges', () => {
  test('all participants contribute to one goal and every contributor completes it', async () => {
    const [a, b, lurker] = await Promise.all(['CollabA', 'CollabB', 'Lurker'].map((n) => createUser(db, n)));
    const c = await insertChallenge(db, { mode: 'collaborative', target_value: 10000, xp_reward: 80 });
    await join(a, c);
    await join(b, c);
    await join(lurker, c);
    await submitActivity(db, a, { distanceM: 6000, movingS: 2200 });
    const res = await submitActivity(db, b, { distanceM: 4500, movingS: 1800 });
    assert.equal(res.challenges[0].completed_now, true);
    assert.equal(Number(res.challenges[0].progress_value), 10500);
    assert.notEqual((await challenge(c)).goal_reached_at, null);
    assert.notEqual((await participant(c, a)).completed_at, null, 'earlier contributor completes too');
    assert.equal((await participant(c, lurker)).completed_at, null, 'non-contributors do not complete');
    const aXp = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where user_id = $1 and source_key = $2`, [a, `challenge:${c}`]);
    assert.equal(aXp.n, 1);
    const teamPlayer = await one<{ n: number }>(db, `select count(*)::int as n from public.user_achievements where user_id = $1 and achievement_id = 'team_player'`, [a]);
    assert.equal(teamPlayer.n, 1, 'other contributors are evaluated for achievements');
    // A later first contribution after the goal was reached also completes.
    await submitActivity(db, lurker, { distanceM: 1000, movingS: 500 });
    assert.notEqual((await participant(c, lurker)).completed_at, null);
  });

  test('leaving withdraws contributions but a reached goal stays reached', async () => {
    const [a, b] = await Promise.all(['LeaveA', 'LeaveB'].map((n) => createUser(db, n)));
    const c = await insertChallenge(db, { mode: 'collaborative', target_value: 8000 });
    await join(a, c);
    await join(b, c);
    await submitActivity(db, a, { distanceM: 5000 });
    await submitActivity(db, b, { distanceM: 4000 });
    await rpc(db, b, 'leave_challenge', { p_challenge_id: c });
    const after = await challenge(c);
    assert.equal(Number(after.total_progress), 5000);
    assert.equal(after.participant_count, 1);
    assert.notEqual(after.goal_reached_at, null);
    await expectError(rpc(db, b, 'leave_challenge', { p_challenge_id: c }), /not part of this challenge/);
  });
});

describe('competitive challenges and rankings', () => {
  test('separate scores ranked with shared ranks for ties', async () => {
    const [a, b, cUser, d] = await Promise.all(['RankA', 'RankB', 'RankC', 'RankD'].map((n) => createUser(db, n)));
    const ch = await insertChallenge(db, { mode: 'competitive', target_value: null });
    for (const u of [a, b, cUser, d]) await join(u, ch);
    await submitActivity(db, a, { distanceM: 9000, movingS: 3000, startedAt: hoursAgo(20) });
    await submitActivity(db, b, { distanceM: 7000, movingS: 2500, startedAt: hoursAgo(10) });
    await submitActivity(db, cUser, { distanceM: 7000, movingS: 2500, startedAt: hoursAgo(15) });
    await submitActivity(db, d, { distanceM: 3000, movingS: 1200, startedAt: hoursAgo(5) });
    const board = await rpcRows<{ rank: string; user_id: string; value: string }>(db, a, 'get_challenge_leaderboard', { p_challenge_id: ch, p_scope: 'all', p_limit: 50 });
    assert.deepEqual(board.map((r) => Number(r.rank)), [1, 2, 2, 4]);
    // Within a tie, whoever reached the value first is listed first (cUser's run was earlier).
    assert.equal(board[1].user_id, cUser);
    assert.equal(board[2].user_id, b);
    assert.equal(board[3].user_id, d);
  });

  test('friends scope and personal row', async () => {
    const [me, friend, stranger] = await Promise.all(['Scope', 'Pal', 'Stranger'].map((n) => createUser(db, n)));
    await rpc(db, me, 'send_friend_request', { p_user_id: friend });
    await rpc(db, friend, 'respond_friend_request', { p_user_id: me, p_accept: true });
    const ch = await insertChallenge(db, { mode: 'competitive', target_value: null });
    for (const u of [me, friend, stranger]) await join(u, ch);
    await submitActivity(db, stranger, { distanceM: 9000, movingS: 3000 });
    await submitActivity(db, friend, { distanceM: 5000, movingS: 2000 });
    await submitActivity(db, me, { distanceM: 2000, movingS: 900 });
    const friends = await rpcRows<{ user_id: string; is_me: boolean; rank: string }>(db, me, 'get_challenge_leaderboard', { p_challenge_id: ch, p_scope: 'friends', p_limit: 50 });
    assert.deepEqual(friends.map((r) => r.user_id), [friend, me]);
    const top1 = await rpcRows<{ user_id: string; is_me: boolean; rank: string }>(db, me, 'get_challenge_leaderboard', { p_challenge_id: ch, p_scope: 'all', p_limit: 1 });
    assert.equal(top1.length, 2, 'the caller row is always included');
    assert.equal(top1[1].is_me, true);
    assert.equal(Number(top1[1].rank), 3);
  });

  test('finalization ranks once, awards the podium and notifies', async () => {
    const [a, b] = await Promise.all(['FinA', 'FinB'].map((n) => createUser(db, n)));
    const ch = await insertChallenge(db, {
      mode: 'competitive', target_value: null,
      starts_at: hoursAgo(200).toISOString(), ends_at: hoursAgo(100).toISOString(), submission_grace_hours: 72,
    });
    for (const u of [a, b]) {
      await db.query(`insert into public.challenge_participants (challenge_id, user_id, joined_at) values ($1, $2, now() - interval '9 days')`, [ch, u]);
    }
    await db.query(`insert into public.challenge_contributions (challenge_id, user_id, activity_id, value, activity_started_at) values ($1, $2, null, 5000, now() - interval '150 hours'), ($1, $3, null, 3000, now() - interval '150 hours')`, [ch, a, b]);
    const first = await rpc<{ finalized: number }>(db, a, 'refresh_challenges');
    assert.ok(first.finalized >= 1);
    await rpc(db, a, 'refresh_challenges');
    const ranks = await selectAs<{ user_id: string; final_rank: number }>(db, a, `select user_id, final_rank from public.challenge_participants where challenge_id = $1 order by final_rank`, [ch]);
    assert.deepEqual(ranks.map((r) => r.user_id), [a, b]);
    const podium = await one<{ n: number }>(db, `select count(*)::int as n from public.experience_transactions where source_key = $1`, [`challenge:${ch}:podium`]);
    assert.equal(podium.n, 2, 'first and second place both reach the podium');
    const aPodium = await one<{ amount: number }>(db, `select amount from public.experience_transactions where user_id = $1 and source_key = $2`, [a, `challenge:${ch}:podium`]);
    assert.equal(aPodium.amount, 150);
    const notes = await one<{ n: number }>(db, `select count(*)::int as n from public.notifications where user_id = $1 and type = 'challenge_finished'`, [a]);
    assert.equal(notes.n, 1);
    // No new contributions after finalization.
    const late = await submitActivity(db, a, { startedAt: hoursAgo(150) });
    assert.equal(late.challenges.find((x) => x.challenge_id === ch), undefined);
  });
});

describe('team challenges', () => {
  test('eligible totals aggregate by team and auto-balance new members', async () => {
    const users = await Promise.all(['T1', 'T2', 'T3', 'T4'].map((n) => createUser(db, n)));
    const ch = await insertChallenge(db, { mode: 'team', target_value: 10000 });
    const { rows: teams } = await db.query<{ id: string; name: string }>(
      `insert into public.challenge_teams (challenge_id, name, color) values ($1, 'Red', '#FF0000'), ($1, 'Blue', '#0000FF') returning id, name`, [ch]);
    for (const u of users) await join(u, ch);
    const memberCounts = await selectAs<{ member_count: number }>(db, users[0], `select member_count from public.challenge_teams where challenge_id = $1`, [ch]);
    assert.deepEqual(memberCounts.map((t) => t.member_count), [2, 2]);

    const teamOf = async (u: string) => (await participant(ch, u)).team_id;
    const red = teams.find((t) => t.name === 'Red')!.id;
    const redMembers = [];
    for (const u of users) if ((await teamOf(u)) === red) redMembers.push(u);
    await submitActivity(db, redMembers[0], { distanceM: 6000, movingS: 2200 });
    const res = await submitActivity(db, redMembers[1], { distanceM: 4500, movingS: 1800 });
    assert.equal(res.challenges[0].completed_now, true);
    const totals = await selectAs<{ name: string; total_progress: string; goal_reached_at: string | null }>(
      db, users[0], `select name, total_progress, goal_reached_at from public.challenge_teams where challenge_id = $1 order by name`, [ch]);
    const redRow = totals.find((t) => t.name === 'Red')!;
    const blueRow = totals.find((t) => t.name === 'Blue')!;
    assert.equal(Number(redRow.total_progress), 10500);
    assert.notEqual(redRow.goal_reached_at, null);
    assert.equal(Number(blueRow.total_progress), 0);
  });

  test('cannot join a team from another challenge', async () => {
    const u = await createUser(db, 'WrongTeam');
    const a = await insertChallenge(db, { mode: 'team', target_value: null });
    const b = await insertChallenge(db, { mode: 'team', target_value: null });
    const { rows } = await db.query<{ id: string }>(`insert into public.challenge_teams (challenge_id, name, color) values ($1, 'Other', '#00FF00') returning id`, [b]);
    await db.query(`insert into public.challenge_teams (challenge_id, name, color) values ($1, 'Mine', '#00FF00')`, [a]);
    await expectError(join(u, a, rows[0].id), /does not belong/);
  });
});

describe('creating, inviting and private challenges', () => {
  test('create_challenge validates input and auto-joins the creator', async () => {
    const u = await createUser(db, 'Creator');
    const id = await rpc<string>(db, u, 'create_challenge', {
      p: {
        title: 'Lunchtime 30K', mode: 'individual', metric: 'distance', target_value: 30000,
        activity_types: ['run'], starts_at: new Date().toISOString(), ends_at: days(14), timezone: 'Europe/Berlin',
      },
    });
    assert.ok(id);
    assert.equal((await challenge(id)).participant_count, 1);
    const xp = await one<{ xp_reward: number; created_by: string }>(db, `select xp_reward, created_by from public.challenges where id = $1`, [id]);
    assert.equal(xp.xp_reward, 75, 'user-created challenges cannot set their own XP reward');
    assert.equal(xp.created_by, u);

    const base = { title: 'Bad', mode: 'individual', metric: 'distance', target_value: 1000, activity_types: ['run'], starts_at: new Date().toISOString(), ends_at: days(7) };
    await expectError(rpc(db, u, 'create_challenge', { p: { ...base, ends_at: days(-1) } }), /must end/);
    await expectError(rpc(db, u, 'create_challenge', { p: { ...base, target_value: null } }), /needs a goal/);
    await expectError(rpc(db, u, 'create_challenge', { p: { ...base, activity_types: [] } }), /at least one activity type/);
    await expectError(rpc(db, u, 'create_challenge', { p: { ...base, ends_at: days(500) } }), /at most one year/);
    await expectError(rpc(db, u, 'create_challenge', { p: { ...base, mode: 'team', teams: [{ name: 'Solo' }] } }), /between two and six teams/);
    await expectError(rpc(db, u, 'create_challenge', { p: { ...base, timezone: 'Nowhere/Land' } }), /Unknown time zone/);
  });

  test('recurring challenges align to calendar periods and roll forward with participants', async () => {
    const u = await createUser(db, 'Recurring');
    const id = await rpc<string>(db, u, 'create_challenge', {
      p: { title: 'Weekly Walk', mode: 'individual', metric: 'distance', target_value: 20000, activity_types: ['walk'], recurrence: 'weekly', timezone: 'UTC' },
    });
    const row = await one<{ starts_at: Date; ends_at: Date; series_id: string }>(db, `select starts_at, ends_at, series_id from public.challenges where id = $1`, [id]);
    assert.equal(new Date(row.starts_at).getUTCDay(), 1, 'weekly challenges start on Monday');
    assert.equal(new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime(), 7 * DAY);

    // Simulate the period passing by shifting this instance two weeks into the past.
    await db.query(`update public.challenges set starts_at = starts_at - interval '14 days', ends_at = ends_at - interval '14 days' where id = $1`, [id]);
    await rpc(db, u, 'refresh_challenges');
    const instances = await one<{ n: number; newest_start: Date }>(db, `select count(*)::int as n, max(starts_at) as newest_start from public.challenges where series_id = $1`, [row.series_id]);
    assert.equal(instances.n, 2, 'only the current period is created, not every missed one');
    assert.equal(new Date(instances.newest_start).getTime(), new Date(row.starts_at).getTime());
    const enrolled = await one<{ n: number }>(db, `select count(*)::int as n from public.challenge_participants cp join public.challenges c on c.id = cp.challenge_id where c.series_id = $1 and c.id <> $2 and cp.user_id = $3`, [row.series_id, id, u]);
    assert.equal(enrolled.n, 1, 'participants carry over to the next instance');
    await rpc(db, u, 'refresh_challenges');
    const again = await one<{ n: number }>(db, `select count(*)::int as n from public.challenges where series_id = $1`, [row.series_id]);
    assert.equal(again.n, 2, 'rolling is idempotent');
  });

  test('private challenges are invisible to outsiders and joinable by invite or code', async () => {
    const [owner, friend, outsider] = await Promise.all(['PrivOwner', 'PrivFriend', 'Outsider'].map((n) => createUser(db, n)));
    await rpc(db, owner, 'send_friend_request', { p_user_id: friend });
    await rpc(db, friend, 'respond_friend_request', { p_user_id: owner, p_accept: true });
    const id = await rpc<string>(db, owner, 'create_challenge', {
      p: { title: 'Secret Club', mode: 'competitive', metric: 'distance', activity_types: ['run'], starts_at: new Date().toISOString(), ends_at: days(10), visibility: 'private' },
    });
    assert.equal((await selectAs(db, outsider, `select id from public.challenges where id = $1`, [id])).length, 0);
    await expectError(join(outsider, id), /invite-only/);
    await expectError(rpcRows(db, outsider, 'get_challenge_leaderboard', { p_challenge_id: id, p_scope: 'all', p_limit: 10 }), /not found/);

    const invited = await rpc<number>(db, owner, 'invite_to_challenge', { p_challenge_id: id, p_user_ids: [friend, outsider] });
    assert.equal(invited, 1, 'only friends can be invited');
    assert.equal((await selectAs(db, friend, `select id from public.challenges where id = $1`, [id])).length, 1, 'invitees can preview');
    const [inv] = await selectAs<{ id: string }>(db, friend, `select id from public.invitations where invitee_id = $1 and challenge_id = $2`, [friend, id]);
    await rpc(db, friend, 'respond_invitation', { p_invitation_id: inv.id, p_accept: true, p_team_id: null });
    assert.notEqual(await participant(id, friend), undefined);

    const { invite_code } = await one<{ invite_code: string }>(db, `select invite_code from public.challenges where id = $1`, [id]);
    await expectError(rpc(db, outsider, 'join_challenge_by_code', { p_code: 'WRONG123' }), /not valid/);
    await rpc(db, outsider, 'join_challenge_by_code', { p_code: invite_code.toLowerCase() });
    assert.notEqual(await participant(id, outsider), undefined);
  });

  test('expired invitations cannot be accepted', async () => {
    const [owner, friend] = await Promise.all(['ExpOwner', 'ExpFriend'].map((n) => createUser(db, n)));
    await rpc(db, owner, 'send_friend_request', { p_user_id: friend });
    await rpc(db, friend, 'respond_friend_request', { p_user_id: owner, p_accept: true });
    const id = await insertChallenge(db, { visibility: 'private', invite_code: 'EXPIRED1', created_by: owner });
    await join(owner, id);
    await rpc(db, owner, 'invite_to_challenge', { p_challenge_id: id, p_user_ids: [friend] });
    await db.query(`update public.invitations set expires_at = now() - interval '1 minute' where invitee_id = $1`, [friend]);
    const [inv] = await selectAs<{ id: string }>(db, friend, `select id from public.invitations where invitee_id = $1`, [friend]);
    await expectError(rpc(db, friend, 'respond_invitation', { p_invitation_id: inv.id, p_accept: true, p_team_id: null }), /expired/);
    await expectError(join(friend, id), /invite-only/);
  });
});
