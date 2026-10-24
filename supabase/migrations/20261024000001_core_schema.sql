-- QuestFit core schema.
--
-- Canonical units used everywhere in the database:
--   distance  -> meters   (integer / bigint)
--   duration  -> seconds  (integer / bigint)
--   count     -> activities
-- Presentation layers convert to km / mi; nothing in the database stores imperial values.

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type public.activity_type as enum (
  'run', 'indoor_run', 'walk', 'ride', 'hike', 'swim', 'workout', 'other'
);
create type public.activity_source as enum ('gps', 'manual');
create type public.visibility as enum ('public', 'friends', 'private');
create type public.measurement_system as enum ('metric', 'imperial');

create type public.challenge_mode as enum ('individual', 'competitive', 'collaborative', 'team');
create type public.challenge_metric as enum ('distance', 'duration', 'count');
create type public.challenge_period as enum ('weekly', 'monthly', 'yearly', 'custom');
create type public.challenge_recurrence as enum ('none', 'weekly', 'monthly', 'yearly');
create type public.challenge_visibility as enum ('public', 'private');

create type public.friendship_status as enum ('pending', 'accepted');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');
create type public.journey_mode as enum ('solo', 'group');
create type public.expedition_status as enum ('active', 'completed', 'abandoned');

create type public.notification_type as enum (
  'friend_request', 'friend_accepted',
  'challenge_invite', 'expedition_invite',
  'challenge_milestone', 'challenge_completed', 'challenge_finished',
  'achievement_unlocked', 'journey_checkpoint', 'journey_completed',
  'level_up', 'theme_unlocked',
  'activity_reaction', 'activity_comment'
);

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Raises for unknown IANA zone names. Used by triggers instead of CHECK constraints because
-- pg_timezone_names is not immutable.
create or replace function app_private.assert_valid_timezone(tz text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    raise exception using errcode = '22023', message = format('Unknown time zone "%s".', tz);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Content configuration (themes, levels, XP rules, achievements)
-- ---------------------------------------------------------------------------

create table public.themes (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null,
  tier text not null default 'standard' check (tier in ('standard', 'rare', 'epic', 'mythic')),
  -- Design tokens consumed by the app's theme engine. Shape is validated by the client
  -- (see src/theme/registry.ts) and falls back to the default theme when invalid.
  palette jsonb not null,
  -- {"type":"default"} | {"type":"total_distance","threshold_m":5000} | {"type":"level","level":10}
  -- | {"type":"reward"} (granted only by journeys / challenges / achievements).
  unlock_rule jsonb not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint themes_unlock_rule_type check (unlock_rule ->> 'type' in ('default', 'total_distance', 'level', 'reward'))
);

create table public.levels (
  level integer primary key check (level >= 1),
  xp_required bigint not null unique check (xp_required >= 0),
  title text not null
);

create table public.xp_rules (
  activity_type public.activity_type primary key,
  base_xp integer not null check (base_xp between 0 and 500),
  xp_per_km numeric(6, 2) not null check (xp_per_km between 0 and 100),
  xp_per_10_min numeric(6, 2) not null check (xp_per_10_min between 0 and 100)
);

create table public.game_settings (
  key text primary key,
  value jsonb not null,
  description text
);

create table public.achievements (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  title text not null,
  description text not null,
  icon text not null,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'mythic')),
  category text not null default 'distance',
  rule jsonb not null,
  xp_reward integer not null default 0 check (xp_reward between 0 and 5000),
  reward_theme_id text references public.themes (id),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint achievements_rule_type check (rule ->> 'type' in (
    'activity_count', 'total_distance', 'single_activity_distance', 'daily_streak',
    'challenges_completed', 'journeys_completed', 'level', 'friends', 'early_activity'
  ))
);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  bio text,
  avatar_url text,
  -- Controls who can see stats, achievements and activities. Basic identity (name, username,
  -- avatar, level) stays visible to signed-in users so leaderboards and invitations work.
  profile_visibility public.visibility not null default 'public',
  preferred_activity_types public.activity_type[] not null default '{}',
  fitness_goal text,
  equipped_theme_id text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 280),
  constraint profiles_goal_len check (fitness_goal is null or char_length(fitness_goal) <= 140),
  constraint profiles_avatar_len check (avatar_url is null or char_length(avatar_url) <= 500)
);
create unique index profiles_username_key on public.profiles (username);
create trigger profiles_touch before update on public.profiles
  for each row execute function app_private.touch_updated_at();

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  measurement_system public.measurement_system not null default 'metric',
  default_activity_visibility public.visibility not null default 'friends',
  -- When false, no route preview is published for new activities.
  share_routes boolean not null default true,
  -- Removes route points within the privacy radius of the start and end of every published preview.
  hide_route_endpoints boolean not null default true,
  timezone text not null default 'UTC',
  notify_push boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function app_private.validate_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_valid_timezone(new.timezone);
  new.updated_at := now();
  return new;
end;
$$;
create trigger user_settings_validate before insert or update on public.user_settings
  for each row execute function app_private.validate_user_settings();

-- Aggregates derived from validated activities. Written only by app_private functions.
create table public.user_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  activity_count integer not null default 0,
  total_distance_m bigint not null default 0,
  total_moving_time_s bigint not null default 0,
  total_elevation_gain_m bigint not null default 0,
  daily_streak_days integer not null default 0,
  daily_streak_last_date date,
  longest_daily_streak integer not null default 0,
  weekly_streak_weeks integer not null default 0,
  weekly_streak_last_week date,
  updated_at timestamptz not null default now()
);

-- XP totals live apart from user_stats so that awarding XP to other users (for example when a
-- collaborative goal completes) never contends with the per-user processing lock on user_stats.
create table public.user_xp (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  xp_total bigint not null default 0 check (xp_total >= 0),
  level integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.friendships (
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_low, user_high),
  constraint friendships_ordered check (user_low < user_high),
  constraint friendships_requester check (requested_by = user_low or requested_by = user_high)
);
create index friendships_user_high_idx on public.friendships (user_high);

create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);
create index blocked_users_blocked_idx on public.blocked_users (blocked_id);

create table public.user_unlocked_themes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  theme_id text not null references public.themes (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  source text not null,
  primary key (user_id, theme_id)
);

-- A user can only equip a theme they have unlocked; enforced by the database, not the client.
alter table public.profiles
  add constraint profiles_equipped_theme_unlocked
  foreign key (id, equipped_theme_id)
  references public.user_unlocked_themes (user_id, theme_id)
  on delete set null (equipped_theme_id);

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Generated on the device when a recording starts; makes submission idempotent across retries.
  client_id uuid not null,
  type public.activity_type not null,
  source public.activity_source not null,
  title text not null,
  description text,
  visibility public.visibility not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  timezone text not null default 'UTC',
  -- Calendar date of started_at in the activity's time zone (streaks, daily XP caps, stats).
  local_date date not null,
  distance_m integer not null default 0,
  moving_time_s integer not null,
  elapsed_time_s integer not null,
  elevation_gain_m integer,
  avg_speed_mps double precision generated always as (
    case when moving_time_s > 0 then distance_m::double precision / moving_time_s else 0 end
  ) stored,
  has_route boolean not null default false,
  -- Simplified, privacy-trimmed [[lat,lng],...] published to permitted viewers. Never the raw route.
  route_preview jsonb,
  is_eligible boolean not null default true,
  ineligible_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_client_unique unique (user_id, client_id),
  constraint activities_distance_range check (distance_m between 0 and 1000000),
  constraint activities_moving_range check (moving_time_s between 1 and 172800),
  constraint activities_elapsed_range check (elapsed_time_s >= moving_time_s and elapsed_time_s <= 259200),
  constraint activities_time_order check (ended_at >= started_at),
  constraint activities_elevation_range check (elevation_gain_m is null or elevation_gain_m between 0 and 20000),
  constraint activities_title_len check (char_length(btrim(title)) between 1 and 100),
  constraint activities_description_len check (description is null or char_length(description) <= 2000),
  constraint activities_gps_outdoor check (source = 'manual' or type in ('run', 'walk', 'ride', 'hike')),
  constraint activities_route_requires_gps check (not has_route or source = 'gps')
);
create index activities_user_started_idx on public.activities (user_id, started_at desc);
create index activities_user_local_date_idx on public.activities (user_id, local_date);
create index activities_public_started_idx on public.activities (started_at desc) where visibility <> 'private';
create trigger activities_touch before update on public.activities
  for each row execute function app_private.touch_updated_at();

-- Full-resolution GPS samples. Owner-only. Points are [lat, lng, t_ms, alt|null, acc|null, segment].
create table public.activity_routes (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  points jsonb not null,
  point_count integer not null check (point_count between 2 and 20000),
  created_at timestamptz not null default now()
);
create index activity_routes_user_idx on public.activity_routes (user_id);

-- The processing summary computed when an activity was first saved; returned again on retries.
create table public.activity_processing (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary jsonb not null,
  processed_at timestamptz not null default now()
);

create table public.activity_reactions (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index activity_reactions_user_idx on public.activity_reactions (user_id);

create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint activity_comments_body_len check (char_length(btrim(body)) between 1 and 500)
);
create index activity_comments_activity_idx on public.activity_comments (activity_id, created_at);

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  -- Recurring instances share a series id; each instance is an independent challenge.
  series_id uuid,
  title text not null,
  description text,
  category text not null default 'community',
  cover_art text not null default 'trailhead',
  created_by uuid references public.profiles (id) on delete set null,
  is_official boolean not null default false,
  is_featured boolean not null default false,
  visibility public.challenge_visibility not null default 'public',
  invite_code text unique,
  mode public.challenge_mode not null,
  metric public.challenge_metric not null,
  -- meters for distance, seconds for duration, activities for count.
  target_value bigint,
  activity_types public.activity_type[] not null,
  allow_manual boolean not null default true,
  period public.challenge_period not null default 'custom',
  recurrence public.challenge_recurrence not null default 'none',
  timezone text not null default 'UTC',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  join_deadline timestamptz,
  -- Activities that started inside the window may still be submitted this long after ends_at.
  submission_grace_hours integer not null default 72,
  -- When true, joining late counts eligible activities recorded since the challenge started.
  retroactive boolean not null default true,
  max_participants integer,
  xp_reward integer not null default 100,
  reward_theme_id text references public.themes (id),
  total_progress bigint not null default 0,
  participant_count integer not null default 0,
  goal_reached_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenges_title_len check (char_length(btrim(title)) between 3 and 80),
  constraint challenges_description_len check (description is null or char_length(description) <= 1000),
  constraint challenges_window check (ends_at > starts_at),
  constraint challenges_window_max check (ends_at - starts_at <= interval '367 days'),
  constraint challenges_target_required check (mode in ('competitive', 'team') or target_value is not null),
  constraint challenges_target_positive check (target_value is null or target_value > 0),
  constraint challenges_types_nonempty check (cardinality(activity_types) > 0),
  constraint challenges_grace_range check (submission_grace_hours between 0 and 336),
  constraint challenges_max_participants check (max_participants is null or max_participants >= 2),
  constraint challenges_xp_range check (xp_reward between 0 and 5000),
  constraint challenges_join_deadline check (join_deadline is null or join_deadline <= ends_at),
  constraint challenges_recurrence_series check (recurrence = 'none' or series_id is not null),
  constraint challenges_private_code check (visibility = 'public' or invite_code is not null)
);
create unique index challenges_series_start_key on public.challenges (series_id, starts_at) where series_id is not null;
create index challenges_public_window_idx on public.challenges (ends_at, starts_at) where visibility = 'public';
create index challenges_created_by_idx on public.challenges (created_by);

create or replace function app_private.validate_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_valid_timezone(new.timezone);
  return new;
end;
$$;
create trigger challenges_validate before insert or update of timezone on public.challenges
  for each row execute function app_private.validate_challenge();

create table public.challenge_teams (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  total_progress bigint not null default 0,
  member_count integer not null default 0,
  goal_reached_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenge_teams_name_len check (char_length(btrim(name)) between 2 and 30),
  constraint challenge_teams_name_unique unique (challenge_id, name),
  constraint challenge_teams_id_challenge unique (id, challenge_id)
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid,
  joined_at timestamptz not null default now(),
  progress_value bigint not null default 0 check (progress_value >= 0),
  contribution_count integer not null default 0 check (contribution_count >= 0),
  -- Start time of the latest contributing activity: when the current value was reached (tie-break).
  last_progress_at timestamptz,
  completed_at timestamptz,
  final_rank integer,
  primary key (challenge_id, user_id),
  constraint challenge_participants_team_fk foreign key (team_id, challenge_id)
    references public.challenge_teams (id, challenge_id) on delete set null (team_id)
);
create index challenge_participants_user_idx on public.challenge_participants (user_id);
create index challenge_participants_rank_idx on public.challenge_participants (challenge_id, progress_value desc, last_progress_at asc);

create table public.challenge_contributions (
  id bigint generated always as identity primary key,
  challenge_id uuid not null,
  user_id uuid not null,
  -- Set to null when the activity is deleted after the challenge was finalized so results stay stable.
  activity_id uuid references public.activities (id) on delete set null,
  team_id uuid,
  value bigint not null check (value >= 0),
  activity_started_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint challenge_contributions_participant_fk foreign key (challenge_id, user_id)
    references public.challenge_participants (challenge_id, user_id) on delete cascade,
  -- The core anti-double-counting guarantee: one contribution per activity per challenge.
  constraint challenge_contributions_once unique (challenge_id, activity_id)
);
create index challenge_contributions_activity_idx on public.challenge_contributions (activity_id);
create index challenge_contributions_participant_idx on public.challenge_contributions (challenge_id, user_id);

-- ---------------------------------------------------------------------------
-- Epic journeys
-- ---------------------------------------------------------------------------

create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  subtitle text not null,
  description text not null,
  story_intro text,
  -- Key into the app's bundled, original artwork set (src/features/journeys/art.ts).
  art_key text not null,
  region text,
  is_fictional boolean not null default false,
  total_distance_m bigint not null check (total_distance_m > 0),
  activity_types public.activity_type[] not null check (cardinality(activity_types) > 0),
  allow_manual boolean not null default true,
  supports_solo boolean not null default true,
  supports_group boolean not null default true,
  max_group_size integer not null default 12 check (max_group_size between 2 and 100),
  completion_xp integer not null default 500 check (completion_xp between 0 and 10000),
  reward_theme_id text references public.themes (id),
  difficulty text not null default 'moderate' check (difficulty in ('easy', 'moderate', 'hard', 'epic')),
  -- Normalised polyline [[x,y],...] in 0..1 space used to draw the illustrated journey map.
  map_path jsonb not null,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint journeys_mode_supported check (supports_solo or supports_group)
);

create table public.journey_checkpoints (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  description text not null,
  story text,
  -- Cumulative virtual distance from the start of the journey.
  distance_m bigint not null check (distance_m >= 0),
  xp_reward integer not null default 50 check (xp_reward between 0 and 5000),
  constraint journey_checkpoints_position_unique unique (journey_id, position),
  constraint journey_checkpoints_distance_unique unique (journey_id, distance_m)
);

create table public.journey_expeditions (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  mode public.journey_mode not null,
  name text,
  created_by uuid references public.profiles (id) on delete set null,
  invite_code text unique,
  status public.expedition_status not null default 'active',
  progress_m bigint not null default 0 check (progress_m >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint journey_expeditions_name_len check (name is null or char_length(btrim(name)) between 2 and 40),
  constraint journey_expeditions_group_code check (mode = 'solo' or invite_code is not null),
  constraint journey_expeditions_completed check ((status = 'completed') = (completed_at is not null))
);
create index journey_expeditions_journey_idx on public.journey_expeditions (journey_id);

create table public.journey_expedition_members (
  expedition_id uuid not null references public.journey_expeditions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  -- True while the member is in the expedition and the expedition is still in progress.
  is_active boolean not null default true,
  contributed_m bigint not null default 0 check (contributed_m >= 0),
  primary key (expedition_id, user_id),
  constraint journey_members_active_not_left check (not is_active or left_at is null)
);
-- A user travels each journey with at most one active expedition at a time.
create unique index journey_members_one_active on public.journey_expedition_members (user_id, journey_id) where is_active;
create index journey_members_user_idx on public.journey_expedition_members (user_id);

create table public.journey_contributions (
  id bigint generated always as identity primary key,
  expedition_id uuid not null references public.journey_expeditions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  value_m bigint not null check (value_m >= 0),
  created_at timestamptz not null default now(),
  constraint journey_contributions_once unique (expedition_id, activity_id)
);
create index journey_contributions_activity_idx on public.journey_contributions (activity_id);

create table public.expedition_checkpoint_unlocks (
  expedition_id uuid not null references public.journey_expeditions (id) on delete cascade,
  checkpoint_id uuid not null references public.journey_checkpoints (id) on delete cascade,
  reached_at timestamptz not null default now(),
  activity_id uuid references public.activities (id) on delete set null,
  primary key (expedition_id, checkpoint_id)
);

-- ---------------------------------------------------------------------------
-- Gamification ledger
-- ---------------------------------------------------------------------------

create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  source_activity_id uuid references public.activities (id) on delete set null,
  context jsonb not null default '{}',
  primary key (user_id, achievement_id)
);
create index user_achievements_earned_idx on public.user_achievements (user_id, earned_at desc);

create table public.experience_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount between 0 and 10000),
  reason text not null check (reason in (
    'activity', 'challenge_completed', 'challenge_podium', 'achievement', 'journey_checkpoint', 'journey_completed'
  )),
  -- Natural key of the event that produced the XP, e.g. 'activity:<uuid>'. Guarantees idempotency.
  source_key text not null,
  activity_id uuid references public.activities (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_transactions_once unique (user_id, source_key)
);
create index experience_transactions_user_idx on public.experience_transactions (user_id, created_at desc);
create index experience_transactions_activity_idx on public.experience_transactions (activity_id);

-- ---------------------------------------------------------------------------
-- Social: notifications, invitations, push tokens
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  actor_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe unique (user_id, dedupe_key)
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('challenge', 'expedition')),
  challenge_id uuid references public.challenges (id) on delete cascade,
  expedition_id uuid references public.journey_expeditions (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status public.invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  responded_at timestamptz,
  constraint invitations_target check (
    (kind = 'challenge' and challenge_id is not null and expedition_id is null)
    or (kind = 'expedition' and expedition_id is not null and challenge_id is null)
  ),
  constraint invitations_not_self check (inviter_id <> invitee_id)
);
create unique index invitations_pending_challenge on public.invitations (invitee_id, challenge_id)
  where status = 'pending' and challenge_id is not null;
create unique index invitations_pending_expedition on public.invitations (invitee_id, expedition_id)
  where status = 'pending' and expedition_id is not null;
create index invitations_invitee_idx on public.invitations (invitee_id, status);

create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
