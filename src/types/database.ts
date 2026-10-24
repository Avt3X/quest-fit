
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "achievements": {
                  Row: {
                    "category": string,"created_at": string,"description": string,"icon": string,"id": string,"is_active": boolean,"reward_theme_id": string | null,"rule": NonNullable<Json>,"sort_order": number,"tier": string,"title": string,"xp_reward": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"description": string,"icon": string,"id": string,"is_active"?: boolean,"reward_theme_id"?: string | null,"rule": NonNullable<Json>,"sort_order"?: number,"tier"?: string,"title": string,"xp_reward"?: number
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"description"?: string,"icon"?: string,"id"?: string,"is_active"?: boolean,"reward_theme_id"?: string | null,"rule"?: NonNullable<Json>,"sort_order"?: number,"tier"?: string,"title"?: string,"xp_reward"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "achievements_reward_theme_id_fkey"
      columns: ["reward_theme_id"]
isOneToOne: false
      referencedRelation: "themes"
      referencedColumns: ["id"]
    }
                  ]
                },"activities": {
                  Row: {
                    "avg_speed_mps": number | null,"client_id": string,"created_at": string,"description": string | null,"distance_m": number,"elapsed_time_s": number,"elevation_gain_m": number | null,"ended_at": string,"has_route": boolean,"id": string,"ineligible_reason": string | null,"is_eligible": boolean,"local_date": string,"moving_time_s": number,"route_preview": Json | null,"source": Database["public"]['Enums']["activity_source"],"started_at": string,"timezone": string,"title": string,"type": Database["public"]['Enums']["activity_type"],"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_speed_mps"?: never,"client_id": string,"created_at"?: string,"description"?: string | null,"distance_m"?: number,"elapsed_time_s": number,"elevation_gain_m"?: number | null,"ended_at": string,"has_route"?: boolean,"id"?: string,"ineligible_reason"?: string | null,"is_eligible"?: boolean,"local_date": string,"moving_time_s": number,"route_preview"?: Json | null,"source": Database["public"]['Enums']["activity_source"],"started_at": string,"timezone"?: string,"title": string,"type": Database["public"]['Enums']["activity_type"],"updated_at"?: string,"user_id": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "avg_speed_mps"?: never,"client_id"?: string,"created_at"?: string,"description"?: string | null,"distance_m"?: number,"elapsed_time_s"?: number,"elevation_gain_m"?: number | null,"ended_at"?: string,"has_route"?: boolean,"id"?: string,"ineligible_reason"?: string | null,"is_eligible"?: boolean,"local_date"?: string,"moving_time_s"?: number,"route_preview"?: Json | null,"source"?: Database["public"]['Enums']["activity_source"],"started_at"?: string,"timezone"?: string,"title"?: string,"type"?: Database["public"]['Enums']["activity_type"],"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_comments": {
                  Row: {
                    "activity_id": string,"body": string,"created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"body": string,"created_at"?: string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_comments_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_processing": {
                  Row: {
                    "activity_id": string,"processed_at": string,"summary": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"processed_at"?: string,"summary": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string,"processed_at"?: string,"summary"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_processing_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: true
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_processing_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_reactions": {
                  Row: {
                    "activity_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_reactions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_routes": {
                  Row: {
                    "activity_id": string,"created_at": string,"point_count": number,"points": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"created_at"?: string,"point_count": number,"points": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string,"created_at"?: string,"point_count"?: number,"points"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_routes_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: true
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_routes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"blocked_users": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocked_users_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocked_users_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"challenge_contributions": {
                  Row: {
                    "activity_id": string | null,"activity_started_at": string,"challenge_id": string,"created_at": string,"id": number,"team_id": string | null,"user_id": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id"?: string | null,"activity_started_at": string,"challenge_id": string,"created_at"?: string,"id"?: never,"team_id"?: string | null,"user_id": string,"value": number
                  }
                  Update: {
                    "activity_id"?: string | null,"activity_started_at"?: string,"challenge_id"?: string,"created_at"?: string,"id"?: never,"team_id"?: string | null,"user_id"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenge_contributions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenge_contributions_participant_fk"
      columns: ["challenge_id","user_id"]
isOneToOne: false
      referencedRelation: "challenge_participants"
      referencedColumns: ["challenge_id","user_id"]
    }
                  ]
                },"challenge_participants": {
                  Row: {
                    "challenge_id": string,"completed_at": string | null,"contribution_count": number,"final_rank": number | null,"joined_at": string,"last_progress_at": string | null,"progress_value": number,"team_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge_id": string,"completed_at"?: string | null,"contribution_count"?: number,"final_rank"?: number | null,"joined_at"?: string,"last_progress_at"?: string | null,"progress_value"?: number,"team_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "challenge_id"?: string,"completed_at"?: string | null,"contribution_count"?: number,"final_rank"?: number | null,"joined_at"?: string,"last_progress_at"?: string | null,"progress_value"?: number,"team_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenge_participants_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenge_participants_team_fk"
      columns: ["team_id","challenge_id"]
isOneToOne: false
      referencedRelation: "challenge_teams"
      referencedColumns: ["id","challenge_id"]
    },{
      foreignKeyName: "challenge_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"challenge_teams": {
                  Row: {
                    "challenge_id": string,"color": string,"created_at": string,"goal_reached_at": string | null,"id": string,"member_count": number,"name": string,"total_progress": number
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge_id": string,"color": string,"created_at"?: string,"goal_reached_at"?: string | null,"id"?: string,"member_count"?: number,"name": string,"total_progress"?: number
                  }
                  Update: {
                    "challenge_id"?: string,"color"?: string,"created_at"?: string,"goal_reached_at"?: string | null,"id"?: string,"member_count"?: number,"name"?: string,"total_progress"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenge_teams_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    }
                  ]
                },"challenges": {
                  Row: {
                    "activity_types": (Database["public"]['Enums']["activity_type"])[],"allow_manual": boolean,"category": string,"cover_art": string,"created_at": string,"created_by": string | null,"description": string | null,"ends_at": string,"finalized_at": string | null,"goal_reached_at": string | null,"id": string,"invite_code": string | null,"is_featured": boolean,"is_official": boolean,"join_deadline": string | null,"max_participants": number | null,"metric": Database["public"]['Enums']["challenge_metric"],"mode": Database["public"]['Enums']["challenge_mode"],"participant_count": number,"period": Database["public"]['Enums']["challenge_period"],"recurrence": Database["public"]['Enums']["challenge_recurrence"],"retroactive": boolean,"reward_theme_id": string | null,"series_id": string | null,"starts_at": string,"submission_grace_hours": number,"target_value": number | null,"timezone": string,"title": string,"total_progress": number,"visibility": Database["public"]['Enums']["challenge_visibility"],"xp_reward": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_types": (Database["public"]['Enums']["activity_type"])[],"allow_manual"?: boolean,"category"?: string,"cover_art"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at": string,"finalized_at"?: string | null,"goal_reached_at"?: string | null,"id"?: string,"invite_code"?: string | null,"is_featured"?: boolean,"is_official"?: boolean,"join_deadline"?: string | null,"max_participants"?: number | null,"metric": Database["public"]['Enums']["challenge_metric"],"mode": Database["public"]['Enums']["challenge_mode"],"participant_count"?: number,"period"?: Database["public"]['Enums']["challenge_period"],"recurrence"?: Database["public"]['Enums']["challenge_recurrence"],"retroactive"?: boolean,"reward_theme_id"?: string | null,"series_id"?: string | null,"starts_at": string,"submission_grace_hours"?: number,"target_value"?: number | null,"timezone"?: string,"title": string,"total_progress"?: number,"visibility"?: Database["public"]['Enums']["challenge_visibility"],"xp_reward"?: number
                  }
                  Update: {
                    "activity_types"?: (Database["public"]['Enums']["activity_type"])[],"allow_manual"?: boolean,"category"?: string,"cover_art"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at"?: string,"finalized_at"?: string | null,"goal_reached_at"?: string | null,"id"?: string,"invite_code"?: string | null,"is_featured"?: boolean,"is_official"?: boolean,"join_deadline"?: string | null,"max_participants"?: number | null,"metric"?: Database["public"]['Enums']["challenge_metric"],"mode"?: Database["public"]['Enums']["challenge_mode"],"participant_count"?: number,"period"?: Database["public"]['Enums']["challenge_period"],"recurrence"?: Database["public"]['Enums']["challenge_recurrence"],"retroactive"?: boolean,"reward_theme_id"?: string | null,"series_id"?: string | null,"starts_at"?: string,"submission_grace_hours"?: number,"target_value"?: number | null,"timezone"?: string,"title"?: string,"total_progress"?: number,"visibility"?: Database["public"]['Enums']["challenge_visibility"],"xp_reward"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenges_reward_theme_id_fkey"
      columns: ["reward_theme_id"]
isOneToOne: false
      referencedRelation: "themes"
      referencedColumns: ["id"]
    }
                  ]
                },"expedition_checkpoint_unlocks": {
                  Row: {
                    "activity_id": string | null,"checkpoint_id": string,"expedition_id": string,"reached_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id"?: string | null,"checkpoint_id": string,"expedition_id": string,"reached_at"?: string
                  }
                  Update: {
                    "activity_id"?: string | null,"checkpoint_id"?: string,"expedition_id"?: string,"reached_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expedition_checkpoint_unlocks_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expedition_checkpoint_unlocks_checkpoint_id_fkey"
      columns: ["checkpoint_id"]
isOneToOne: false
      referencedRelation: "journey_checkpoints"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expedition_checkpoint_unlocks_expedition_id_fkey"
      columns: ["expedition_id"]
isOneToOne: false
      referencedRelation: "journey_expeditions"
      referencedColumns: ["id"]
    }
                  ]
                },"experience_transactions": {
                  Row: {
                    "activity_id": string | null,"amount": number,"created_at": string,"id": number,"reason": string,"source_key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id"?: string | null,"amount": number,"created_at"?: string,"id"?: never,"reason": string,"source_key": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string | null,"amount"?: number,"created_at"?: string,"id"?: never,"reason"?: string,"source_key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "experience_transactions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "experience_transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"friendships": {
                  Row: {
                    "created_at": string,"requested_by": string,"responded_at": string | null,"status": Database["public"]['Enums']["friendship_status"],"user_high": string,"user_low": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"requested_by": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["friendship_status"],"user_high": string,"user_low": string
                  }
                  Update: {
                    "created_at"?: string,"requested_by"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["friendship_status"],"user_high"?: string,"user_low"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "friendships_user_high_fkey"
      columns: ["user_high"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "friendships_user_low_fkey"
      columns: ["user_low"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"game_settings": {
                  Row: {
                    "description": string | null,"key": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "challenge_id": string | null,"created_at": string,"expedition_id": string | null,"expires_at": string,"id": string,"invitee_id": string,"inviter_id": string,"kind": string,"responded_at": string | null,"status": Database["public"]['Enums']["invitation_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge_id"?: string | null,"created_at"?: string,"expedition_id"?: string | null,"expires_at"?: string,"id"?: string,"invitee_id": string,"inviter_id": string,"kind": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"]
                  }
                  Update: {
                    "challenge_id"?: string | null,"created_at"?: string,"expedition_id"?: string | null,"expires_at"?: string,"id"?: string,"invitee_id"?: string,"inviter_id"?: string,"kind"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_expedition_id_fkey"
      columns: ["expedition_id"]
isOneToOne: false
      referencedRelation: "journey_expeditions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_invitee_id_fkey"
      columns: ["invitee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_inviter_id_fkey"
      columns: ["inviter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"journey_checkpoints": {
                  Row: {
                    "description": string,"distance_m": number,"id": string,"journey_id": string,"name": string,"position": number,"story": string | null,"xp_reward": number
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"distance_m": number,"id"?: string,"journey_id": string,"name": string,"position": number,"story"?: string | null,"xp_reward"?: number
                  }
                  Update: {
                    "description"?: string,"distance_m"?: number,"id"?: string,"journey_id"?: string,"name"?: string,"position"?: number,"story"?: string | null,"xp_reward"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "journey_checkpoints_journey_id_fkey"
      columns: ["journey_id"]
isOneToOne: false
      referencedRelation: "journeys"
      referencedColumns: ["id"]
    }
                  ]
                },"journey_contributions": {
                  Row: {
                    "activity_id": string | null,"created_at": string,"expedition_id": string,"id": number,"user_id": string,"value_m": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id"?: string | null,"created_at"?: string,"expedition_id": string,"id"?: never,"user_id": string,"value_m": number
                  }
                  Update: {
                    "activity_id"?: string | null,"created_at"?: string,"expedition_id"?: string,"id"?: never,"user_id"?: string,"value_m"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "journey_contributions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journey_contributions_expedition_id_fkey"
      columns: ["expedition_id"]
isOneToOne: false
      referencedRelation: "journey_expeditions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journey_contributions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"journey_expedition_members": {
                  Row: {
                    "contributed_m": number,"expedition_id": string,"is_active": boolean,"joined_at": string,"journey_id": string,"left_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contributed_m"?: number,"expedition_id": string,"is_active"?: boolean,"joined_at"?: string,"journey_id": string,"left_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "contributed_m"?: number,"expedition_id"?: string,"is_active"?: boolean,"joined_at"?: string,"journey_id"?: string,"left_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "journey_expedition_members_expedition_id_fkey"
      columns: ["expedition_id"]
isOneToOne: false
      referencedRelation: "journey_expeditions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journey_expedition_members_journey_id_fkey"
      columns: ["journey_id"]
isOneToOne: false
      referencedRelation: "journeys"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journey_expedition_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"journey_expeditions": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"created_by": string | null,"id": string,"invite_code": string | null,"journey_id": string,"mode": Database["public"]['Enums']["journey_mode"],"name": string | null,"progress_m": number,"started_at": string,"status": Database["public"]['Enums']["expedition_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string | null,"journey_id": string,"mode": Database["public"]['Enums']["journey_mode"],"name"?: string | null,"progress_m"?: number,"started_at"?: string,"status"?: Database["public"]['Enums']["expedition_status"]
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string | null,"journey_id"?: string,"mode"?: Database["public"]['Enums']["journey_mode"],"name"?: string | null,"progress_m"?: number,"started_at"?: string,"status"?: Database["public"]['Enums']["expedition_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "journey_expeditions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journey_expeditions_journey_id_fkey"
      columns: ["journey_id"]
isOneToOne: false
      referencedRelation: "journeys"
      referencedColumns: ["id"]
    }
                  ]
                },"journeys": {
                  Row: {
                    "activity_types": (Database["public"]['Enums']["activity_type"])[],"allow_manual": boolean,"art_key": string,"completion_xp": number,"created_at": string,"description": string,"difficulty": string,"id": string,"is_fictional": boolean,"is_published": boolean,"map_path": NonNullable<Json>,"max_group_size": number,"region": string | null,"reward_theme_id": string | null,"slug": string,"sort_order": number,"story_intro": string | null,"subtitle": string,"supports_group": boolean,"supports_solo": boolean,"title": string,"total_distance_m": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_types": (Database["public"]['Enums']["activity_type"])[],"allow_manual"?: boolean,"art_key": string,"completion_xp"?: number,"created_at"?: string,"description": string,"difficulty"?: string,"id"?: string,"is_fictional"?: boolean,"is_published"?: boolean,"map_path": NonNullable<Json>,"max_group_size"?: number,"region"?: string | null,"reward_theme_id"?: string | null,"slug": string,"sort_order"?: number,"story_intro"?: string | null,"subtitle": string,"supports_group"?: boolean,"supports_solo"?: boolean,"title": string,"total_distance_m": number
                  }
                  Update: {
                    "activity_types"?: (Database["public"]['Enums']["activity_type"])[],"allow_manual"?: boolean,"art_key"?: string,"completion_xp"?: number,"created_at"?: string,"description"?: string,"difficulty"?: string,"id"?: string,"is_fictional"?: boolean,"is_published"?: boolean,"map_path"?: NonNullable<Json>,"max_group_size"?: number,"region"?: string | null,"reward_theme_id"?: string | null,"slug"?: string,"sort_order"?: number,"story_intro"?: string | null,"subtitle"?: string,"supports_group"?: boolean,"supports_solo"?: boolean,"title"?: string,"total_distance_m"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "journeys_reward_theme_id_fkey"
      columns: ["reward_theme_id"]
isOneToOne: false
      referencedRelation: "themes"
      referencedColumns: ["id"]
    }
                  ]
                },"levels": {
                  Row: {
                    "level": number,"title": string,"xp_required": number
                  }
                  ComputedFields: never
                  Insert: {
                    "level": number,"title": string,"xp_required": number
                  }
                  Update: {
                    "level"?: number,"title"?: string,"xp_required"?: number
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string,"created_at": string,"data": NonNullable<Json>,"dedupe_key": string | null,"id": string,"read_at": string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"body": string,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string | null,"id"?: string,"read_at"?: string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string | null,"id"?: string,"read_at"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string,"equipped_theme_id": string | null,"fitness_goal": string | null,"id": string,"onboarding_completed_at": string | null,"preferred_activity_types": (Database["public"]['Enums']["activity_type"])[],"profile_visibility": Database["public"]['Enums']["visibility"],"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name": string,"equipped_theme_id"?: string | null,"fitness_goal"?: string | null,"id": string,"onboarding_completed_at"?: string | null,"preferred_activity_types"?: (Database["public"]['Enums']["activity_type"])[],"profile_visibility"?: Database["public"]['Enums']["visibility"],"updated_at"?: string,"username": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string,"equipped_theme_id"?: string | null,"fitness_goal"?: string | null,"id"?: string,"onboarding_completed_at"?: string | null,"preferred_activity_types"?: (Database["public"]['Enums']["activity_type"])[],"profile_visibility"?: Database["public"]['Enums']["visibility"],"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_equipped_theme_unlocked"
      columns: ["id","equipped_theme_id"]
isOneToOne: false
      referencedRelation: "user_unlocked_themes"
      referencedColumns: ["user_id","theme_id"]
    }
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"platform": string,"token": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"platform": string,"token": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"platform"?: string,"token"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"themes": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"is_active": boolean,"name": string,"palette": NonNullable<Json>,"sort_order": number,"tier": string,"unlock_rule": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id": string,"is_active"?: boolean,"name": string,"palette": NonNullable<Json>,"sort_order"?: number,"tier"?: string,"unlock_rule": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"palette"?: NonNullable<Json>,"sort_order"?: number,"tier"?: string,"unlock_rule"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"user_achievements": {
                  Row: {
                    "achievement_id": string,"context": NonNullable<Json>,"earned_at": string,"source_activity_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achievement_id": string,"context"?: NonNullable<Json>,"earned_at"?: string,"source_activity_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "achievement_id"?: string,"context"?: NonNullable<Json>,"earned_at"?: string,"source_activity_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_achievements_achievement_id_fkey"
      columns: ["achievement_id"]
isOneToOne: false
      referencedRelation: "achievements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_achievements_source_activity_id_fkey"
      columns: ["source_activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_achievements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "default_activity_visibility": Database["public"]['Enums']["visibility"],"hide_route_endpoints": boolean,"measurement_system": Database["public"]['Enums']["measurement_system"],"notify_push": boolean,"share_routes": boolean,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "default_activity_visibility"?: Database["public"]['Enums']["visibility"],"hide_route_endpoints"?: boolean,"measurement_system"?: Database["public"]['Enums']["measurement_system"],"notify_push"?: boolean,"share_routes"?: boolean,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "default_activity_visibility"?: Database["public"]['Enums']["visibility"],"hide_route_endpoints"?: boolean,"measurement_system"?: Database["public"]['Enums']["measurement_system"],"notify_push"?: boolean,"share_routes"?: boolean,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_stats": {
                  Row: {
                    "activity_count": number,"daily_streak_days": number,"daily_streak_last_date": string | null,"longest_daily_streak": number,"total_distance_m": number,"total_elevation_gain_m": number,"total_moving_time_s": number,"updated_at": string,"user_id": string,"weekly_streak_last_week": string | null,"weekly_streak_weeks": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_count"?: number,"daily_streak_days"?: number,"daily_streak_last_date"?: string | null,"longest_daily_streak"?: number,"total_distance_m"?: number,"total_elevation_gain_m"?: number,"total_moving_time_s"?: number,"updated_at"?: string,"user_id": string,"weekly_streak_last_week"?: string | null,"weekly_streak_weeks"?: number
                  }
                  Update: {
                    "activity_count"?: number,"daily_streak_days"?: number,"daily_streak_last_date"?: string | null,"longest_daily_streak"?: number,"total_distance_m"?: number,"total_elevation_gain_m"?: number,"total_moving_time_s"?: number,"updated_at"?: string,"user_id"?: string,"weekly_streak_last_week"?: string | null,"weekly_streak_weeks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_stats_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_unlocked_themes": {
                  Row: {
                    "source": string,"theme_id": string,"unlocked_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "source": string,"theme_id": string,"unlocked_at"?: string,"user_id": string
                  }
                  Update: {
                    "source"?: string,"theme_id"?: string,"unlocked_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_unlocked_themes_theme_id_fkey"
      columns: ["theme_id"]
isOneToOne: false
      referencedRelation: "themes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_unlocked_themes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_xp": {
                  Row: {
                    "level": number,"updated_at": string,"user_id": string,"xp_total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "level"?: number,"updated_at"?: string,"user_id": string,"xp_total"?: number
                  }
                  Update: {
                    "level"?: number,"updated_at"?: string,"user_id"?: string,"xp_total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_xp_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"xp_rules": {
                  Row: {
                    "activity_type": Database["public"]['Enums']["activity_type"],"base_xp": number,"xp_per_10_min": number,"xp_per_km": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_type": Database["public"]['Enums']["activity_type"],"base_xp": number,"xp_per_10_min": number,"xp_per_km": number
                  }
                  Update: {
                    "activity_type"?: Database["public"]['Enums']["activity_type"],"base_xp"?: number,"xp_per_10_min"?: number,"xp_per_km"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_comment":
{ Args: { "p_activity_id": string,"p_body": string }; Returns: {
              "activity_id": string,
"body": string,
"created_at": string,
"id": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "activity_comments"
        isOneToOne: true
        isSetofReturn: false
      } },
"block_user":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"check_username_available":
{ Args: { "p_username": string }; Returns: boolean
                           },
"create_challenge":
{ Args: { "p": Json }; Returns: string
                           },
"delete_activity":
{ Args: { "p_activity_id": string }; Returns: undefined
                           },
"delete_comment":
{ Args: { "p_comment_id": string }; Returns: undefined
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"equip_theme":
{ Args: { "p_theme_id": string }; Returns: undefined
                           },
"get_achievement_progress":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": string,"current_value": number,"description": string,"earned_at": string,"icon": string,"id": string,"reward_theme_id": string,"rule_type": string,"sort_order": number,"target_value": number,"tier": string,"title": string,"xp_reward": number
            }[]
                           },
"get_activity_stats":
{ Args: { "p_bucket"?: string,"p_from": string,"p_to": string,"p_types"?: (Database["public"]['Enums']["activity_type"])[] }; Returns: {
              "activity_count": number,"bucket_start": string,"distance_m": number,"moving_time_s": number
            }[]
                           },
"get_blocked_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"blocked_at": string,"display_name": string,"user_id": string,"username": string
            }[]
                           },
"get_challenge_leaderboard":
{ Args: { "p_challenge_id": string,"p_limit"?: number,"p_scope"?: string }; Returns: {
              "avatar_url": string,"completed_at": string,"display_name": string,"is_me": boolean,"level": number,"rank": number,"team_id": string,"user_id": string,"username": string,"value": number
            }[]
                           },
"get_feed":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: {
              "actor": Json,"item_id": string,"kind": string,"occurred_at": string,"payload": Json
            }[]
                           },
"get_friends":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"display_name": string,"level": number,"since": string,"status": string,"user_id": string,"username": string
            }[]
                           },
"get_leaderboard":
{ Args: { "p_limit"?: number,"p_metric"?: Database["public"]['Enums']["challenge_metric"],"p_period"?: string,"p_scope"?: string }; Returns: {
              "avatar_url": string,"display_name": string,"is_me": boolean,"level": number,"rank": number,"user_id": string,"username": string,"value": number
            }[]
                           },
"get_personal_records":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_public_profile":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"invite_to_challenge":
{ Args: { "p_challenge_id": string,"p_user_ids": (string)[] }; Returns: number
                           },
"invite_to_expedition":
{ Args: { "p_expedition_id": string,"p_user_ids": (string)[] }; Returns: number
                           },
"join_challenge":
{ Args: { "p_challenge_id": string,"p_invite_code"?: string,"p_team_id"?: string }; Returns: {
              "challenge_id": string,
"completed_at": string | null,
"contribution_count": number,
"final_rank": number | null,
"joined_at": string,
"last_progress_at": string | null,
"progress_value": number,
"team_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "challenge_participants"
        isOneToOne: true
        isSetofReturn: false
      } },
"join_challenge_by_code":
{ Args: { "p_code": string }; Returns: string
                           },
"join_expedition":
{ Args: { "p_code"?: string,"p_expedition_id"?: string }; Returns: string
                           },
"leave_challenge":
{ Args: { "p_challenge_id": string }; Returns: undefined
                           },
"leave_expedition":
{ Args: { "p_expedition_id": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"refresh_challenges":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"register_push_token":
{ Args: { "p_platform": string,"p_token": string }; Returns: undefined
                           },
"remove_activity_route":
{ Args: { "p_activity_id": string }; Returns: undefined
                           },
"remove_friend":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"respond_friend_request":
{ Args: { "p_accept": boolean,"p_user_id": string }; Returns: string
                           },
"respond_invitation":
{ Args: { "p_accept": boolean,"p_invitation_id": string,"p_team_id"?: string }; Returns: Json
                           },
"search_profiles":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "avatar_url": string,"display_name": string,"friendship": string,"id": string,"level": number,"username": string
            }[]
                           },
"send_friend_request":
{ Args: { "p_user_id": string }; Returns: string
                           },
"start_expedition":
{ Args: { "p_journey_id": string,"p_mode"?: Database["public"]['Enums']["journey_mode"],"p_name"?: string }; Returns: string
                           },
"submit_activity":
{ Args: { "p_client_id": string,"p_description"?: string,"p_distance_m"?: number,"p_elapsed_time_s": number,"p_elevation_gain_m"?: number,"p_moving_time_s": number,"p_route"?: Json,"p_source": Database["public"]['Enums']["activity_source"],"p_started_at": string,"p_timezone"?: string,"p_title"?: string,"p_type": Database["public"]['Enums']["activity_type"],"p_visibility"?: Database["public"]['Enums']["visibility"] }; Returns: Json
                           },
"toggle_reaction":
{ Args: { "p_activity_id": string }; Returns: Json
                           },
"unblock_user":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"update_activity":
{ Args: { "p_activity_id": string,"p_patch": Json }; Returns: {
              "avg_speed_mps": number | null,
"client_id": string,
"created_at": string,
"description": string | null,
"distance_m": number,
"elapsed_time_s": number,
"elevation_gain_m": number | null,
"ended_at": string,
"has_route": boolean,
"id": string,
"ineligible_reason": string | null,
"is_eligible": boolean,
"local_date": string,
"moving_time_s": number,
"route_preview": Json | null,
"source": Database["public"]['Enums']["activity_source"],
"started_at": string,
"timezone": string,
"title": string,
"type": Database["public"]['Enums']["activity_type"],
"updated_at": string,
"user_id": string,
"visibility": Database["public"]['Enums']["visibility"]
            }
                          SetofOptions: {
        from: "*"
        to: "activities"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "activity_source": "gps"|"manual","activity_type": "run"|"indoor_run"|"walk"|"ride"|"hike"|"swim"|"workout"|"other","challenge_metric": "distance"|"duration"|"count","challenge_mode": "individual"|"competitive"|"collaborative"|"team","challenge_period": "weekly"|"monthly"|"yearly"|"custom","challenge_recurrence": "none"|"weekly"|"monthly"|"yearly","challenge_visibility": "public"|"private","expedition_status": "active"|"completed"|"abandoned","friendship_status": "pending"|"accepted","invitation_status": "pending"|"accepted"|"declined"|"revoked","journey_mode": "solo"|"group","measurement_system": "metric"|"imperial","notification_type": "friend_request"|"friend_accepted"|"challenge_invite"|"expedition_invite"|"challenge_milestone"|"challenge_completed"|"challenge_finished"|"achievement_unlocked"|"journey_checkpoint"|"journey_completed"|"level_up"|"theme_unlocked"|"activity_reaction"|"activity_comment","visibility": "public"|"friends"|"private"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activity_source": ["gps", "manual"],"activity_type": ["run", "indoor_run", "walk", "ride", "hike", "swim", "workout", "other"],"challenge_metric": ["distance", "duration", "count"],"challenge_mode": ["individual", "competitive", "collaborative", "team"],"challenge_period": ["weekly", "monthly", "yearly", "custom"],"challenge_recurrence": ["none", "weekly", "monthly", "yearly"],"challenge_visibility": ["public", "private"],"expedition_status": ["active", "completed", "abandoned"],"friendship_status": ["pending", "accepted"],"invitation_status": ["pending", "accepted", "declined", "revoked"],"journey_mode": ["solo", "group"],"measurement_system": ["metric", "imperial"],"notification_type": ["friend_request", "friend_accepted", "challenge_invite", "expedition_invite", "challenge_milestone", "challenge_completed", "challenge_finished", "achievement_unlocked", "journey_checkpoint", "journey_completed", "level_up", "theme_unlocked", "activity_reaction", "activity_comment"],"visibility": ["public", "friends", "private"]
          }
        }
} as const
