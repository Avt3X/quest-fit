-- QuestFit progression engine.
--
-- Everything in this file runs inside the database, in the same transaction as the write that
-- triggered it. Clients never send totals, ranks, XP or unlocks; they only submit activities and
-- intents (join, leave, invite) through the RPCs in the next migration.
--
-- Lock ordering (prevents deadlocks between concurrent contributors):
--   1. user_stats row of the acting user        (serialises one user's own processing)
--   2. challenge rows, ascending id             (serialises contributions to a shared goal)
--   3. challenge_teams / challenge_participants rows
--   4. journey_expeditions rows, ascending id
--   5. journey_expedition_members rows
--   6. user_xp rows of any user                 (XP awards, never followed by 1-5)

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using errcode = '28000', message = 'You need to be signed in.';
  end if;
  return uid;
end;
$$;

create or replace function app_private.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::integer from public.game_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Relationship and visibility helpers (security definer so RLS policies can call them
-- without recursive policy evaluation).
-- ---------------------------------------------------------------------------

create or replace function app_private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.friendships f
    where f.user_low = least(a, b) and f.user_high = greatest(a, b) and f.status = 'accepted'
  );
$$;

create or replace function app_private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_users bu
    where (bu.blocker_id = a and bu.blocked_id = b) or (bu.blocker_id = b and bu.blocked_id = a)
  );
$$;

create or replace function app_private.can_view_profile_details(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and (
    viewer = owner
    or (
      not app_private.is_blocked_between(viewer, owner)
      and exists (
        select 1 from public.profiles p
        where p.id = owner
          and (p.profile_visibility = 'public'
               or (p.profile_visibility = 'friends' and app_private.are_friends(viewer, owner)))
      )
    )
  );
$$;

-- Effective visibility is the stricter of the activity's own visibility and the owner's profile
-- visibility. Private profiles never expose activities to anyone else.
create or replace function app_private.can_view_activity(viewer uuid, owner uuid, vis public.visibility)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and (
    viewer = owner
    or (
      vis <> 'private'
      and not app_private.is_blocked_between(viewer, owner)
      and exists (
        select 1 from public.profiles p
        where p.id = owner
          and p.profile_visibility <> 'private'
          and (
            (vis = 'public' and p.profile_visibility = 'public')
            or app_private.are_friends(viewer, owner)
          )
      )
    )
  );
$$;

create or replace function app_private.can_view_activity_id(viewer uuid, p_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity and app_private.can_view_activity(viewer, a.user_id, a.visibility)
  );
$$;

create or replace function app_private.is_challenge_participant(viewer uuid, p_challenge uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge and cp.user_id = viewer
  );
$$;

create or replace function app_private.can_view_challenge(viewer uuid, p_challenge uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and exists (
    select 1 from public.challenges c
    where c.id = p_challenge
      and (
        c.visibility = 'public'
        or c.created_by = viewer
        or app_private.is_challenge_participant(viewer, c.id)
        or exists (
          select 1 from public.invitations i
          where i.challenge_id = c.id and i.invitee_id = viewer
            and i.status = 'pending' and i.expires_at > now()
        )
      )
  );
$$;

create or replace function app_private.is_expedition_member(viewer uuid, p_expedition uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journey_expedition_members m
    where m.expedition_id = p_expedition and m.user_id = viewer
  );
$$;

create or replace function app_private.can_view_expedition(viewer uuid, p_expedition uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and (
    app_private.is_expedition_member(viewer, p_expedition)
    or exists (
      select 1 from public.invitations i
      where i.expedition_id = p_expedition and i.invitee_id = viewer
        and i.status = 'pending' and i.expires_at > now()
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Activity rules. Mirrored for client-side form validation in src/domain/activity-rules.ts;
-- supabase/tests/rules-parity.test.ts asserts both sides agree.
-- ---------------------------------------------------------------------------

-- Highest plausible average speed for the whole activity. Above this the activity is kept but
-- marked ineligible for challenges, journeys, XP and achievements.
create or replace function app_private.max_avg_speed_mps(t public.activity_type)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case t
    when 'run' then 7.5
    when 'indoor_run' then 7.5
    when 'walk' then 4.5
    when 'hike' then 4.5
    when 'ride' then 20.0
    when 'swim' then 3.0
    else 30.0
  end::double precision;
$$;

-- Highest plausible speed between two consecutive GPS samples; faster jumps are GPS glitches
-- (or vehicle travel) and do not add distance.
create or replace function app_private.max_segment_speed_mps(t public.activity_type)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case t
    when 'run' then 12.0
    when 'walk' then 8.0
    when 'hike' then 8.0
    when 'ride' then 35.0
    else 35.0
  end::double precision;
$$;

create or replace function app_private.max_distance_m(t public.activity_type)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case t
    when 'run' then 300000
    when 'indoor_run' then 100000
    when 'walk' then 200000
    when 'hike' then 200000
    when 'ride' then 1000000
    when 'swim' then 50000
    else 300000
  end;
$$;

create or replace function app_private.activity_type_label(t public.activity_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case t
    when 'run' then 'Run'
    when 'indoor_run' then 'Indoor Run'
    when 'walk' then 'Walk'
    when 'ride' then 'Ride'
    when 'hike' then 'Hike'
    when 'swim' then 'Swim'
    when 'workout' then 'Workout'
    else 'Activity'
  end;
$$;

create or replace function app_private.default_activity_title(t public.activity_type, started timestamptz, tz text)
returns text
language sql
stable
set search_path = ''
as $$
  select (
    case
      when h between 5 and 10 then 'Morning '
      when h between 11 and 13 then 'Lunch '
      when h between 14 and 16 then 'Afternoon '
      when h between 17 and 20 then 'Evening '
      else 'Night '
    end
  ) || app_private.activity_type_label(t)
  from (select extract(hour from started at time zone tz)::integer as h) x;
$$;

-- Returns null when the activity is plausible, otherwise a user-facing explanation.
create or replace function app_private.eligibility_problem(t public.activity_type, distance_m integer, moving_time_s integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  speed double precision;
begin
  if moving_time_s <= 0 then
    return 'Moving time must be greater than zero.';
  end if;
  speed := distance_m::double precision / moving_time_s;
  if distance_m > 0 and speed > app_private.max_avg_speed_mps(t) then
    return format(
      'Average speed of %s km/h is not plausible for this activity type, so it does not count toward challenges, journeys or rewards.',
      round((speed * 3.6)::numeric, 1)
    );
  end if;
  return null;
end;
$$;

create or replace function app_private.metric_value(distance_m integer, moving_time_s integer, m public.challenge_metric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case m
    when 'distance' then distance_m::bigint
    when 'duration' then moving_time_s::bigint
    else 1::bigint
  end;
$$;

-- ---------------------------------------------------------------------------
-- Geometry
-- ---------------------------------------------------------------------------

create or replace function app_private.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371008.8 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Validates the shape of a submitted route. Points: [lat, lng, t_ms, alt|null, acc|null, segment].
create or replace function app_private.assert_valid_route(points jsonb, started timestamptz, ended timestamptz)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer;
  p jsonb;
  lat double precision;
  lng double precision;
  ts double precision;
  prev_ts double precision := null;
  min_ts double precision := extract(epoch from started) * 1000 - 120000;
  max_ts double precision := extract(epoch from ended) * 1000 + 120000;
begin
  if points is null or jsonb_typeof(points) <> 'array' then
    raise exception using errcode = '22023', message = 'GPS activities must include a route.';
  end if;
  n := jsonb_array_length(points);
  if n < 2 then
    raise exception using errcode = '22023', message = 'The route needs at least two GPS points.';
  end if;
  if n > 20000 then
    raise exception using errcode = '22023', message = 'The route has too many points (maximum 20,000).';
  end if;
  for p in select value from jsonb_array_elements(points) loop
    if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < 3
       or jsonb_typeof(p -> 0) <> 'number' or jsonb_typeof(p -> 1) <> 'number' or jsonb_typeof(p -> 2) <> 'number' then
      raise exception using errcode = '22023', message = 'Route points must be [lat, lng, timestamp, ...] arrays.';
    end if;
    lat := (p ->> 0)::double precision;
    lng := (p ->> 1)::double precision;
    ts := (p ->> 2)::double precision;
    if lat < -90 or lat > 90 or lng < -180 or lng > 180 then
      raise exception using errcode = '22023', message = 'Route contains coordinates out of range.';
    end if;
    if ts < min_ts or ts > max_ts then
      raise exception using errcode = '22023', message = 'Route timestamps fall outside the activity time window.';
    end if;
    if prev_ts is not null and ts < prev_ts then
      raise exception using errcode = '22023', message = 'Route timestamps must be in chronological order.';
    end if;
    prev_ts := ts;
  end loop;
  return n;
end;
$$;

-- Authoritative GPS distance: sums great-circle distance between consecutive samples of the same
-- recording segment (pauses start a new segment) and skips jumps faster than physically plausible.
create or replace function app_private.route_distance_m(points jsonb, t public.activity_type)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  vmax double precision := app_private.max_segment_speed_mps(t);
  total double precision := 0;
  has_anchor boolean := false;
  a_lat double precision;
  a_lng double precision;
  a_ts double precision;
  a_seg integer;
  p jsonb;
  lat double precision;
  lng double precision;
  ts double precision;
  seg integer;
  d double precision;
  dt double precision;
begin
  for p in select value from jsonb_array_elements(points) loop
    lat := (p ->> 0)::double precision;
    lng := (p ->> 1)::double precision;
    ts := (p ->> 2)::double precision;
    seg := coalesce((p ->> 5)::integer, 0);
    if not has_anchor or seg <> a_seg then
      a_lat := lat; a_lng := lng; a_ts := ts; a_seg := seg; has_anchor := true;
      continue;
    end if;
    dt := (ts - a_ts) / 1000.0;
    if dt <= 0 then
      continue;
    end if;
    d := app_private.haversine_m(a_lat, a_lng, lat, lng);
    if d / dt > vmax then
      continue;
    end if;
    total := total + d;
    a_lat := lat; a_lng := lng; a_ts := ts;
  end loop;
  return round(total)::integer;
end;
$$;

-- Builds the shareable preview: decimated to at most max_points and, when requested, with every
-- point inside the privacy radius around the start and the finish removed.
create or replace function app_private.build_route_preview(
  points jsonb,
  hide_endpoints boolean,
  privacy_radius_m double precision default 200,
  max_points integer default 250
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := jsonb_array_length(points);
  step integer;
  f_lat double precision;
  f_lng double precision;
  l_lat double precision;
  l_lng double precision;
  result jsonb;
begin
  if n is null or n < 2 then
    return null;
  end if;
  f_lat := (points -> 0 ->> 0)::double precision;
  f_lng := (points -> 0 ->> 1)::double precision;
  l_lat := (points -> (n - 1) ->> 0)::double precision;
  l_lng := (points -> (n - 1) ->> 1)::double precision;
  step := greatest(1, ceil(n::numeric / max_points)::integer);

  select jsonb_agg(
           jsonb_build_array(
             round((e.value ->> 0)::numeric, 5),
             round((e.value ->> 1)::numeric, 5),
             coalesce((e.value ->> 5)::integer, 0)
           ) order by e.ord)
    into result
  from jsonb_array_elements(points) with ordinality as e(value, ord)
  where ((e.ord - 1) % step = 0 or e.ord = n)
    and (
      not hide_endpoints
      or (
        app_private.haversine_m(f_lat, f_lng, (e.value ->> 0)::double precision, (e.value ->> 1)::double precision) > privacy_radius_m
        and app_private.haversine_m(l_lat, l_lng, (e.value ->> 0)::double precision, (e.value ->> 1)::double precision) > privacy_radius_m
      )
    );

  if result is null or jsonb_array_length(result) < 2 then
    return null;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create or replace function app_private.notify(
  p_user uuid,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_data jsonb default '{}',
  p_actor uuid default null,
  p_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or (p_actor is not null and p_actor = p_user) then
    return;
  end if;
  insert into public.notifications (user_id, type, actor_id, title, body, data, dedupe_key)
  values (p_user, p_type, p_actor, p_title, p_body, coalesce(p_data, '{}'), p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Experience and levels
-- ---------------------------------------------------------------------------

create or replace function app_private.level_for_xp(total bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((select max(l.level) from public.levels l where l.xp_required <= total), 1);
$$;

create or replace function app_private.on_xp_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  delta bigint;
  old_total bigint;
  old_level integer;
  new_total bigint;
  new_level integer;
  lvl_title text;
begin
  if tg_op = 'INSERT' then
    uid := new.user_id; delta := new.amount;
  elsif tg_op = 'DELETE' then
    uid := old.user_id; delta := -old.amount;
  else
    uid := new.user_id; delta := new.amount - old.amount;
  end if;
  if delta = 0 then
    return null;
  end if;

  select x.xp_total, x.level into old_total, old_level from public.user_xp x where x.user_id = uid for update;
  if not found then
    return null;
  end if;
  new_total := greatest(0, old_total + delta);
  new_level := app_private.level_for_xp(new_total);
  update public.user_xp set xp_total = new_total, level = new_level, updated_at = now() where user_id = uid;

  if new_level > old_level then
    select l.title into lvl_title from public.levels l where l.level = new_level;
    perform app_private.notify(
      uid, 'level_up', format('Level %s reached', new_level),
      format('You are now a %s. Keep exploring!', coalesce(lvl_title, 'Adventurer')),
      jsonb_build_object('level', new_level), null, 'level:' || new_level
    );
  end if;
  return null;
end;
$$;

create trigger experience_transactions_apply
  after insert or update of amount or delete on public.experience_transactions
  for each row execute function app_private.on_xp_change();

create or replace function app_private.award_xp(p_user uuid, p_amount integer, p_reason text, p_source_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;
  insert into public.experience_transactions (user_id, amount, reason, source_key)
  values (p_user, p_amount, p_reason, p_source_key)
  on conflict (user_id, source_key) do nothing;
  return found;
end;
$$;

create or replace function app_private.raw_activity_xp(p_type public.activity_type, p_distance_m integer, p_moving_time_s integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select round(r.base_xp + r.xp_per_km * (p_distance_m / 1000.0) + r.xp_per_10_min * (p_moving_time_s / 600.0))::integer
    from public.xp_rules r where r.activity_type = p_type
  ), 0);
$$;

-- Re-allocates activity XP for one local day. A daily cap keeps XP from rewarding excessive
-- training volume; allocation is deterministic (by start time) so edits and deletes re-balance.
create or replace function app_private.recompute_activity_xp(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer := app_private.setting_int('daily_activity_xp_cap', 400);
  a record;
  xp integer;
begin
  for a in
    select id, type, distance_m, moving_time_s, is_eligible
    from public.activities
    where user_id = p_user and local_date = p_date
    order by started_at, id
  loop
    if a.is_eligible then
      xp := greatest(0, least(app_private.raw_activity_xp(a.type, a.distance_m, a.moving_time_s), remaining));
    else
      xp := 0;
    end if;
    remaining := remaining - xp;
    if xp > 0 then
      insert into public.experience_transactions (user_id, amount, reason, source_key, activity_id)
      values (p_user, xp, 'activity', 'activity:' || a.id, a.id)
      on conflict (user_id, source_key) do update
        set amount = excluded.amount, updated_at = now()
        where public.experience_transactions.amount <> excluded.amount;
    else
      delete from public.experience_transactions where user_id = p_user and source_key = 'activity:' || a.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stats and streaks
-- ---------------------------------------------------------------------------

-- Daily streak: consecutive calendar days (activity time zone) with at least one qualifying
-- activity. Weekly streak: consecutive ISO weeks with at least one qualifying activity.
-- Qualifying = eligible and moving time >= game_settings.streak_min_moving_s.
create or replace function app_private.refresh_user_stats(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_s integer := app_private.setting_int('streak_min_moving_s', 600);
begin
  with agg as (
    select count(*)::integer as c,
           coalesce(sum(distance_m), 0)::bigint as d,
           coalesce(sum(moving_time_s), 0)::bigint as t,
           coalesce(sum(elevation_gain_m), 0)::bigint as e
    from public.activities
    where user_id = p_user and is_eligible
  ),
  days as (
    select distinct local_date as d
    from public.activities
    where user_id = p_user and is_eligible and moving_time_s >= min_s
  ),
  islands as (
    select d, d - (row_number() over (order by d))::integer as grp from days
  ),
  runs as (
    select max(d) as last_d, count(*)::integer as len from islands group by grp
  ),
  weeks as (
    select distinct date_trunc('week', d::timestamp)::date as w from days
  ),
  wislands as (
    select w, w - ((row_number() over (order by w))::integer * 7) as grp from weeks
  ),
  wruns as (
    select max(w) as last_w, count(*)::integer as len from wislands group by grp
  )
  update public.user_stats s set
    activity_count = agg.c,
    total_distance_m = agg.d,
    total_moving_time_s = agg.t,
    total_elevation_gain_m = agg.e,
    daily_streak_days = coalesce((select len from runs order by last_d desc limit 1), 0),
    daily_streak_last_date = (select max(last_d) from runs),
    longest_daily_streak = coalesce((select max(len) from runs), 0),
    weekly_streak_weeks = coalesce((select len from wruns order by last_w desc limit 1), 0),
    weekly_streak_last_week = (select max(last_w) from wruns),
    updated_at = now()
  from agg
  where s.user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Themes
-- ---------------------------------------------------------------------------

create or replace function app_private.unlock_theme(p_user uuid, p_theme text, p_source text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  th record;
begin
  select id, name, unlock_rule into th from public.themes where id = p_theme and is_active;
  if not found then
    return false;
  end if;
  insert into public.user_unlocked_themes (user_id, theme_id, source)
  values (p_user, p_theme, p_source)
  on conflict (user_id, theme_id) do nothing;
  if not found then
    return false;
  end if;
  if th.unlock_rule ->> 'type' <> 'default' then
    perform app_private.notify(
      p_user, 'theme_unlocked', 'New theme unlocked',
      format('%s is now available in your theme gallery.', th.name),
      jsonb_build_object('theme_id', th.id), null, 'theme:' || th.id
    );
  end if;
  return true;
end;
$$;

create or replace function app_private.evaluate_theme_unlocks(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  th record;
  dist bigint;
  lvl integer;
begin
  select coalesce(total_distance_m, 0) into dist from public.user_stats where user_id = p_user;
  select coalesce(level, 1) into lvl from public.user_xp where user_id = p_user;
  for th in
    select t.id, t.unlock_rule
    from public.themes t
    where t.is_active
      and t.unlock_rule ->> 'type' in ('default', 'total_distance', 'level')
      and not exists (select 1 from public.user_unlocked_themes u where u.user_id = p_user and u.theme_id = t.id)
    order by t.sort_order
  loop
    if th.unlock_rule ->> 'type' = 'default'
       or (th.unlock_rule ->> 'type' = 'total_distance' and coalesce(dist, 0) >= (th.unlock_rule ->> 'threshold_m')::bigint)
       or (th.unlock_rule ->> 'type' = 'level' and coalesce(lvl, 1) >= (th.unlock_rule ->> 'level')::integer) then
      perform app_private.unlock_theme(
        p_user, th.id,
        case th.unlock_rule ->> 'type' when 'default' then 'default' else 'milestone' end
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------

create or replace function app_private.rule_activity_types(rule jsonb)
returns public.activity_type[]
language sql
immutable
set search_path = ''
as $$
  select case
    when rule ? 'activity_types'
      then array(select jsonb_array_elements_text(rule -> 'activity_types'))::public.activity_type[]
    else null
  end;
$$;

-- Target value of an achievement rule, in the rule's own unit (meters, days, count, level).
create or replace function app_private.achievement_rule_target(rule jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case rule ->> 'type'
    when 'activity_count' then (rule ->> 'count')::bigint
    when 'total_distance' then (rule ->> 'threshold_m')::bigint
    when 'single_activity_distance' then (rule ->> 'threshold_m')::bigint
    when 'daily_streak' then (rule ->> 'days')::bigint
    when 'challenges_completed' then (rule ->> 'count')::bigint
    when 'journeys_completed' then (rule ->> 'count')::bigint
    when 'level' then (rule ->> 'level')::bigint
    when 'friends' then (rule ->> 'count')::bigint
    when 'early_activity' then 1::bigint
    else null
  end;
$$;

-- Current value of an achievement rule for a user, derived only from validated server data.
create or replace function app_private.achievement_rule_value(p_user uuid, rule jsonb)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := rule ->> 'type';
  types public.activity_type[] := app_private.rule_activity_types(rule);
begin
  case kind
    when 'activity_count' then
      return (
        select count(*) from public.activities
        where user_id = p_user and is_eligible and (types is null or type = any (types))
      );
    when 'total_distance' then
      return (
        select coalesce(sum(distance_m), 0) from public.activities
        where user_id = p_user and is_eligible and (types is null or type = any (types))
      );
    when 'single_activity_distance' then
      return (
        select coalesce(max(distance_m), 0) from public.activities
        where user_id = p_user and is_eligible and (types is null or type = any (types))
      );
    when 'daily_streak' then
      return coalesce((select longest_daily_streak from public.user_stats where user_id = p_user), 0);
    when 'challenges_completed' then
      return (
        select count(*)
        from public.challenge_participants cp
        join public.challenges c on c.id = cp.challenge_id
        where cp.user_id = p_user and cp.completed_at is not null
          and (rule ->> 'period' is null or c.period::text = rule ->> 'period')
          and (rule -> 'modes' is null or c.mode::text in (select jsonb_array_elements_text(rule -> 'modes')))
      );
    when 'journeys_completed' then
      return (
        select count(*)
        from public.journey_expedition_members m
        join public.journey_expeditions e on e.id = m.expedition_id
        join public.journeys j on j.id = e.journey_id
        where m.user_id = p_user and e.status = 'completed' and m.left_at is null
          and (rule ->> 'journey_slug' is null or j.slug = rule ->> 'journey_slug')
      );
    when 'level' then
      return coalesce((select level from public.user_xp where user_id = p_user), 1);
    when 'friends' then
      return (
        select count(*) from public.friendships
        where (user_low = p_user or user_high = p_user) and status = 'accepted'
      );
    when 'early_activity' then
      return case when exists (
        select 1 from public.activities
        where user_id = p_user and is_eligible and moving_time_s >= 600
          and extract(hour from started_at at time zone timezone) < (rule ->> 'before_hour')::integer
      ) then 1 else 0 end;
    else
      return 0;
  end case;
end;
$$;

create or replace function app_private.achievement_rule_met(p_user uuid, rule jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.achievement_rule_value(p_user, rule) >= app_private.achievement_rule_target(rule);
$$;

-- Grants every achievement whose rule is now satisfied. Idempotent: the primary key on
-- user_achievements and the XP ledger's unique source key make repeated evaluation harmless.
create or replace function app_private.evaluate_achievements(p_user uuid, p_activity uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ach record;
  granted boolean := true;
  passes integer := 0;
begin
  -- Achievement XP can raise the level, which can satisfy a level achievement; loop to a fixpoint.
  while granted and passes < 4 loop
    granted := false;
    passes := passes + 1;
    for ach in
      select a.*
      from public.achievements a
      where a.is_active
        and not exists (
          select 1 from public.user_achievements ua where ua.user_id = p_user and ua.achievement_id = a.id
        )
      order by a.sort_order, a.id
    loop
      if app_private.achievement_rule_met(p_user, ach.rule) then
        insert into public.user_achievements (user_id, achievement_id, source_activity_id, context)
        values (p_user, ach.id, p_activity, jsonb_build_object('rule', ach.rule))
        on conflict (user_id, achievement_id) do nothing;
        if found then
          granted := true;
          perform app_private.award_xp(p_user, ach.xp_reward, 'achievement', 'achievement:' || ach.id);
          if ach.reward_theme_id is not null then
            perform app_private.unlock_theme(p_user, ach.reward_theme_id, 'achievement:' || ach.id);
          end if;
          perform app_private.notify(
            p_user, 'achievement_unlocked', 'Achievement unlocked', ach.title,
            jsonb_build_object('achievement_id', ach.id), null, 'achievement:' || ach.id
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function app_private.evaluate_rewards(p_user uuid, p_activity uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.evaluate_achievements(p_user, p_activity);
  perform app_private.evaluate_theme_unlocks(p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create or replace function app_private.challenge_submission_open(c public.challenges)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.finalized_at is null and now() <= c.ends_at + make_interval(hours => c.submission_grace_hours);
$$;

create or replace function app_private.challenge_accepts(c public.challenges, p public.challenge_participants, a public.activities)
returns boolean
language sql
stable
set search_path = ''
as $$
  select a.is_eligible
    and a.user_id = p.user_id
    and p.challenge_id = c.id
    and a.type = any (c.activity_types)
    and (c.allow_manual or a.source = 'gps')
    -- Window rule: an activity belongs to the challenge when it STARTED inside [starts_at, ends_at).
    and a.started_at >= c.starts_at
    and a.started_at < c.ends_at
    and app_private.challenge_submission_open(c)
    and (c.retroactive or a.started_at >= p.joined_at)
    and app_private.metric_value(a.distance_m, a.moving_time_s, c.metric) > 0;
$$;

-- Keeps participant, team and challenge totals in step with the contribution ledger.
create or replace function app_private.on_challenge_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.challenge_participants
      set progress_value = progress_value + new.value,
          contribution_count = contribution_count + 1,
          last_progress_at = greatest(coalesce(last_progress_at, new.activity_started_at), new.activity_started_at)
      where challenge_id = new.challenge_id and user_id = new.user_id;
    if new.team_id is not null then
      update public.challenge_teams set total_progress = total_progress + new.value where id = new.team_id;
    end if;
    update public.challenges set total_progress = total_progress + new.value where id = new.challenge_id;
  elsif tg_op = 'DELETE' then
    update public.challenge_participants
      set progress_value = greatest(0, progress_value - old.value),
          contribution_count = greatest(0, contribution_count - 1),
          last_progress_at = (
            select max(cc.activity_started_at) from public.challenge_contributions cc
            where cc.challenge_id = old.challenge_id and cc.user_id = old.user_id
          )
      where challenge_id = old.challenge_id and user_id = old.user_id;
    if old.team_id is not null then
      update public.challenge_teams set total_progress = greatest(0, total_progress - old.value) where id = old.team_id;
    end if;
    update public.challenges set total_progress = greatest(0, total_progress - old.value) where id = old.challenge_id;
  end if;
  return null;
end;
$$;

create trigger challenge_contributions_aggregate
  after insert or delete on public.challenge_contributions
  for each row execute function app_private.on_challenge_contribution();

create or replace function app_private.on_challenge_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.challenges set participant_count = participant_count + 1 where id = new.challenge_id;
    if new.team_id is not null then
      update public.challenge_teams set member_count = member_count + 1 where id = new.team_id;
    end if;
  elsif tg_op = 'DELETE' then
    update public.challenges set participant_count = greatest(0, participant_count - 1) where id = old.challenge_id;
    if old.team_id is not null then
      update public.challenge_teams set member_count = greatest(0, member_count - 1) where id = old.team_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger challenge_participants_count
  after insert or delete on public.challenge_participants
  for each row execute function app_private.on_challenge_participant();

create or replace function app_private.complete_challenge_participant(p_challenge uuid, p_user uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
begin
  update public.challenge_participants set completed_at = now()
    where challenge_id = p_challenge and user_id = p_user and completed_at is null;
  if not found then
    return;
  end if;
  select * into c from public.challenges where id = p_challenge;
  perform app_private.award_xp(p_user, c.xp_reward, 'challenge_completed', 'challenge:' || c.id);
  if c.reward_theme_id is not null then
    perform app_private.unlock_theme(p_user, c.reward_theme_id, 'challenge:' || c.id);
  end if;
  perform app_private.notify(
    p_user, 'challenge_completed', 'Challenge complete!',
    case c.mode
      when 'collaborative' then format('The group reached the goal of %s.', c.title)
      when 'team' then format('Your team reached the goal of %s.', c.title)
      else format('You completed %s.', c.title)
    end,
    jsonb_build_object('challenge_id', c.id), null, 'challenge:' || c.id || ':completed'
  );
  -- The acting user's rewards are evaluated once at the end of their own pipeline.
  if p_actor is distinct from p_user then
    perform app_private.evaluate_rewards(p_user, null);
  end if;
end;
$$;

-- Called with the challenge row already locked by the caller.
create or replace function app_private.after_challenge_progress(p_challenge uuid, p_user uuid, p_prev_value bigint, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
  p public.challenge_participants;
  t public.challenge_teams;
  m record;
  half bigint;
begin
  select * into c from public.challenges where id = p_challenge;
  select * into p from public.challenge_participants where challenge_id = p_challenge and user_id = p_user;
  if not found then
    return;
  end if;

  if c.mode in ('individual', 'competitive') and c.target_value is not null then
    half := ceil(c.target_value / 2.0)::bigint;
    if p_prev_value < half and p.progress_value >= half and p.progress_value < c.target_value then
      perform app_private.notify(
        p_user, 'challenge_milestone', 'Halfway there!',
        format('You are halfway through %s.', c.title),
        jsonb_build_object('challenge_id', c.id, 'percent', 50), null, 'challenge:' || c.id || ':50'
      );
    end if;
    if p.completed_at is null and p.progress_value >= c.target_value then
      perform app_private.complete_challenge_participant(c.id, p_user, p_actor);
    end if;

  elsif c.mode = 'collaborative' then
    if c.goal_reached_at is null and c.total_progress >= c.target_value then
      update public.challenges set goal_reached_at = now() where id = c.id;
      for m in
        select user_id from public.challenge_participants
        where challenge_id = c.id and contribution_count > 0 and completed_at is null
        order by user_id
      loop
        perform app_private.complete_challenge_participant(c.id, m.user_id, p_actor);
      end loop;
    elsif c.goal_reached_at is not null and p.completed_at is null and p.contribution_count > 0 then
      perform app_private.complete_challenge_participant(c.id, p_user, p_actor);
    end if;

  elsif c.mode = 'team' and p.team_id is not null and c.target_value is not null then
    select * into t from public.challenge_teams where id = p.team_id for update;
    if t.goal_reached_at is null and t.total_progress >= c.target_value then
      update public.challenge_teams set goal_reached_at = now() where id = t.id;
      for m in
        select user_id from public.challenge_participants
        where challenge_id = c.id and team_id = t.id and contribution_count > 0 and completed_at is null
        order by user_id
      loop
        perform app_private.complete_challenge_participant(c.id, m.user_id, p_actor);
      end loop;
    elsif t.goal_reached_at is not null and p.completed_at is null and p.contribution_count > 0 then
      perform app_private.complete_challenge_participant(c.id, p_user, p_actor);
    end if;
  end if;
end;
$$;

-- Adds the activity to one challenge if it qualifies. Safe to call repeatedly.
create or replace function app_private.contribute_to_challenge(p_challenge uuid, p_activity uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
  p public.challenge_participants;
  a public.activities;
  v bigint;
begin
  select * into c from public.challenges where id = p_challenge for update;
  if not found then
    return false;
  end if;
  select * into a from public.activities where id = p_activity;
  if not found then
    return false;
  end if;
  select * into p from public.challenge_participants where challenge_id = c.id and user_id = a.user_id;
  if not found or not app_private.challenge_accepts(c, p, a) then
    return false;
  end if;
  v := app_private.metric_value(a.distance_m, a.moving_time_s, c.metric);
  insert into public.challenge_contributions (challenge_id, user_id, activity_id, team_id, value, activity_started_at)
  values (c.id, a.user_id, a.id, p.team_id, v, a.started_at)
  on conflict (challenge_id, activity_id) do nothing;
  if not found then
    return false;
  end if;
  perform app_private.after_challenge_progress(c.id, a.user_id, p.progress_value, p_actor);
  return true;
end;
$$;

create or replace function app_private.process_activity_challenges(p_activity uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select cp.challenge_id
    from public.challenge_participants cp
    join public.activities a on a.id = p_activity and a.user_id = cp.user_id
    order by cp.challenge_id
  loop
    perform app_private.contribute_to_challenge(r.challenge_id, p_activity, p_actor);
  end loop;
end;
$$;

-- Late joiners of retroactive challenges get credit for eligible activities since the start.
create or replace function app_private.backfill_challenge(p_challenge uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select a.id from public.activities a
    join public.challenges c on c.id = p_challenge
    where a.user_id = p_user and a.started_at >= c.starts_at and a.started_at < c.ends_at
    order by a.started_at, a.id
  loop
    perform app_private.contribute_to_challenge(p_challenge, r.id, p_user);
  end loop;
end;
$$;

-- Final ranks use standard competition ranking: equal values share a rank ("1, 2, 2, 4").
create or replace function app_private.finalize_challenge(p_challenge uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
  r record;
  best_team bigint;
  podium_xp integer;
begin
  select * into c from public.challenges where id = p_challenge for update;
  if not found or c.finalized_at is not null or app_private.challenge_submission_open(c) then
    return false;
  end if;

  update public.challenge_participants cp set final_rank = ranked.rnk
  from (
    select user_id, rank() over (order by progress_value desc) as rnk
    from public.challenge_participants
    where challenge_id = c.id and contribution_count > 0
  ) ranked
  where cp.challenge_id = c.id and cp.user_id = ranked.user_id;

  update public.challenges set finalized_at = now() where id = c.id;

  if c.mode = 'team' then
    select max(total_progress) into best_team from public.challenge_teams where challenge_id = c.id;
  end if;

  for r in
    select cp.user_id, cp.final_rank, cp.team_id, cp.contribution_count
    from public.challenge_participants cp
    where cp.challenge_id = c.id
    order by cp.user_id
  loop
    if c.mode = 'competitive' and r.final_rank is not null and r.final_rank <= 3 then
      podium_xp := case r.final_rank when 1 then 150 when 2 then 100 else 50 end;
      perform app_private.award_xp(r.user_id, podium_xp, 'challenge_podium', 'challenge:' || c.id || ':podium');
    end if;
    if c.mode = 'team' and coalesce(best_team, 0) > 0 and r.contribution_count > 0
       and exists (select 1 from public.challenge_teams t where t.id = r.team_id and t.total_progress = best_team) then
      perform app_private.award_xp(r.user_id, 100, 'challenge_podium', 'challenge:' || c.id || ':team_win');
    end if;
    perform app_private.notify(
      r.user_id, 'challenge_finished', 'Challenge finished',
      case
        when r.final_rank is not null and c.mode in ('competitive', 'individual')
          then format('%s has ended. You placed #%s.', c.title, r.final_rank)
        else format('%s has ended. See the final results.', c.title)
      end,
      jsonb_build_object('challenge_id', c.id, 'rank', r.final_rank), null, 'challenge:' || c.id || ':finished'
    );
  end loop;
  return true;
end;
$$;

create or replace function app_private.finalize_due_challenges(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.challenges
    where finalized_at is null and now() > ends_at + make_interval(hours => submission_grace_hours)
    order by ends_at
    limit p_limit
  loop
    if app_private.finalize_challenge(r.id) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function app_private.period_start(p_recurrence public.challenge_recurrence, p_at timestamptz, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc(
    case p_recurrence when 'weekly' then 'week' when 'monthly' then 'month' else 'year' end,
    p_at at time zone p_tz
  )) at time zone p_tz;
$$;

create or replace function app_private.period_step(p_recurrence public.challenge_recurrence)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_recurrence when 'weekly' then interval '1 week' when 'monthly' then interval '1 month' else interval '1 year' end;
$$;

-- Creates the current-period instance of every recurring series whose latest instance has ended.
-- Participants of the previous instance are re-enrolled (they can leave at any time).
create or replace function app_private.roll_recurring_challenges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.challenges;
  local_start timestamp;
  next_start timestamptz;
  next_end timestamptz;
  new_id uuid;
  created integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('questfit.roll_recurring_challenges')) then
    return 0;
  end if;
  for s in
    select distinct on (series_id) *
    from public.challenges
    where recurrence <> 'none'
    order by series_id, starts_at desc
  loop
    if s.ends_at > now() then
      continue;
    end if;
    local_start := date_trunc(
      case s.recurrence when 'weekly' then 'week' when 'monthly' then 'month' else 'year' end,
      now() at time zone s.timezone
    );
    next_start := local_start at time zone s.timezone;
    next_end := (local_start + app_private.period_step(s.recurrence)) at time zone s.timezone;

    insert into public.challenges (
      series_id, title, description, category, cover_art, created_by, is_official, is_featured,
      visibility, invite_code, mode, metric, target_value, activity_types, allow_manual, period,
      recurrence, timezone, starts_at, ends_at, submission_grace_hours, retroactive,
      max_participants, xp_reward, reward_theme_id
    )
    values (
      s.series_id, s.title, s.description, s.category, s.cover_art, s.created_by, s.is_official, s.is_featured,
      s.visibility,
      case when s.visibility = 'private' then upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) end,
      s.mode, s.metric, s.target_value, s.activity_types, s.allow_manual, s.period,
      s.recurrence, s.timezone, next_start, next_end, s.submission_grace_hours, s.retroactive,
      s.max_participants, s.xp_reward, s.reward_theme_id
    )
    on conflict (series_id, starts_at) where series_id is not null do nothing
    returning id into new_id;

    if new_id is null then
      continue;
    end if;
    created := created + 1;

    if s.mode = 'team' then
      insert into public.challenge_teams (challenge_id, name, color)
      select new_id, t.name, t.color from public.challenge_teams t where t.challenge_id = s.id;
      insert into public.challenge_participants (challenge_id, user_id, team_id, joined_at)
      select new_id, cp.user_id, nt.id, next_start
      from public.challenge_participants cp
      join public.challenge_teams ot on ot.id = cp.team_id
      join public.challenge_teams nt on nt.challenge_id = new_id and nt.name = ot.name
      where cp.challenge_id = s.id;
    else
      insert into public.challenge_participants (challenge_id, user_id, joined_at)
      select new_id, cp.user_id, next_start
      from public.challenge_participants cp
      where cp.challenge_id = s.id;
    end if;
    new_id := null;
  end loop;
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Journeys
-- ---------------------------------------------------------------------------

create or replace function app_private.on_journey_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.journey_expeditions set progress_m = progress_m + new.value_m where id = new.expedition_id;
    update public.journey_expedition_members set contributed_m = contributed_m + new.value_m
      where expedition_id = new.expedition_id and user_id = new.user_id;
  elsif tg_op = 'DELETE' then
    update public.journey_expeditions set progress_m = greatest(0, progress_m - old.value_m) where id = old.expedition_id;
    update public.journey_expedition_members set contributed_m = greatest(0, contributed_m - old.value_m)
      where expedition_id = old.expedition_id and user_id = old.user_id;
  end if;
  return null;
end;
$$;

create trigger journey_contributions_aggregate
  after insert or delete on public.journey_contributions
  for each row execute function app_private.on_journey_contribution();

-- Unlocks every checkpoint now behind the expedition marker, rewards active members, and completes
-- the expedition when the final distance is reached. Expedition row must already be locked.
create or replace function app_private.after_expedition_progress(p_expedition uuid, p_activity uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.journey_expeditions;
  j public.journeys;
  cp record;
  m record;
begin
  select * into e from public.journey_expeditions where id = p_expedition;
  select * into j from public.journeys where id = e.journey_id;

  for cp in
    insert into public.expedition_checkpoint_unlocks (expedition_id, checkpoint_id, activity_id)
    select e.id, c.id, p_activity
    from public.journey_checkpoints c
    where c.journey_id = j.id and c.distance_m <= e.progress_m
    on conflict (expedition_id, checkpoint_id) do nothing
    returning checkpoint_id
  loop
    for m in
      select mem.user_id, c.name, c.xp_reward, c.position
      from public.journey_expedition_members mem
      join public.journey_checkpoints c on c.id = cp.checkpoint_id
      where mem.expedition_id = e.id and mem.is_active
      order by mem.user_id
    loop
      if m.position > 0 then
        perform app_private.award_xp(m.user_id, m.xp_reward, 'journey_checkpoint', 'checkpoint:' || e.id || ':' || cp.checkpoint_id);
        perform app_private.notify(
          m.user_id, 'journey_checkpoint', format('Checkpoint reached: %s', m.name),
          format('Your expedition on %s reached %s.', j.title, m.name),
          jsonb_build_object('expedition_id', e.id, 'journey_slug', j.slug, 'checkpoint_id', cp.checkpoint_id),
          null, 'checkpoint:' || e.id || ':' || cp.checkpoint_id
        );
      end if;
    end loop;
  end loop;

  if e.status = 'active' and e.progress_m >= j.total_distance_m then
    update public.journey_expeditions set status = 'completed', completed_at = now() where id = e.id;
    for m in
      select mem.user_id from public.journey_expedition_members mem
      where mem.expedition_id = e.id and mem.is_active
      order by mem.user_id
    loop
      update public.journey_expedition_members set is_active = false where expedition_id = e.id and user_id = m.user_id;
      perform app_private.award_xp(m.user_id, j.completion_xp, 'journey_completed', 'journey:' || e.id);
      if j.reward_theme_id is not null then
        perform app_private.unlock_theme(m.user_id, j.reward_theme_id, 'journey:' || e.id);
      end if;
      perform app_private.notify(
        m.user_id, 'journey_completed', format('%s complete!', j.title),
        format('You finished the %s journey. A new chapter awaits.', j.title),
        jsonb_build_object('expedition_id', e.id, 'journey_slug', j.slug), null, 'journey:' || e.id
      );
      if p_actor is distinct from m.user_id then
        perform app_private.evaluate_rewards(m.user_id, null);
      end if;
    end loop;
  end if;
end;
$$;

create or replace function app_private.process_activity_journeys(p_activity uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.activities;
  r record;
  e public.journey_expeditions;
begin
  select * into a from public.activities where id = p_activity;
  if not found or not a.is_eligible or a.distance_m <= 0 then
    return;
  end if;
  for r in
    select mem.expedition_id
    from public.journey_expedition_members mem
    join public.journeys j on j.id = mem.journey_id
    where mem.user_id = a.user_id
      and mem.is_active
      and a.type = any (j.activity_types)
      and (j.allow_manual or a.source = 'gps')
      -- Journey rule: only activities that started after joining the expedition move the marker.
      and a.started_at >= mem.joined_at
    order by mem.expedition_id
  loop
    select * into e from public.journey_expeditions where id = r.expedition_id for update;
    if e.status <> 'active' then
      continue;
    end if;
    insert into public.journey_contributions (expedition_id, user_id, activity_id, value_m)
    values (e.id, a.user_id, a.id, a.distance_m)
    on conflict (expedition_id, activity_id) do nothing;
    if found then
      perform app_private.after_expedition_progress(e.id, a.id, p_actor);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity pipeline
-- ---------------------------------------------------------------------------

create or replace function app_private.process_activity(p_activity uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if not found then
    return;
  end if;
  perform app_private.process_activity_challenges(a.id, a.user_id);
  perform app_private.process_activity_journeys(a.id, a.user_id);
  perform app_private.recompute_activity_xp(a.user_id, a.local_date);
  perform app_private.refresh_user_stats(a.user_id);
  perform app_private.evaluate_rewards(a.user_id, a.id);
end;
$$;

-- Removes an activity's contributions wherever results are not final yet. Finalized challenges and
-- completed expeditions keep their history.
create or replace function app_private.retract_activity(p_activity uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.challenges c
  where c.id in (select cc.challenge_id from public.challenge_contributions cc where cc.activity_id = p_activity)
  order by c.id
  for update;

  delete from public.challenge_contributions cc
  using public.challenges c
  where cc.activity_id = p_activity
    and c.id = cc.challenge_id
    and app_private.challenge_submission_open(c);

  perform 1 from public.journey_expeditions e
  where e.id in (select jc.expedition_id from public.journey_contributions jc where jc.activity_id = p_activity)
  order by e.id
  for update;

  delete from public.journey_contributions jc
  using public.journey_expeditions e
  where jc.activity_id = p_activity
    and e.id = jc.expedition_id
    and e.status = 'active';
end;
$$;

create or replace function app_private.personal_records(p_activity uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.activities;
  prev_distance integer;
  prev_duration integer;
  prev_speed double precision;
  records jsonb := '[]';
begin
  select * into a from public.activities where id = p_activity;
  if not found or not a.is_eligible then
    return records;
  end if;
  select max(distance_m), max(moving_time_s),
         max(avg_speed_mps) filter (where distance_m >= 1000)
    into prev_distance, prev_duration, prev_speed
  from public.activities
  where user_id = a.user_id and type = a.type and is_eligible and id <> a.id;

  if a.distance_m > 0 and a.distance_m > coalesce(prev_distance, 0) then
    records := records || jsonb_build_array(jsonb_build_object('kind', 'longest_distance', 'value', a.distance_m, 'previous', prev_distance));
  end if;
  if a.moving_time_s > coalesce(prev_duration, 0) then
    records := records || jsonb_build_array(jsonb_build_object('kind', 'longest_duration', 'value', a.moving_time_s, 'previous', prev_duration));
  end if;
  if a.distance_m >= 1000 and prev_speed is not null and a.avg_speed_mps > prev_speed then
    records := records || jsonb_build_array(jsonb_build_object('kind', 'fastest_pace', 'value', a.avg_speed_mps, 'previous', prev_speed));
  end if;
  return records;
end;
$$;

-- Builds the post-save summary. Rows written by this transaction carry now() as their timestamp,
-- which is how "unlocked by this save" is distinguished from older history.
create or replace function app_private.build_activity_summary(p_activity uuid, p_xp_before bigint, p_level_before integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.activities;
  x public.user_xp;
begin
  select * into a from public.activities where id = p_activity;
  select * into x from public.user_xp where user_id = a.user_id;
  return jsonb_build_object(
    'activity_id', a.id,
    'is_eligible', a.is_eligible,
    'ineligible_reason', a.ineligible_reason,
    'distance_m', a.distance_m,
    'moving_time_s', a.moving_time_s,
    'xp_gained', greatest(0, coalesce(x.xp_total, 0) - coalesce(p_xp_before, 0)),
    'xp_total', coalesce(x.xp_total, 0),
    'level_before', coalesce(p_level_before, 1),
    'level_after', coalesce(x.level, 1),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'challenge_id', c.id,
        'title', c.title,
        'mode', c.mode,
        'metric', c.metric,
        'value', cc.value,
        'progress_value', case
          when c.mode = 'collaborative' then c.total_progress
          when c.mode = 'team' then coalesce(t.total_progress, cp.progress_value)
          else cp.progress_value
        end,
        'personal_value', cp.progress_value,
        'target_value', c.target_value,
        'completed', cp.completed_at is not null,
        'completed_now', coalesce(cp.completed_at = now(), false)
      ) order by c.title)
      from public.challenge_contributions cc
      join public.challenges c on c.id = cc.challenge_id
      join public.challenge_participants cp on cp.challenge_id = cc.challenge_id and cp.user_id = cc.user_id
      left join public.challenge_teams t on t.id = cp.team_id
      where cc.activity_id = a.id
    ), '[]'),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'expedition_id', e.id,
        'journey_slug', j.slug,
        'journey_title', j.title,
        'mode', e.mode,
        'value_m', jc.value_m,
        'progress_m', e.progress_m,
        'total_m', j.total_distance_m,
        'completed_now', coalesce(e.completed_at = now(), false),
        'checkpoints', coalesce((
          select jsonb_agg(ck.name order by ck.position)
          from public.expedition_checkpoint_unlocks u
          join public.journey_checkpoints ck on ck.id = u.checkpoint_id
          where u.expedition_id = e.id and u.activity_id = a.id and ck.position > 0
        ), '[]')
      ) order by j.title)
      from public.journey_contributions jc
      join public.journey_expeditions e on e.id = jc.expedition_id
      join public.journeys j on j.id = e.journey_id
      where jc.activity_id = a.id
    ), '[]'),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('id', ac.id, 'title', ac.title, 'icon', ac.icon, 'tier', ac.tier) order by ac.sort_order)
      from public.user_achievements ua
      join public.achievements ac on ac.id = ua.achievement_id
      where ua.user_id = a.user_id and ua.earned_at = now()
    ), '[]'),
    'themes', coalesce((
      select jsonb_agg(jsonb_build_object('id', th.id, 'name', th.name) order by th.sort_order)
      from public.user_unlocked_themes ut
      join public.themes th on th.id = ut.theme_id
      where ut.user_id = a.user_id and ut.unlocked_at = now() and ut.source <> 'default'
    ), '[]'),
    'personal_records', app_private.personal_records(a.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  tz text := coalesce(meta ->> 'timezone', 'UTC');
begin
  base := lower(regexp_replace(coalesce(meta ->> 'username', split_part(coalesce(new.email, ''), '@', 1), ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then
    base := 'explorer';
  end if;
  base := substr(base, 1, 18);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base || '_' || suffix::text;
  end loop;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate,
    coalesce(nullif(btrim(substr(meta ->> 'display_name', 1, 50)), ''), nullif(btrim(substr(meta ->> 'full_name', 1, 50)), ''), initcap(base))
  );
  insert into public.user_settings (user_id, timezone) values (new.id, tz);
  insert into public.user_stats (user_id) values (new.id);
  insert into public.user_xp (user_id) values (new.id);
  perform app_private.evaluate_theme_unlocks(new.id);
  update public.profiles p set equipped_theme_id = (
    select t.id from public.themes t
    join public.user_unlocked_themes u on u.theme_id = t.id and u.user_id = new.id
    where t.unlock_rule ->> 'type' = 'default'
    order by t.sort_order limit 1
  ) where p.id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();
