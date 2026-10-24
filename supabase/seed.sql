-- DEVELOPMENT FIXTURES ONLY. Applied by `supabase db reset` on the local stack; never run this in
-- production. Production content (themes, journeys, official challenges...) lives in migrations.
--
-- Demo accounts (password for all: questfit-dev-1):
--   alice@questfit.dev  · runner, friends with Bob and Chen, solo Alps journey + Ashen Peak party
--   bob@questfit.dev    · cyclist & walker, in Alice's Ashen Peak party
--   chen@questfit.dev   · hiker
--   dana@questfit.dev   · new user with a pending friend request to Alice
--
-- Activities are created through public.submit_activity so every total, XP award and unlock is
-- produced by the real engine rather than inserted by hand.

create or replace function pg_temp.make_user(p_id uuid, p_email text, p_name text, p_username text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('questfit-dev-1', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', p_name, 'username', p_username, 'timezone', 'Asia/Tbilisi'),
    now() - interval '40 days', now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  update public.profiles set onboarding_completed_at = now() - interval '40 days' where id = p_id;
end;
$$;

-- A closed GPS loop of `p_km` kilometres around (lat, lng), one sample every 4 seconds.
create or replace function pg_temp.loop_route(p_lat double precision, p_lng double precision, p_km double precision, p_start timestamptz, p_speed double precision)
returns jsonb language sql as $$
  with params as (
    select (p_km * 1000) / (2 * pi()) as r_m,
           greatest(30, round((p_km * 1000) / (p_speed * 4)))::integer as n
  )
  select jsonb_agg(jsonb_build_array(
           round((p_lat + (r_m * sin(2 * pi() * i / n)) / 111195.0)::numeric, 6),
           round((p_lng + (r_m * (1 - cos(2 * pi() * i / n))) / (111195.0 * cos(radians(p_lat))))::numeric, 6),
           (extract(epoch from p_start) * 1000)::bigint + i * 4000,
           480 + round((20 * sin(4 * pi() * i / n))::numeric, 1),
           6,
           0
         ) order by i)
  from params, generate_series(0, n) as i;
$$;

create or replace function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, false);
$$;

create or replace function pg_temp.log(p_user uuid, p_type public.activity_type, p_days_ago double precision, p_km double precision, p_minutes double precision, p_title text, p_vis public.visibility default 'friends')
returns void language plpgsql as $$
begin
  perform pg_temp.act_as(p_user);
  perform public.submit_activity(
    p_client_id => gen_random_uuid(),
    p_type => p_type,
    p_source => 'manual',
    p_started_at => now() - make_interval(secs => p_days_ago * 86400),
    p_elapsed_time_s => round(p_minutes * 60)::integer,
    p_moving_time_s => round(p_minutes * 60)::integer,
    p_distance_m => round(p_km * 1000)::integer,
    p_title => p_title,
    p_visibility => p_vis,
    p_timezone => 'Asia/Tbilisi'
  );
end;
$$;

create or replace function pg_temp.gps(p_user uuid, p_type public.activity_type, p_days_ago double precision, p_km double precision, p_speed double precision, p_title text, p_lat double precision, p_lng double precision)
returns void language plpgsql as $$
declare
  started timestamptz := now() - make_interval(secs => p_days_ago * 86400);
  route jsonb := pg_temp.loop_route(p_lat, p_lng, p_km, started, p_speed);
  seconds integer := ((route -> -1 ->> 2)::bigint - (route -> 0 ->> 2)::bigint) / 1000;
begin
  perform pg_temp.act_as(p_user);
  perform public.submit_activity(
    p_client_id => gen_random_uuid(),
    p_type => p_type,
    p_source => 'gps',
    p_started_at => started,
    p_elapsed_time_s => seconds + 30,
    p_moving_time_s => seconds,
    p_distance_m => 0,
    p_title => p_title,
    p_visibility => 'friends',
    p_timezone => 'Asia/Tbilisi',
    p_route => route
  );
end;
$$;

do $$
declare
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  chen uuid := '33333333-3333-4333-8333-333333333333';
  dana uuid := '44444444-4444-4444-8444-444444444444';
  c record;
  alps uuid;
  ashen uuid;
  party uuid;
  code text;
begin
  perform pg_temp.make_user(alice, 'alice@questfit.dev', 'Alice Mtsitouri', 'alice');
  perform pg_temp.make_user(bob, 'bob@questfit.dev', 'Bob Kartveli', 'bob');
  perform pg_temp.make_user(chen, 'chen@questfit.dev', 'Chen Wei', 'chen');
  perform pg_temp.make_user(dana, 'dana@questfit.dev', 'Dana Lomidze', 'dana');
  update public.user_settings set measurement_system = 'imperial' where user_id = chen;
  update public.profiles set bio = 'Chasing sunrise runs above Tbilisi.', preferred_activity_types = '{run,indoor_run,hike}' where id = alice;
  update public.profiles set bio = 'Two wheels, one goal.', preferred_activity_types = '{ride,walk}' where id = bob;
  update public.profiles set preferred_activity_types = '{hike,walk}', profile_visibility = 'friends' where id = chen;

  -- Social graph
  perform pg_temp.act_as(alice);
  perform public.send_friend_request(bob);
  perform public.send_friend_request(chen);
  perform pg_temp.act_as(bob);
  perform public.respond_friend_request(alice, true);
  perform pg_temp.act_as(chen);
  perform public.respond_friend_request(alice, true);
  perform pg_temp.act_as(dana);
  perform public.send_friend_request(alice);

  -- Everyone joins a few current official challenges.
  for c in select id, title, mode from public.challenges where is_official and ends_at > now() loop
    if c.title in ('Weekly 25K', 'Monthly 100 km Run', 'Community 1,000 km', 'Weekly Distance Duel', 'Ember vs Tide', 'Year of Movement: 1,000 km') then
      perform pg_temp.act_as(alice);
      perform public.join_challenge(c.id, null, null);
    end if;
    if c.title in ('Cycle 500 km in a Month', 'Community 1,000 km', 'Weekly Distance Duel', 'Ember vs Tide', 'Walk 50 km This Week') then
      perform pg_temp.act_as(bob);
      perform public.join_challenge(c.id, null, null);
    end if;
    if c.title in ('Walk 50 km This Week', 'Community 1,000 km', 'Hour Power: 10 Hours', 'Weekly Distance Duel') then
      perform pg_temp.act_as(chen);
      perform public.join_challenge(c.id, null, null);
    end if;
  end loop;

  -- Journeys: Alice solo across the Alps; Alice + Bob as a party to the Ashen Peak.
  select id into alps from public.journeys where slug = 'haute-route';
  select id into ashen from public.journeys where slug = 'ashen-peak';
  perform pg_temp.act_as(alice);
  perform public.start_expedition(alps, 'solo', null);
  party := public.start_expedition(ashen, 'group', 'Lantern Bearers');
  select invite_code into code from public.journey_expeditions where id = party;
  perform pg_temp.act_as(bob);
  perform public.join_expedition(null, code);
  -- Pretend everyone set out three weeks ago so their recent history counts.
  update public.journey_expedition_members set joined_at = now() - interval '21 days';
  perform pg_temp.act_as(chen);
  perform public.start_expedition((select id from public.journeys where slug = 'georgian-odyssey'), 'solo', null);
  update public.journey_expedition_members set joined_at = now() - interval '21 days' where user_id = chen;

  -- Activities (Vake Park and Mtatsminda in Tbilisi for GPS loops).
  perform pg_temp.gps(alice, 'run', 20.3, 6.2, 3.1, 'Vake Park loops', 41.7105, 44.7570);
  perform pg_temp.log(alice, 'run', 18.4, 10.4, 58, 'Long run along the Mtkvari');
  perform pg_temp.log(alice, 'indoor_run', 16.5, 5.0, 27, 'Treadmill intervals', 'private');
  perform pg_temp.gps(alice, 'run', 13.3, 8.0, 3.2, 'Sunrise tempo', 41.7105, 44.7570);
  perform pg_temp.log(alice, 'hike', 11.2, 14.5, 260, 'Mtatsminda ridge hike');
  perform pg_temp.log(alice, 'run', 8.4, 12.1, 66, 'Turtle Lake trail run');
  perform pg_temp.log(alice, 'run', 5.4, 5.2, 27, 'Easy shakeout');
  perform pg_temp.gps(alice, 'run', 3.3, 7.5, 3.3, 'Hill repeats', 41.6955, 44.7915);
  perform pg_temp.log(alice, 'run', 1.4, 9.0, 48, 'Progression run', 'public');
  perform pg_temp.log(alice, 'run', 0.2, 6.0, 31, 'Lunch run', 'public');

  perform pg_temp.log(bob, 'ride', 19.5, 42.0, 95, 'Saguramo loop');
  perform pg_temp.log(bob, 'walk', 15.4, 6.5, 80, 'Old Town wander');
  perform pg_temp.gps(bob, 'ride', 12.3, 35.0, 7.5, 'Lisi lake laps', 41.7420, 44.7340);
  perform pg_temp.log(bob, 'ride', 9.5, 60.0, 140, 'Mtskheta and back');
  perform pg_temp.log(bob, 'walk', 4.4, 8.2, 100, 'Botanical garden walk');
  perform pg_temp.log(bob, 'run', 2.4, 5.5, 33, 'First run in ages');
  perform pg_temp.log(bob, 'ride', 0.5, 28.0, 62, 'Evening spin', 'public');

  perform pg_temp.log(chen, 'hike', 17.3, 16.0, 320, 'Kojori fortress hike');
  perform pg_temp.log(chen, 'walk', 10.4, 7.0, 85, 'Rike park stroll');
  perform pg_temp.log(chen, 'hike', 6.3, 12.5, 240, 'Udabno desert trail');
  perform pg_temp.log(chen, 'walk', 1.5, 5.5, 70, 'Morning walk');

  perform pg_temp.log(dana, 'workout', 2.5, 0, 45, 'Strength session');

  -- Rewards were computed "now" by the engine; place them at the time of the activity that earned
  -- them so the demo feed reads like real history.
  update public.user_achievements ua set earned_at = a.ended_at
  from public.activities a where a.id = ua.source_activity_id;
  update public.challenge_participants cp set completed_at = (
    select max(a.ended_at) from public.challenge_contributions cc join public.activities a on a.id = cc.activity_id
    where cc.challenge_id = cp.challenge_id and cc.user_id = cp.user_id
  ) where cp.completed_at is not null;
  update public.notifications set created_at = now() - (random() * interval '10 days');

  perform set_config('request.jwt.claims', '', false);
end;
$$;
