// The app validates forms with constants from src/domain/activity-rules.ts; the database enforces
// its own copies. This test fails if the two ever drift apart.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { MAX_AVG_SPEED_MPS, MAX_DISTANCE_M, MAX_SEGMENT_SPEED_MPS } from '../../src/domain/activity-rules.ts';
import { type Db, createDb } from './harness.ts';

let db: Db;
before(async () => {
  db = await createDb();
});

test('activity plausibility limits match between app and database', async () => {
  const { rows } = await db.query<{ t: string; avg: number; seg: number; dist: number }>(`
    select t::text as t,
           app_private.max_avg_speed_mps(t) as avg,
           app_private.max_segment_speed_mps(t) as seg,
           app_private.max_distance_m(t) as dist
    from unnest(enum_range(null::public.activity_type)) as t`);
  assert.equal(rows.length, Object.keys(MAX_AVG_SPEED_MPS).length);
  for (const r of rows) {
    const t = r.t as keyof typeof MAX_AVG_SPEED_MPS;
    assert.equal(r.avg, MAX_AVG_SPEED_MPS[t], `avg speed for ${t}`);
    assert.equal(r.seg, MAX_SEGMENT_SPEED_MPS[t], `segment speed for ${t}`);
    assert.equal(r.dist, MAX_DISTANCE_M[t], `max distance for ${t}`);
  }
});
