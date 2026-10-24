-- Public RPC surface. These are the only write paths available to app users; every function
-- re-derives the caller from the JWT (auth.uid()) and never trusts client-provided identities,
-- totals, ranks or rewards.

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------

create or replace function app_private.lock_user(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.user_stats where user_id = uid for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Your profile is not set up yet.';
  end if;
end;
$$;

create or replace function app_private.validate_activity_metrics(
  p_type public.activity_type,
  p_started_at timestamptz,
  p_elapsed_time_s integer,
  p_moving_time_s integer,
  p_distance_m integer,
  p_elevation_gain_m integer
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_started_at is null then
    raise exception using errcode = '22023', message = 'A start time is required.';
  end if;
  if p_elapsed_time_s is null or p_elapsed_time_s < 30 or p_elapsed_time_s > 259200 then
    raise exception using errcode = '22023', message = 'Elapsed time must be between 30 seconds and 72 hours.';
  end if;
  if p_moving_time_s is null or p_moving_time_s < 30 or p_moving_time_s > 172800 then
    raise exception using errcode = '22023', message = 'Moving time must be between 30 seconds and 48 hours.';
  end if;
  if p_moving_time_s > p_elapsed_time_s then
    raise exception using errcode = '22023', message = 'Moving time cannot exceed elapsed time.';
  end if;
  if p_started_at + make_interval(secs => p_elapsed_time_s) > now() + interval '10 minutes' then
    raise exception using errcode = '22023', message = 'Activities cannot end in the future.';
  end if;
  if p_started_at < now() - interval '365 days' then
    raise exception using errcode = '22023', message = 'Activities older than one year cannot be added.';
  end if;
  if p_distance_m is null or p_distance_m < 0 or p_distance_m > app_private.max_distance_m(p_type) then
    raise exception using errcode = '22023',
      message = format('Distance must be between 0 and %s km for this activity type.', app_private.max_distance_m(p_type) / 1000);
  end if;
  if p_elevation_gain_m is not null and (p_elevation_gain_m < 0 or p_elevation_gain_m > 20000) then
    raise exception using errcode = '22023', message = 'Elevation gain must be between 0 and 20,000 m.';
  end if;
end;
$$;

create or replace function public.submit_activity(
  p_client_id uuid,
  p_type public.activity_type,
  p_source public.activity_source,
  p_started_at timestamptz,
  p_elapsed_time_s integer,
  p_moving_time_s integer,
  p_distance_m integer default 0,
  p_title text default null,
  p_description text default null,
  p_visibility public.visibility default null,
  p_elevation_gain_m integer default null,
  p_timezone text default null,
  p_route jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  existing uuid;
  stored jsonb;
  s public.user_settings;
  tz text;
  v_distance integer;
  v_points integer := 0;
  v_ended timestamptz;
  v_problem text;
  act public.activities;
  xp_before bigint;
  level_before integer;
  summary jsonb;
begin
  if p_client_id is null then
    raise exception using errcode = '22023', message = 'client_id is required for idempotent submission.';
  end if;

  perform app_private.lock_user(uid);

  -- Idempotency: a retried submission returns the original result instead of saving twice.
  select id into existing from public.activities where user_id = uid and client_id = p_client_id;
  if existing is not null then
    select ap.summary into stored from public.activity_processing ap where ap.activity_id = existing;
    return coalesce(stored, jsonb_build_object('activity_id', existing)) || jsonb_build_object('replayed', true);
  end if;

  select * into s from public.user_settings where user_id = uid;
  tz := coalesce(nullif(p_timezone, ''), s.timezone, 'UTC');
  perform app_private.assert_valid_timezone(tz);

  if p_source = 'gps' then
    if p_type not in ('run', 'walk', 'ride', 'hike') then
      raise exception using errcode = '22023', message = 'GPS recording is only available for outdoor runs, walks, rides and hikes.';
    end if;
    v_ended := p_started_at + make_interval(secs => coalesce(p_elapsed_time_s, 0));
    v_points := app_private.assert_valid_route(p_route, p_started_at, v_ended);
    -- The server recomputes distance from the samples; the client's figure is not trusted.
    v_distance := app_private.route_distance_m(p_route, p_type);
  else
    if p_route is not null then
      raise exception using errcode = '22023', message = 'Manually logged activities cannot include a GPS route.';
    end if;
    v_distance := coalesce(p_distance_m, 0);
  end if;

  perform app_private.validate_activity_metrics(p_type, p_started_at, p_elapsed_time_s, p_moving_time_s, v_distance, p_elevation_gain_m);
  v_problem := app_private.eligibility_problem(p_type, v_distance, p_moving_time_s);

  if p_title is not null and char_length(btrim(p_title)) > 100 then
    raise exception using errcode = '22023', message = 'Title must be 100 characters or fewer.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception using errcode = '22023', message = 'Description must be 2,000 characters or fewer.';
  end if;

  select x.xp_total, x.level into xp_before, level_before from public.user_xp x where x.user_id = uid;

  insert into public.activities (
    user_id, client_id, type, source, title, description, visibility, started_at, ended_at, timezone, local_date,
    distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, has_route, is_eligible, ineligible_reason
  )
  values (
    uid, p_client_id, p_type, p_source,
    coalesce(nullif(btrim(p_title), ''), app_private.default_activity_title(p_type, p_started_at, tz)),
    nullif(btrim(p_description), ''),
    coalesce(p_visibility, s.default_activity_visibility, 'friends'),
    p_started_at,
    p_started_at + make_interval(secs => p_elapsed_time_s),
    tz,
    (p_started_at at time zone tz)::date,
    v_distance, p_moving_time_s, p_elapsed_time_s, p_elevation_gain_m,
    p_source = 'gps',
    v_problem is null,
    v_problem
  )
  returning * into act;

  if p_source = 'gps' then
    insert into public.activity_routes (activity_id, user_id, points, point_count)
    values (act.id, uid, p_route, v_points);
    if coalesce(s.share_routes, true) then
      update public.activities
        set route_preview = app_private.build_route_preview(p_route, coalesce(s.hide_route_endpoints, true))
        where id = act.id;
    end if;
  end if;

  perform app_private.process_activity(act.id);
  summary := app_private.build_activity_summary(act.id, xp_before, level_before);
  insert into public.activity_processing (activity_id, user_id, summary) values (act.id, uid, summary);
  return summary || jsonb_build_object('replayed', false);
end;
$$;

-- Patchable keys: title, description, visibility, type; plus started_at, moving_time_s,
-- elapsed_time_s, distance_m, elevation_gain_m for manually logged activities only.
create or replace function public.update_activity(p_activity_id uuid, p_patch jsonb)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  a public.activities;
  allowed text[] := array['title', 'description', 'visibility', 'type', 'started_at', 'moving_time_s', 'elapsed_time_s', 'distance_m', 'elevation_gain_m'];
  metric_keys text[] := array['started_at', 'moving_time_s', 'elapsed_time_s', 'distance_m', 'elevation_gain_m'];
  k text;
  n_type public.activity_type;
  n_started timestamptz;
  n_moving integer;
  n_elapsed integer;
  n_distance integer;
  n_elev integer;
  n_title text;
  n_description text;
  n_visibility public.visibility;
  n_problem text;
  metrics_changed boolean;
  old_date date;
  result public.activities;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Patch must be a JSON object.';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then
      raise exception using errcode = '22023', message = format('Field "%s" cannot be edited.', k);
    end if;
  end loop;

  perform app_private.lock_user(uid);
  select * into a from public.activities where id = p_activity_id and user_id = uid for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;

  if a.source = 'gps' and exists (select 1 from jsonb_object_keys(p_patch) key where key = any (metric_keys)) then
    raise exception using errcode = '22023', message = 'Distance and time of GPS-recorded activities come from the recording and cannot be edited.';
  end if;

  n_type := coalesce((p_patch ->> 'type')::public.activity_type, a.type);
  if a.source = 'gps' and n_type not in ('run', 'walk', 'ride', 'hike') then
    raise exception using errcode = '22023', message = 'GPS activities can only be runs, walks, rides or hikes.';
  end if;
  n_started := coalesce((p_patch ->> 'started_at')::timestamptz, a.started_at);
  n_moving := coalesce((p_patch ->> 'moving_time_s')::integer, a.moving_time_s);
  n_elapsed := coalesce((p_patch ->> 'elapsed_time_s')::integer, greatest(a.elapsed_time_s, n_moving));
  n_distance := coalesce((p_patch ->> 'distance_m')::integer, a.distance_m);
  n_elev := case when p_patch ? 'elevation_gain_m' then (p_patch ->> 'elevation_gain_m')::integer else a.elevation_gain_m end;
  n_title := case when p_patch ? 'title' then coalesce(nullif(btrim(p_patch ->> 'title'), ''), a.title) else a.title end;
  n_description := case when p_patch ? 'description' then nullif(btrim(p_patch ->> 'description'), '') else a.description end;
  n_visibility := coalesce((p_patch ->> 'visibility')::public.visibility, a.visibility);

  if char_length(n_title) > 100 then
    raise exception using errcode = '22023', message = 'Title must be 100 characters or fewer.';
  end if;

  metrics_changed := n_type <> a.type or n_started <> a.started_at or n_moving <> a.moving_time_s
    or n_elapsed <> a.elapsed_time_s or n_distance <> a.distance_m;

  if metrics_changed then
    -- Started-at may stay in the past even though the original was saved long ago.
    if a.source = 'manual' then
      perform app_private.validate_activity_metrics(n_type, n_started, n_elapsed, n_moving, n_distance, n_elev);
    end if;
    perform app_private.retract_activity(a.id);
  end if;

  n_problem := app_private.eligibility_problem(n_type, n_distance, n_moving);
  old_date := a.local_date;

  update public.activities set
    type = n_type,
    started_at = n_started,
    ended_at = n_started + make_interval(secs => n_elapsed),
    local_date = (n_started at time zone a.timezone)::date,
    moving_time_s = n_moving,
    elapsed_time_s = n_elapsed,
    distance_m = n_distance,
    elevation_gain_m = n_elev,
    title = n_title,
    description = n_description,
    visibility = n_visibility,
    is_eligible = n_problem is null,
    ineligible_reason = n_problem
  where id = a.id
  returning * into result;

  if metrics_changed then
    perform app_private.process_activity(a.id);
    if old_date <> result.local_date then
      perform app_private.recompute_activity_xp(uid, old_date);
    end if;
  end if;
  return result;
end;
$$;

create or replace function public.delete_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  a public.activities;
begin
  perform app_private.lock_user(uid);
  select * into a from public.activities where id = p_activity_id and user_id = uid for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  perform app_private.retract_activity(a.id);
  delete from public.activities where id = a.id;
  perform app_private.recompute_activity_xp(uid, a.local_date);
  perform app_private.refresh_user_stats(uid);
end;
$$;

-- Permanently deletes the raw GPS samples and the published preview; stats are kept.
create or replace function public.remove_activity_route(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  update public.activities set route_preview = null, has_route = false
    where id = p_activity_id and user_id = uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  delete from public.activity_routes where activity_id = p_activity_id and user_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity statistics and records
-- ---------------------------------------------------------------------------

create or replace function public.get_activity_stats(
  p_from date,
  p_to date,
  p_bucket text default 'week',
  p_types public.activity_type[] default null
)
returns table (bucket_start date, distance_m bigint, moving_time_s bigint, activity_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  if p_bucket not in ('day', 'week', 'month') then
    raise exception using errcode = '22023', message = 'Bucket must be day, week or month.';
  end if;
  if p_to < p_from or p_to - p_from > 800 then
    raise exception using errcode = '22023', message = 'Invalid date range.';
  end if;
  return query
  with buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from::timestamp),
      date_trunc(p_bucket, p_to::timestamp),
      ('1 ' || p_bucket)::interval
    )::date as b
  )
  select b.b,
         coalesce(sum(a.distance_m), 0)::bigint,
         coalesce(sum(a.moving_time_s), 0)::bigint,
         count(a.id)::integer
  from buckets b
  left join public.activities a
    on a.user_id = uid and a.is_eligible
   and a.local_date between p_from and p_to
   and date_trunc(p_bucket, a.local_date::timestamp)::date = b.b
   and (p_types is null or a.type = any (p_types))
  group by b.b
  order by b.b;
end;
$$;

create or replace function public.get_personal_records()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select * from public.activities where user_id = auth.uid() and is_eligible
  )
  select coalesce(jsonb_agg(r order by r ->> 'type'), '[]')
  from (
    select jsonb_build_object(
      'type', t.type,
      'longest_distance', (select jsonb_build_object('activity_id', id, 'value', distance_m, 'at', started_at)
                           from mine m where m.type = t.type and m.distance_m > 0 order by distance_m desc, started_at limit 1),
      'longest_duration', (select jsonb_build_object('activity_id', id, 'value', moving_time_s, 'at', started_at)
                           from mine m where m.type = t.type order by moving_time_s desc, started_at limit 1),
      'fastest_pace', (select jsonb_build_object('activity_id', id, 'value', avg_speed_mps, 'at', started_at)
                       from mine m where m.type = t.type and m.distance_m >= 1000 order by avg_speed_mps desc, started_at limit 1)
    ) as r
    from (select distinct type from mine) t
  ) x;
$$;

-- Weekly / monthly / all-time rankings. Only non-private, eligible activities count, and only
-- people the caller may see (friends, or public profiles for the global scope).
create or replace function public.get_leaderboard(
  p_period text default 'week',
  p_scope text default 'friends',
  p_metric public.challenge_metric default 'distance',
  p_limit integer default 50
)
returns table (
  rank bigint, user_id uuid, username text, display_name text, avatar_url text,
  level integer, value bigint, is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  tz text;
  from_ts timestamptz;
begin
  if p_period not in ('week', 'month', 'all') or p_scope not in ('friends', 'global') then
    raise exception using errcode = '22023', message = 'Invalid leaderboard parameters.';
  end if;
  select timezone into tz from public.user_settings where user_settings.user_id = uid;
  tz := coalesce(tz, 'UTC');
  from_ts := case p_period
    when 'all' then '-infinity'::timestamptz
    else date_trunc(p_period, now() at time zone tz) at time zone tz
  end;

  return query
  with people as (
    select uid as pid
    union
    select case when f.user_low = uid then f.user_high else f.user_low end
    from public.friendships f
    where (f.user_low = uid or f.user_high = uid) and f.status = 'accepted'
    union
    select p.id from public.profiles p
    where p_scope = 'global' and p.profile_visibility = 'public'
  ),
  visible as (
    select pe.pid from people pe
    join public.profiles p on p.id = pe.pid
    where pe.pid = uid
       or (p.profile_visibility <> 'private' and not app_private.is_blocked_between(uid, pe.pid))
  ),
  totals as (
    select a.user_id as pid,
           sum(app_private.metric_value(a.distance_m, a.moving_time_s, p_metric))::bigint as v,
           max(a.started_at) as last_at
    from public.activities a
    join visible v on v.pid = a.user_id
    where a.is_eligible and a.visibility <> 'private' and a.started_at >= from_ts
    group by a.user_id
  ),
  ranked as (
    select t.pid, t.v, rank() over (order by t.v desc) as rnk, t.last_at
    from totals t
  )
  select r.rnk, p.id, p.username, p.display_name, p.avatar_url, coalesce(x.level, 1), r.v, p.id = uid
  from ranked r
  join public.profiles p on p.id = r.pid
  left join public.user_xp x on x.user_id = p.id
  where r.rnk <= greatest(1, least(p_limit, 200)) or p.id = uid
  order by r.rnk, r.last_at, p.username;
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create or replace function app_private.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- Payload keys: title, description, mode, metric, target_value, activity_types[], allow_manual,
-- period, recurrence, timezone, starts_at, ends_at, visibility, retroactive, join_deadline,
-- max_participants, teams[{name,color}], cover_art.
create or replace function public.create_challenge(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  v_mode public.challenge_mode := (p ->> 'mode')::public.challenge_mode;
  v_metric public.challenge_metric := (p ->> 'metric')::public.challenge_metric;
  v_period public.challenge_period := coalesce((p ->> 'period')::public.challenge_period, 'custom');
  v_recurrence public.challenge_recurrence := coalesce((p ->> 'recurrence')::public.challenge_recurrence, 'none');
  v_tz text := coalesce(nullif(p ->> 'timezone', ''), 'UTC');
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_ends timestamptz := (p ->> 'ends_at')::timestamptz;
  v_visibility public.challenge_visibility := coalesce((p ->> 'visibility')::public.challenge_visibility, 'public');
  v_target bigint := (p ->> 'target_value')::bigint;
  v_types public.activity_type[];
  v_id uuid;
  v_series uuid;
  t jsonb;
  team_count integer := 0;
  first_team uuid;
  active_created integer;
begin
  if v_mode is null or v_metric is null then
    raise exception using errcode = '22023', message = 'Mode and metric are required.';
  end if;
  perform app_private.assert_valid_timezone(v_tz);
  if p -> 'activity_types' is null or jsonb_typeof(p -> 'activity_types') <> 'array' or jsonb_array_length(p -> 'activity_types') = 0 then
    raise exception using errcode = '22023', message = 'Pick at least one activity type.';
  end if;
  v_types := array(select distinct jsonb_array_elements_text(p -> 'activity_types'))::public.activity_type[];

  select count(*) into active_created from public.challenges
  where created_by = uid and ends_at > now();
  if active_created >= 20 then
    raise exception using errcode = '54000', message = 'You can run up to 20 active challenges you created at a time.';
  end if;

  if v_recurrence <> 'none' then
    -- Recurring challenges are aligned to calendar periods in their time zone.
    v_starts := app_private.period_start(v_recurrence, coalesce(v_starts, now()), v_tz);
    v_ends := ((v_starts at time zone v_tz) + app_private.period_step(v_recurrence)) at time zone v_tz;
    v_period := case v_recurrence when 'weekly' then 'weekly' when 'monthly' then 'monthly' else 'yearly' end;
    v_series := gen_random_uuid();
  end if;

  if v_starts is null or v_ends is null then
    raise exception using errcode = '22023', message = 'Start and end dates are required.';
  end if;
  if v_ends <= v_starts then
    raise exception using errcode = '22023', message = 'The challenge must end after it starts.';
  end if;
  if v_ends <= now() then
    raise exception using errcode = '22023', message = 'The challenge must end in the future.';
  end if;
  -- Recurring challenges are aligned to the current calendar period, which may have begun earlier.
  if v_recurrence = 'none' and v_starts < now() - interval '31 days' then
    raise exception using errcode = '22023', message = 'The challenge cannot start more than 31 days in the past.';
  end if;
  if v_ends - v_starts > interval '367 days' then
    raise exception using errcode = '22023', message = 'Challenges can last at most one year.';
  end if;
  if v_mode in ('individual', 'collaborative') and (v_target is null or v_target <= 0) then
    raise exception using errcode = '22023', message = 'This challenge type needs a goal.';
  end if;
  if v_target is not null and v_target <= 0 then
    raise exception using errcode = '22023', message = 'The goal must be greater than zero.';
  end if;
  if v_target is not null and (
       (v_metric = 'distance' and v_target > 100000000)
    or (v_metric = 'duration' and v_target > 36000000)
    or (v_metric = 'count' and v_target > 10000)) then
    raise exception using errcode = '22023', message = 'The goal is unrealistically large.';
  end if;

  insert into public.challenges (
    series_id, title, description, category, cover_art, created_by, visibility, invite_code, mode, metric,
    target_value, activity_types, allow_manual, period, recurrence, timezone, starts_at, ends_at,
    join_deadline, retroactive, max_participants, xp_reward
  )
  values (
    v_series,
    btrim(p ->> 'title'),
    nullif(btrim(p ->> 'description'), ''),
    'community',
    coalesce(nullif(p ->> 'cover_art', ''), 'trailhead'),
    uid,
    v_visibility,
    case when v_visibility = 'private' then app_private.new_invite_code() end,
    v_mode, v_metric, v_target, v_types,
    coalesce((p ->> 'allow_manual')::boolean, true),
    v_period, v_recurrence, v_tz, v_starts, v_ends,
    (p ->> 'join_deadline')::timestamptz,
    coalesce((p ->> 'retroactive')::boolean, true),
    (p ->> 'max_participants')::integer,
    -- User-created challenges award a modest, fixed XP so creators cannot mint rewards.
    case when v_target is null then 0 else 75 end
  )
  returning id into v_id;

  if v_mode = 'team' then
    if p -> 'teams' is null or jsonb_typeof(p -> 'teams') <> 'array' then
      raise exception using errcode = '22023', message = 'Team challenges need at least two teams.';
    end if;
    for t in select value from jsonb_array_elements(p -> 'teams') loop
      insert into public.challenge_teams (challenge_id, name, color)
      values (v_id, btrim(t ->> 'name'), coalesce(t ->> 'color', '#4F8EF7'))
      returning id into first_team;
      team_count := team_count + 1;
    end loop;
    if team_count < 2 or team_count > 6 then
      raise exception using errcode = '22023', message = 'Team challenges need between two and six teams.';
    end if;
    select id into first_team from public.challenge_teams where challenge_id = v_id order by created_at, name limit 1;
  end if;

  -- The creator joins automatically.
  insert into public.challenge_participants (challenge_id, user_id, team_id) values (v_id, uid, first_team);
  perform app_private.backfill_challenge(v_id, uid);
  return v_id;
end;
$$;

create or replace function public.join_challenge(p_challenge_id uuid, p_team_id uuid default null, p_invite_code text default null)
returns public.challenge_participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  c public.challenges;
  existing public.challenge_participants;
  v_team uuid := p_team_id;
  has_invite boolean;
  result public.challenge_participants;
begin
  perform app_private.lock_user(uid);
  select * into c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Challenge not found.';
  end if;

  select * into existing from public.challenge_participants where challenge_id = c.id and user_id = uid;
  if found then
    return existing;
  end if;

  select exists (
    select 1 from public.invitations i
    where i.challenge_id = c.id and i.invitee_id = uid and i.status = 'pending' and i.expires_at > now()
  ) into has_invite;

  if c.visibility = 'private' and c.created_by is distinct from uid and not has_invite
     and (p_invite_code is null or upper(btrim(p_invite_code)) <> c.invite_code) then
    raise exception using errcode = '42501', message = 'This challenge is invite-only.';
  end if;
  if c.created_by is not null and app_private.is_blocked_between(uid, c.created_by) then
    raise exception using errcode = '42501', message = 'You cannot join this challenge.';
  end if;
  if now() >= c.ends_at then
    raise exception using errcode = '22023', message = 'This challenge has already ended.';
  end if;
  if c.join_deadline is not null and now() > c.join_deadline then
    raise exception using errcode = '22023', message = 'The joining deadline for this challenge has passed.';
  end if;
  if c.max_participants is not null and c.participant_count >= c.max_participants then
    raise exception using errcode = '22023', message = 'This challenge is full.';
  end if;

  if c.mode = 'team' then
    if v_team is null then
      -- Auto-balance: smallest team first.
      select id into v_team from public.challenge_teams
      where challenge_id = c.id order by member_count, name limit 1;
    elsif not exists (select 1 from public.challenge_teams where id = v_team and challenge_id = c.id) then
      raise exception using errcode = '22023', message = 'That team does not belong to this challenge.';
    end if;
    perform 1 from public.challenge_teams where id = v_team for update;
  else
    v_team := null;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, team_id)
  values (c.id, uid, v_team)
  returning * into result;

  update public.invitations set status = 'accepted', responded_at = now()
  where challenge_id = c.id and invitee_id = uid and status = 'pending';

  perform app_private.backfill_challenge(c.id, uid);
  perform app_private.evaluate_rewards(uid, null);

  select * into result from public.challenge_participants where challenge_id = c.id and user_id = uid;
  return result;
end;
$$;

create or replace function public.join_challenge_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  perform app_private.require_user();
  select id into cid from public.challenges where invite_code = upper(btrim(p_code));
  if cid is null then
    raise exception using errcode = 'P0002', message = 'That invite code is not valid.';
  end if;
  perform public.join_challenge(cid, null, p_code);
  return cid;
end;
$$;

-- Leaving withdraws your contributions from the challenge totals. A shared goal that was already
-- reached stays reached. Results are final once the challenge has ended.
create or replace function public.leave_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  c public.challenges;
begin
  perform app_private.lock_user(uid);
  select * into c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Challenge not found.';
  end if;
  if now() >= c.ends_at then
    raise exception using errcode = '22023', message = 'You cannot leave a challenge after it has ended.';
  end if;
  perform 1 from public.challenge_teams t
    where t.id = (select team_id from public.challenge_participants where challenge_id = c.id and user_id = uid)
    for update;
  delete from public.challenge_participants where challenge_id = c.id and user_id = uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'You are not part of this challenge.';
  end if;
end;
$$;

create or replace function public.get_challenge_leaderboard(
  p_challenge_id uuid,
  p_scope text default 'all',
  p_limit integer default 50
)
returns table (
  rank bigint, user_id uuid, username text, display_name text, avatar_url text, level integer,
  team_id uuid, value bigint, completed_at timestamptz, is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  if not app_private.can_view_challenge(uid, p_challenge_id) then
    raise exception using errcode = 'P0002', message = 'Challenge not found.';
  end if;
  return query
  with ranked as (
    select cp.*,
           rank() over (order by cp.progress_value desc) as rnk
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and (cp.user_id = uid or not app_private.is_blocked_between(uid, cp.user_id))
      and (p_scope = 'all' or cp.user_id = uid or app_private.are_friends(uid, cp.user_id))
  )
  select r.rnk, p.id, p.username, p.display_name, p.avatar_url, coalesce(x.level, 1),
         r.team_id, r.progress_value, r.completed_at, p.id = uid
  from ranked r
  join public.profiles p on p.id = r.user_id
  left join public.user_xp x on x.user_id = p.id
  where r.rnk <= greatest(1, least(p_limit, 500)) or p.id = uid
  order by r.rnk, r.last_progress_at nulls last, p.username;
end;
$$;

create or replace function public.invite_to_challenge(p_challenge_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  c public.challenges;
  target uuid;
  inviter_name text;
  n integer := 0;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if not found or not app_private.is_challenge_participant(uid, c.id) then
    raise exception using errcode = '42501', message = 'Only participants can invite friends.';
  end if;
  if now() >= c.ends_at then
    raise exception using errcode = '22023', message = 'This challenge has ended.';
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 50 then
    raise exception using errcode = '22023', message = 'You can invite up to 50 people at once.';
  end if;
  select display_name into inviter_name from public.profiles where id = uid;
  foreach target in array coalesce(p_user_ids, '{}') loop
    if target = uid or not app_private.are_friends(uid, target)
       or app_private.is_challenge_participant(target, c.id) then
      continue;
    end if;
    insert into public.invitations (kind, challenge_id, inviter_id, invitee_id)
    values ('challenge', c.id, uid, target)
    on conflict do nothing;
    if found then
      n := n + 1;
      perform app_private.notify(
        target, 'challenge_invite', 'Challenge invitation',
        format('%s invited you to join %s.', inviter_name, c.title),
        jsonb_build_object('challenge_id', c.id), uid, null
      );
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.respond_invitation(p_invitation_id uuid, p_accept boolean, p_team_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation_id and invitee_id = uid for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found.';
  end if;
  if inv.status <> 'pending' then
    raise exception using errcode = '22023', message = 'This invitation has already been answered.';
  end if;
  if inv.expires_at <= now() then
    raise exception using errcode = '22023', message = 'This invitation has expired.';
  end if;
  if not p_accept then
    update public.invitations set status = 'declined', responded_at = now() where id = inv.id;
    return jsonb_build_object('status', 'declined');
  end if;
  if inv.kind = 'challenge' then
    perform public.join_challenge(inv.challenge_id, p_team_id, null);
    return jsonb_build_object('status', 'accepted', 'challenge_id', inv.challenge_id);
  else
    perform public.join_expedition(inv.expedition_id, null);
    return jsonb_build_object('status', 'accepted', 'expedition_id', inv.expedition_id);
  end if;
end;
$$;

-- Cheap housekeeping the app calls when opening challenge screens: rolls recurring series into the
-- current period and finalizes challenges whose submission window closed. Safe to call concurrently.
create or replace function public.refresh_challenges()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rolled integer;
  finalized integer;
begin
  perform app_private.require_user();
  rolled := app_private.roll_recurring_challenges();
  finalized := app_private.finalize_due_challenges(25);
  return jsonb_build_object('rolled', rolled, 'finalized', finalized);
end;
$$;

-- ---------------------------------------------------------------------------
-- Journeys
-- ---------------------------------------------------------------------------

create or replace function public.start_expedition(p_journey_id uuid, p_mode public.journey_mode default 'solo', p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  j public.journeys;
  v_id uuid;
begin
  perform app_private.lock_user(uid);
  select * into j from public.journeys where id = p_journey_id and is_published;
  if not found then
    raise exception using errcode = 'P0002', message = 'Journey not found.';
  end if;
  if (p_mode = 'solo' and not j.supports_solo) or (p_mode = 'group' and not j.supports_group) then
    raise exception using errcode = '22023', message = 'This journey does not support that mode.';
  end if;
  if exists (select 1 from public.journey_expedition_members where user_id = uid and journey_id = j.id and is_active) then
    raise exception using errcode = '23505', message = 'You are already on this journey. Finish or leave it before starting again.';
  end if;

  insert into public.journey_expeditions (journey_id, mode, name, created_by, invite_code)
  values (
    j.id, p_mode,
    case when p_mode = 'group' then coalesce(nullif(btrim(p_name), ''), j.title || ' Party') end,
    uid,
    case when p_mode = 'group' then app_private.new_invite_code() end
  )
  returning id into v_id;

  insert into public.journey_expedition_members (expedition_id, user_id, journey_id) values (v_id, uid, j.id);
  insert into public.expedition_checkpoint_unlocks (expedition_id, checkpoint_id)
  select v_id, c.id from public.journey_checkpoints c where c.journey_id = j.id and c.distance_m = 0
  on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.join_expedition(p_expedition_id uuid default null, p_code text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  e public.journey_expeditions;
  j public.journeys;
  members integer;
  has_invite boolean;
begin
  perform app_private.lock_user(uid);
  if p_expedition_id is null and p_code is not null then
    select id into p_expedition_id from public.journey_expeditions where invite_code = upper(btrim(p_code));
  end if;
  select * into e from public.journey_expeditions where id = p_expedition_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Expedition not found.';
  end if;
  if exists (select 1 from public.journey_expedition_members where expedition_id = e.id and user_id = uid and is_active) then
    return e.id;
  end if;
  if e.mode <> 'group' then
    raise exception using errcode = '42501', message = 'Solo expeditions cannot be joined.';
  end if;
  if e.status <> 'active' then
    raise exception using errcode = '22023', message = 'This expedition is no longer active.';
  end if;
  select exists (
    select 1 from public.invitations i
    where i.expedition_id = e.id and i.invitee_id = uid and i.status = 'pending' and i.expires_at > now()
  ) into has_invite;
  if not has_invite and (p_code is null or upper(btrim(p_code)) <> e.invite_code) then
    raise exception using errcode = '42501', message = 'You need an invitation or invite code to join this expedition.';
  end if;
  select * into j from public.journeys where id = e.journey_id;
  if exists (select 1 from public.journey_expedition_members where user_id = uid and journey_id = j.id and is_active) then
    raise exception using errcode = '23505', message = 'You are already on this journey with another expedition.';
  end if;
  select count(*) into members from public.journey_expedition_members where expedition_id = e.id and is_active;
  if members >= j.max_group_size then
    raise exception using errcode = '22023', message = 'This expedition is full.';
  end if;

  insert into public.journey_expedition_members (expedition_id, user_id, journey_id)
  values (e.id, uid, j.id)
  on conflict (expedition_id, user_id) do update set left_at = null, is_active = true, joined_at = now();

  update public.invitations set status = 'accepted', responded_at = now()
  where expedition_id = e.id and invitee_id = uid and status = 'pending';
  return e.id;
end;
$$;

-- Leaving keeps the distance you already contributed with the party.
create or replace function public.leave_expedition(p_expedition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  e public.journey_expeditions;
begin
  perform app_private.lock_user(uid);
  select * into e from public.journey_expeditions where id = p_expedition_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Expedition not found.';
  end if;
  update public.journey_expedition_members set left_at = now(), is_active = false
  where expedition_id = e.id and user_id = uid and is_active;
  if not found then
    raise exception using errcode = 'P0002', message = 'You are not on this expedition.';
  end if;
  if e.status = 'active' and not exists (
    select 1 from public.journey_expedition_members where expedition_id = e.id and is_active
  ) then
    update public.journey_expeditions set status = 'abandoned' where id = e.id;
  end if;
end;
$$;

create or replace function public.invite_to_expedition(p_expedition_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  e public.journey_expeditions;
  j public.journeys;
  target uuid;
  inviter_name text;
  n integer := 0;
begin
  select * into e from public.journey_expeditions where id = p_expedition_id;
  if not found or not exists (
    select 1 from public.journey_expedition_members where expedition_id = e.id and user_id = uid and is_active
  ) then
    raise exception using errcode = '42501', message = 'Only expedition members can invite friends.';
  end if;
  if e.mode <> 'group' or e.status <> 'active' then
    raise exception using errcode = '22023', message = 'Only active group expeditions accept invitations.';
  end if;
  select * into j from public.journeys where id = e.journey_id;
  select display_name into inviter_name from public.profiles where id = uid;
  foreach target in array coalesce(p_user_ids, '{}') loop
    if target = uid or not app_private.are_friends(uid, target)
       or exists (select 1 from public.journey_expedition_members where expedition_id = e.id and user_id = target and is_active) then
      continue;
    end if;
    insert into public.invitations (kind, expedition_id, inviter_id, invitee_id)
    values ('expedition', e.id, uid, target)
    on conflict do nothing;
    if found then
      n := n + 1;
      perform app_private.notify(
        target, 'expedition_invite', 'Expedition invitation',
        format('%s invited you to travel %s together.', inviter_name, j.title),
        jsonb_build_object('expedition_id', e.id, 'journey_slug', j.slug), uid, null
      );
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------

create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_url text, level integer, friendship text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  q text := lower(btrim(coalesce(p_query, '')));
begin
  if char_length(q) < 2 then
    return;
  end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select p.id, p.username, p.display_name, p.avatar_url, coalesce(x.level, 1),
         case
           when f.status = 'accepted' then 'friends'
           when f.status = 'pending' and f.requested_by = uid then 'outgoing'
           when f.status = 'pending' then 'incoming'
           else 'none'
         end
  from public.profiles p
  left join public.user_xp x on x.user_id = p.id
  left join public.friendships f on f.user_low = least(uid, p.id) and f.user_high = greatest(uid, p.id)
  where p.id <> uid
    and p.onboarding_completed_at is not null
    and (p.profile_visibility <> 'private' or f.status = 'accepted')
    and not app_private.is_blocked_between(uid, p.id)
    and (p.username like q || '%' or lower(p.display_name) like '%' || q || '%')
  order by (p.username = q) desc, (p.username like q || '%') desc, p.username
  limit greatest(1, least(p_limit, 50));
end;
$$;

create or replace function public.send_friend_request(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  f public.friendships;
  me_name text;
begin
  if p_user_id = uid then
    raise exception using errcode = '22023', message = 'You cannot add yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) or app_private.is_blocked_between(uid, p_user_id) then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
  select display_name into me_name from public.profiles where id = uid;
  select * into f from public.friendships where user_low = least(uid, p_user_id) and user_high = greatest(uid, p_user_id) for update;
  if found then
    if f.status = 'accepted' then
      return 'friends';
    end if;
    if f.requested_by = uid then
      return 'outgoing';
    end if;
    -- They already asked us: sending a request back accepts it.
    update public.friendships set status = 'accepted', responded_at = now()
      where user_low = f.user_low and user_high = f.user_high;
    perform app_private.notify(p_user_id, 'friend_accepted', 'New friend', format('%s accepted your friend request.', me_name),
      jsonb_build_object('user_id', uid), uid, 'friend_accepted:' || uid);
    perform app_private.evaluate_rewards(uid, null);
    perform app_private.evaluate_rewards(p_user_id, null);
    return 'friends';
  end if;

  if (select count(*) from public.friendships where requested_by = uid and status = 'pending') >= 100 then
    raise exception using errcode = '54000', message = 'You have too many pending friend requests.';
  end if;
  insert into public.friendships (user_low, user_high, requested_by)
  values (least(uid, p_user_id), greatest(uid, p_user_id), uid);
  perform app_private.notify(p_user_id, 'friend_request', 'Friend request', format('%s wants to be friends.', me_name),
    jsonb_build_object('user_id', uid), uid, 'friend_request:' || uid || ':' || extract(epoch from now())::bigint);
  return 'outgoing';
end;
$$;

create or replace function public.respond_friend_request(p_user_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  f public.friendships;
  me_name text;
begin
  select * into f from public.friendships
  where user_low = least(uid, p_user_id) and user_high = greatest(uid, p_user_id) for update;
  if not found or f.status <> 'pending' or f.requested_by = uid then
    raise exception using errcode = 'P0002', message = 'Friend request not found.';
  end if;
  if not p_accept then
    delete from public.friendships where user_low = f.user_low and user_high = f.user_high;
    return 'none';
  end if;
  update public.friendships set status = 'accepted', responded_at = now()
    where user_low = f.user_low and user_high = f.user_high;
  select display_name into me_name from public.profiles where id = uid;
  perform app_private.notify(p_user_id, 'friend_accepted', 'New friend', format('%s accepted your friend request.', me_name),
    jsonb_build_object('user_id', uid), uid, 'friend_accepted:' || uid);
  perform app_private.evaluate_rewards(uid, null);
  perform app_private.evaluate_rewards(p_user_id, null);
  return 'friends';
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  delete from public.friendships where user_low = least(uid, p_user_id) and user_high = greatest(uid, p_user_id);
end;
$$;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  if p_user_id = uid then
    raise exception using errcode = '22023', message = 'You cannot block yourself.';
  end if;
  insert into public.blocked_users (blocker_id, blocked_id) values (uid, p_user_id) on conflict do nothing;
  delete from public.friendships where user_low = least(uid, p_user_id) and user_high = greatest(uid, p_user_id);
  update public.invitations set status = 'revoked', responded_at = now()
  where status = 'pending' and ((inviter_id = uid and invitee_id = p_user_id) or (inviter_id = p_user_id and invitee_id = uid));
  delete from public.activity_reactions r using public.activities a
  where r.activity_id = a.id and ((a.user_id = uid and r.user_id = p_user_id) or (a.user_id = p_user_id and r.user_id = uid));
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  delete from public.blocked_users where blocker_id = uid and blocked_id = p_user_id;
end;
$$;

create or replace function public.get_friends()
returns table (
  user_id uuid, username text, display_name text, avatar_url text, level integer,
  status text, since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, coalesce(x.level, 1),
         case
           when f.status = 'accepted' then 'friends'
           when f.requested_by = auth.uid() then 'outgoing'
           else 'incoming'
         end,
         coalesce(f.responded_at, f.created_at)
  from public.friendships f
  join public.profiles p on p.id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
  left join public.user_xp x on x.user_id = p.id
  where (f.user_low = auth.uid() or f.user_high = auth.uid())
  order by (f.status = 'pending' and f.requested_by <> auth.uid()) desc, p.display_name;
$$;

create or replace function public.get_blocked_users()
returns table (user_id uuid, username text, display_name text, avatar_url text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  p public.profiles;
  details boolean;
  rel text;
  f public.friendships;
begin
  select * into p from public.profiles where id = p_user_id;
  if not found or (p_user_id <> uid and exists (
    select 1 from public.blocked_users where blocker_id = p_user_id and blocked_id = uid
  )) then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
  details := app_private.can_view_profile_details(uid, p.id);
  select * into f from public.friendships where user_low = least(uid, p.id) and user_high = greatest(uid, p.id);
  rel := case
    when p.id = uid then 'self'
    when exists (select 1 from public.blocked_users where blocker_id = uid and blocked_id = p.id) then 'blocked'
    when f.status = 'accepted' then 'friends'
    when f.status = 'pending' and f.requested_by = uid then 'outgoing'
    when f.status = 'pending' then 'incoming'
    else 'none'
  end;
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'bio', case when details then p.bio end, 'equipped_theme_id', p.equipped_theme_id,
      'profile_visibility', p.profile_visibility, 'created_at', p.created_at
    ),
    'level', (select jsonb_build_object('level', x.level, 'xp_total', x.xp_total) from public.user_xp x where x.user_id = p.id),
    'relationship', rel,
    'can_view_details', details,
    'stats', case when details then (
      select jsonb_build_object(
        'activity_count', s.activity_count, 'total_distance_m', s.total_distance_m,
        'total_moving_time_s', s.total_moving_time_s, 'daily_streak_days', s.daily_streak_days,
        'daily_streak_last_date', s.daily_streak_last_date, 'longest_daily_streak', s.longest_daily_streak
      ) from public.user_stats s where s.user_id = p.id
    ) end,
    'achievements', case when details then coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'icon', a.icon, 'tier', a.tier, 'earned_at', ua.earned_at)
                       order by ua.earned_at desc)
      from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
      where ua.user_id = p.id
    ), '[]') end,
    'shared_challenges', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'ends_at', c.ends_at) order by c.ends_at desc)
      from public.challenges c
      where c.id in (select challenge_id from public.challenge_participants where user_id = uid)
        and c.id in (select challenge_id from public.challenge_participants where user_id = p.id)
        and p.id <> uid
    ), '[]')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed, reactions, comments
-- ---------------------------------------------------------------------------

create or replace function public.get_feed(p_before timestamptz default null, p_limit integer default 20)
returns table (kind text, item_id text, occurred_at timestamptz, actor jsonb, payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
  before_ts timestamptz := coalesce(p_before, 'infinity'::timestamptz);
begin
  return query
  with circle as (
    select uid as pid
    union
    select case when f.user_low = uid then f.user_high else f.user_low end
    from public.friendships f
    where (f.user_low = uid or f.user_high = uid) and f.status = 'accepted'
  ),
  items as (
    (
      select 'activity'::text as k, a.id::text as iid, a.started_at as at, a.user_id as who,
             jsonb_build_object(
               'id', a.id, 'type', a.type, 'source', a.source, 'title', a.title, 'description', a.description,
               'distance_m', a.distance_m, 'moving_time_s', a.moving_time_s, 'elevation_gain_m', a.elevation_gain_m,
               'avg_speed_mps', a.avg_speed_mps, 'started_at', a.started_at, 'visibility', a.visibility,
               'route_preview', a.route_preview, 'is_eligible', a.is_eligible,
               'reaction_count', (select count(*) from public.activity_reactions r where r.activity_id = a.id),
               'comment_count', (select count(*) from public.activity_comments cm where cm.activity_id = a.id),
               'reacted', exists (select 1 from public.activity_reactions r where r.activity_id = a.id and r.user_id = uid)
             ) as pl
      from public.activities a
      join circle c on c.pid = a.user_id
      where a.started_at < before_ts and app_private.can_view_activity(uid, a.user_id, a.visibility)
      order by a.started_at desc
      limit lim
    )
    union all
    (
      select 'achievement', ua.user_id::text || ':' || ua.achievement_id, ua.earned_at, ua.user_id,
             jsonb_build_object('achievement_id', ac.id, 'title', ac.title, 'icon', ac.icon, 'tier', ac.tier, 'description', ac.description)
      from public.user_achievements ua
      join circle c on c.pid = ua.user_id
      join public.achievements ac on ac.id = ua.achievement_id
      where ua.earned_at < before_ts and app_private.can_view_profile_details(uid, ua.user_id)
      order by ua.earned_at desc
      limit lim
    )
    union all
    (
      select 'challenge_completed', cp.challenge_id::text || ':' || cp.user_id, cp.completed_at, cp.user_id,
             jsonb_build_object('challenge_id', ch.id, 'title', ch.title, 'mode', ch.mode, 'metric', ch.metric, 'value', cp.progress_value)
      from public.challenge_participants cp
      join circle c on c.pid = cp.user_id
      join public.challenges ch on ch.id = cp.challenge_id
      where cp.completed_at is not null and cp.completed_at < before_ts
        and app_private.can_view_profile_details(uid, cp.user_id)
        and app_private.can_view_challenge(uid, ch.id)
      order by cp.completed_at desc
      limit lim
    )
    union all
    (
      select 'journey_completed', m.expedition_id::text || ':' || m.user_id, e.completed_at, m.user_id,
             jsonb_build_object('journey_slug', j.slug, 'title', j.title, 'art_key', j.art_key, 'total_m', j.total_distance_m, 'mode', e.mode)
      from public.journey_expedition_members m
      join circle c on c.pid = m.user_id
      join public.journey_expeditions e on e.id = m.expedition_id and e.status = 'completed'
      join public.journeys j on j.id = e.journey_id
      where e.completed_at < before_ts and m.left_at is null
        and app_private.can_view_profile_details(uid, m.user_id)
      order by e.completed_at desc
      limit lim
    )
  )
  select i.k, i.iid, i.at,
         jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                            'avatar_url', p.avatar_url, 'equipped_theme_id', p.equipped_theme_id),
         i.pl
  from items i
  join public.profiles p on p.id = i.who
  order by i.at desc, i.iid
  limit lim;
end;
$$;

create or replace function public.toggle_reaction(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  owner uuid;
  me_name text;
  reacted boolean;
begin
  select user_id into owner from public.activities where id = p_activity_id;
  if owner is null or not app_private.can_view_activity_id(uid, p_activity_id) then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  delete from public.activity_reactions where activity_id = p_activity_id and user_id = uid;
  if found then
    reacted := false;
  else
    insert into public.activity_reactions (activity_id, user_id) values (p_activity_id, uid);
    reacted := true;
    select display_name into me_name from public.profiles where id = uid;
    perform app_private.notify(owner, 'activity_reaction', 'New kudos', format('%s gave you kudos.', me_name),
      jsonb_build_object('activity_id', p_activity_id), uid, 'kudos:' || p_activity_id || ':' || uid);
  end if;
  return jsonb_build_object(
    'reacted', reacted,
    'count', (select count(*) from public.activity_reactions where activity_id = p_activity_id)
  );
end;
$$;

create or replace function public.add_comment(p_activity_id uuid, p_body text)
returns public.activity_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  owner uuid;
  me_name text;
  result public.activity_comments;
  recent integer;
begin
  select user_id into owner from public.activities where id = p_activity_id;
  if owner is null or not app_private.can_view_activity_id(uid, p_activity_id) then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(btrim(p_body)) > 500 then
    raise exception using errcode = '22023', message = 'Comments must be between 1 and 500 characters.';
  end if;
  select count(*) into recent from public.activity_comments where user_id = uid and created_at > now() - interval '1 minute';
  if recent >= 10 then
    raise exception using errcode = '54000', message = 'You are commenting too quickly. Try again in a minute.';
  end if;
  insert into public.activity_comments (activity_id, user_id, body)
  values (p_activity_id, uid, btrim(p_body))
  returning * into result;
  select display_name into me_name from public.profiles where id = uid;
  perform app_private.notify(owner, 'activity_comment', 'New comment', format('%s: %s', me_name, left(btrim(p_body), 80)),
    jsonb_build_object('activity_id', p_activity_id, 'comment_id', result.id), uid, null);
  return result;
end;
$$;

create or replace function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  delete from public.activity_comments cm
  using public.activities a
  where cm.id = p_comment_id and a.id = cm.activity_id and (cm.user_id = uid or a.user_id = uid);
  if not found then
    raise exception using errcode = 'P0002', message = 'Comment not found.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gamification
-- ---------------------------------------------------------------------------

create or replace function public.equip_theme(p_theme_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  if not exists (select 1 from public.user_unlocked_themes where user_id = uid and theme_id = p_theme_id) then
    raise exception using errcode = '42501', message = 'Unlock this theme before equipping it.';
  end if;
  update public.profiles set equipped_theme_id = p_theme_id where id = uid;
end;
$$;

create or replace function public.get_achievement_progress()
returns table (
  id text, title text, description text, icon text, tier text, category text, xp_reward integer,
  reward_theme_id text, current_value bigint, target_value bigint, rule_type text, earned_at timestamptz,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.description, a.icon, a.tier, a.category, a.xp_reward, a.reward_theme_id,
         app_private.achievement_rule_value(auth.uid(), a.rule),
         app_private.achievement_rule_target(a.rule),
         a.rule ->> 'type',
         ua.earned_at,
         a.sort_order
  from public.achievements a
  left join public.user_achievements ua on ua.achievement_id = a.id and ua.user_id = auth.uid()
  where a.is_active and auth.uid() is not null
  order by a.sort_order, a.id;
$$;

-- ---------------------------------------------------------------------------
-- Notifications, push tokens, account
-- ---------------------------------------------------------------------------

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  n integer;
begin
  update public.notifications set read_at = now()
  where user_id = uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  insert into public.push_tokens (token, user_id, platform) values (p_token, uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.check_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where username = lower(p_username) and id <> auth.uid());
$$;

-- Deletes the auth user; every user-owned row cascades from profiles. Avatar files are removed by
-- the client beforehand (it owns them) because storage objects live outside Postgres.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  -- Release shared results the user no longer owns so totals stay consistent for others.
  perform app_private.lock_user(uid);
  delete from public.challenge_participants cp
  using public.challenges c
  where cp.user_id = uid and c.id = cp.challenge_id;
  delete from auth.users where id = uid;
end;
$$;
