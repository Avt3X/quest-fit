-- Row Level Security and privileges.
--
-- Model: the mobile app is an untrusted client. It may READ rows that RLS allows and may UPDATE a
-- small set of self-owned columns (profile and settings). Every other write goes through the
-- SECURITY DEFINER RPCs, which enforce business rules. Nothing is granted to anon.

-- Start from zero.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema app_private revoke all on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
-- Policies run as the querying role, so the read-only visibility helpers they call must be executable.
grant usage on schema app_private to authenticated;
grant execute on function
  app_private.are_friends(uuid, uuid),
  app_private.is_blocked_between(uuid, uuid),
  app_private.can_view_profile_details(uuid, uuid),
  app_private.can_view_activity(uuid, uuid, public.visibility),
  app_private.can_view_activity_id(uuid, uuid),
  app_private.is_challenge_participant(uuid, uuid),
  app_private.can_view_challenge(uuid, uuid),
  app_private.is_expedition_member(uuid, uuid),
  app_private.can_view_expedition(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.themes enable row level security;
alter table public.levels enable row level security;
alter table public.xp_rules enable row level security;
alter table public.game_settings enable row level security;
alter table public.achievements enable row level security;
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_stats enable row level security;
alter table public.user_xp enable row level security;
alter table public.friendships enable row level security;
alter table public.blocked_users enable row level security;
alter table public.user_unlocked_themes enable row level security;
alter table public.activities enable row level security;
alter table public.activity_routes enable row level security;
alter table public.activity_processing enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.activity_comments enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_teams enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_contributions enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_checkpoints enable row level security;
alter table public.journey_expeditions enable row level security;
alter table public.journey_expedition_members enable row level security;
alter table public.journey_contributions enable row level security;
alter table public.expedition_checkpoint_unlocks enable row level security;
alter table public.user_achievements enable row level security;
alter table public.experience_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.invitations enable row level security;
alter table public.push_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Content configuration: readable by signed-in users, writable only by operators.
-- ---------------------------------------------------------------------------

grant select on public.themes, public.levels, public.xp_rules, public.game_settings, public.achievements,
  public.journeys, public.journey_checkpoints to authenticated;

create policy themes_read on public.themes for select to authenticated using (is_active);
create policy levels_read on public.levels for select to authenticated using (true);
create policy xp_rules_read on public.xp_rules for select to authenticated using (true);
create policy game_settings_read on public.game_settings for select to authenticated using (true);
create policy achievements_read on public.achievements for select to authenticated using (is_active);
create policy journeys_read on public.journeys for select to authenticated using (is_published);
create policy journey_checkpoints_read on public.journey_checkpoints for select to authenticated
  using (exists (select 1 from public.journeys j where j.id = journey_id and j.is_published));

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
grant update (
  username, display_name, bio, avatar_url, profile_visibility, preferred_activity_types,
  fitness_goal, equipped_theme_id, onboarding_completed_at
) on public.profiles to authenticated;

-- Basic identity is visible to signed-in users (needed for leaderboards, invitations and search),
-- except between users who have blocked each other.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or not app_private.is_blocked_between((select auth.uid()), id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.user_settings to authenticated;
grant update (
  measurement_system, default_activity_visibility, share_routes, hide_route_endpoints, timezone, notify_push
) on public.user_settings to authenticated;
create policy user_settings_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.user_stats to authenticated;
create policy user_stats_read on public.user_stats for select to authenticated
  using (app_private.can_view_profile_details((select auth.uid()), user_id));

grant select on public.user_xp to authenticated;
create policy user_xp_read on public.user_xp for select to authenticated
  using (user_id = (select auth.uid()) or not app_private.is_blocked_between((select auth.uid()), user_id));

grant select on public.friendships to authenticated;
create policy friendships_own on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

grant select on public.blocked_users to authenticated;
create policy blocked_users_own on public.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));

grant select on public.user_unlocked_themes to authenticated;
create policy user_unlocked_themes_own on public.user_unlocked_themes for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------

grant select on public.activities to authenticated;
create policy activities_read on public.activities for select to authenticated
  using (app_private.can_view_activity((select auth.uid()), user_id, visibility));

-- Raw GPS samples never leave the owner's account.
grant select on public.activity_routes to authenticated;
create policy activity_routes_own on public.activity_routes for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.activity_processing to authenticated;
create policy activity_processing_own on public.activity_processing for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.activity_reactions to authenticated;
create policy activity_reactions_read on public.activity_reactions for select to authenticated
  using (app_private.can_view_activity_id((select auth.uid()), activity_id));

grant select on public.activity_comments to authenticated;
create policy activity_comments_read on public.activity_comments for select to authenticated
  using (
    app_private.can_view_activity_id((select auth.uid()), activity_id)
    and (user_id = (select auth.uid()) or not app_private.is_blocked_between((select auth.uid()), user_id))
  );

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

grant select on public.challenges to authenticated;
create policy challenges_read on public.challenges for select to authenticated
  using (app_private.can_view_challenge((select auth.uid()), id));

grant select on public.challenge_teams to authenticated;
create policy challenge_teams_read on public.challenge_teams for select to authenticated
  using (app_private.can_view_challenge((select auth.uid()), challenge_id));

grant select on public.challenge_participants to authenticated;
create policy challenge_participants_read on public.challenge_participants for select to authenticated
  using (
    app_private.can_view_challenge((select auth.uid()), challenge_id)
    and (user_id = (select auth.uid()) or not app_private.is_blocked_between((select auth.uid()), user_id))
  );

-- Contributions link activities to challenges, so they are owner-only; others see totals.
grant select on public.challenge_contributions to authenticated;
create policy challenge_contributions_own on public.challenge_contributions for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Journeys
-- ---------------------------------------------------------------------------

grant select on public.journey_expeditions to authenticated;
create policy journey_expeditions_read on public.journey_expeditions for select to authenticated
  using (app_private.can_view_expedition((select auth.uid()), id));

grant select on public.journey_expedition_members to authenticated;
create policy journey_members_read on public.journey_expedition_members for select to authenticated
  using (app_private.can_view_expedition((select auth.uid()), expedition_id));

grant select on public.journey_contributions to authenticated;
create policy journey_contributions_own on public.journey_contributions for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.expedition_checkpoint_unlocks to authenticated;
create policy expedition_unlocks_read on public.expedition_checkpoint_unlocks for select to authenticated
  using (app_private.can_view_expedition((select auth.uid()), expedition_id));

-- ---------------------------------------------------------------------------
-- Gamification ledger
-- ---------------------------------------------------------------------------

grant select on public.user_achievements to authenticated;
create policy user_achievements_read on public.user_achievements for select to authenticated
  using (app_private.can_view_profile_details((select auth.uid()), user_id));

grant select on public.experience_transactions to authenticated;
create policy experience_transactions_own on public.experience_transactions for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Notifications, invitations, push tokens
-- ---------------------------------------------------------------------------

grant select, delete on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.invitations to authenticated;
create policy invitations_party on public.invitations for select to authenticated
  using ((select auth.uid()) in (inviter_id, invitee_id));

grant select, delete on public.push_tokens to authenticated;
create policy push_tokens_own on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_tokens_delete_own on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- RPC execute grants (authenticated only)
-- ---------------------------------------------------------------------------

grant execute on function
  public.submit_activity(uuid, public.activity_type, public.activity_source, timestamptz, integer, integer, integer, text, text, public.visibility, integer, text, jsonb),
  public.update_activity(uuid, jsonb),
  public.delete_activity(uuid),
  public.remove_activity_route(uuid),
  public.get_activity_stats(date, date, text, public.activity_type[]),
  public.get_personal_records(),
  public.get_leaderboard(text, text, public.challenge_metric, integer),
  public.create_challenge(jsonb),
  public.join_challenge(uuid, uuid, text),
  public.join_challenge_by_code(text),
  public.leave_challenge(uuid),
  public.get_challenge_leaderboard(uuid, text, integer),
  public.invite_to_challenge(uuid, uuid[]),
  public.respond_invitation(uuid, boolean, uuid),
  public.refresh_challenges(),
  public.start_expedition(uuid, public.journey_mode, text),
  public.join_expedition(uuid, text),
  public.leave_expedition(uuid),
  public.invite_to_expedition(uuid, uuid[]),
  public.search_profiles(text, integer),
  public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.get_friends(),
  public.get_blocked_users(),
  public.get_public_profile(uuid),
  public.get_feed(timestamptz, integer),
  public.toggle_reaction(uuid),
  public.add_comment(uuid, text),
  public.delete_comment(uuid),
  public.equip_theme(text),
  public.get_achievement_progress(),
  public.mark_notifications_read(uuid[]),
  public.register_push_token(text, text),
  public.check_username_available(text),
  public.delete_my_account()
to authenticated;
