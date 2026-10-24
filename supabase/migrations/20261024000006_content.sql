-- Product content: themes, levels, XP rules, achievements, journeys and official challenges.
-- This is production configuration (not dev fixtures). Operators can change thresholds, add
-- journeys or retire themes with SQL / the dashboard; the app reads everything at runtime.
-- Real-world journey distances are approximate game values, not surveyed route lengths.

-- ---------------------------------------------------------------------------
-- Game settings
-- ---------------------------------------------------------------------------

insert into public.game_settings (key, value, description) values
  ('daily_activity_xp_cap', '400', 'Maximum XP earned from activities per local day. Keeps XP from rewarding over-training.'),
  ('streak_min_moving_s', '600', 'Minimum moving time (seconds) for an activity to count toward streaks.')
on conflict (key) do update set value = excluded.value, description = excluded.description;

insert into public.xp_rules (activity_type, base_xp, xp_per_km, xp_per_10_min) values
  ('run', 10, 6, 1),
  ('indoor_run', 10, 5, 1),
  ('walk', 8, 4, 1),
  ('hike', 10, 5, 1.5),
  ('ride', 10, 2, 1),
  ('swim', 10, 15, 1),
  ('workout', 10, 0, 4),
  ('other', 8, 2, 2)
on conflict (activity_type) do update set
  base_xp = excluded.base_xp, xp_per_km = excluded.xp_per_km, xp_per_10_min = excluded.xp_per_10_min;

-- Levels: xp_required = round(50 * (level - 1) ^ 1.8).
insert into public.levels (level, xp_required, title)
select n,
       round(50 * power(n - 1, 1.8))::bigint,
       case
         when n >= 50 then 'Eternal Explorer'
         when n >= 45 then 'Mythwalker'
         when n >= 40 then 'Legend'
         when n >= 35 then 'Warden'
         when n >= 30 then 'Vanguard'
         when n >= 25 then 'Trailblazer'
         when n >= 20 then 'Voyager'
         when n >= 15 then 'Pioneer'
         when n >= 10 then 'Ranger'
         when n >= 7 then 'Pathfinder'
         when n >= 4 then 'Trailfinder'
         else 'Wanderer'
       end
from generate_series(1, 50) as n
on conflict (level) do update set xp_required = excluded.xp_required, title = excluded.title;

-- ---------------------------------------------------------------------------
-- Themes
-- Palette tokens: accent, accentMuted, onAccent, secondary, heroDark[2], heroLight[2], pattern.
-- ---------------------------------------------------------------------------

insert into public.themes (id, name, description, tier, palette, unlock_rule, sort_order) values
  ('trailhead', 'Trailhead', 'Jade and lantern gold. Every adventure starts here.', 'standard',
   '{"accent":"#1FC99A","accentMuted":"#0F6E56","onAccent":"#03241B","secondary":"#F2B544","heroDark":["#0C2A25","#0E1A1F"],"heroLight":["#D9F5EA","#F6FBF8"],"pattern":"contours"}',
   '{"type":"default"}', 10),
  ('ember', 'Ember Path', 'Warm coals for your first 5 km. The fire is lit.', 'standard',
   '{"accent":"#FF7A45","accentMuted":"#9C3A12","onAccent":"#2B0D02","secondary":"#FFC857","heroDark":["#2D140B","#1A1210"],"heroLight":["#FFE6DA","#FFF8F3"],"pattern":"embers"}',
   '{"type":"total_distance","threshold_m":5000}', 20),
  ('summit', 'Summit Frost', 'Glacier blue for joining the 100 km club.', 'rare',
   '{"accent":"#4FB7FF","accentMuted":"#1D5D8C","onAccent":"#03192B","secondary":"#C9E8FF","heroDark":["#0B1E33","#0D141F"],"heroLight":["#DCEFFF","#F5FAFF"],"pattern":"peaks"}',
   '{"type":"total_distance","threshold_m":100000}', 30),
  ('aurora', 'Aurora Drift', 'Northern lights for 500 km of determination.', 'epic',
   '{"accent":"#9B7BFF","accentMuted":"#4B3699","onAccent":"#140A33","secondary":"#4DE8C2","heroDark":["#1A1238","#0D1222"],"heroLight":["#ECE6FF","#F8F6FF"],"pattern":"aurora"}',
   '{"type":"total_distance","threshold_m":500000}', 40),
  ('mythic', 'Mythic Expedition', 'Obsidian and gold for 1,000 km travelled.', 'mythic',
   '{"accent":"#F5C451","accentMuted":"#8A6516","onAccent":"#2A1D02","secondary":"#E8E1CF","heroDark":["#1E1A10","#0E0D0B"],"heroLight":["#FBF0D2","#FFFBF0"],"pattern":"runes"}',
   '{"type":"total_distance","threshold_m":1000000}', 50),
  ('laurel', 'Champion''s Laurel', 'Evergreen and bronze, awarded at level 10.', 'rare',
   '{"accent":"#7CCB4E","accentMuted":"#3D6E22","onAccent":"#0F2405","secondary":"#D9A066","heroDark":["#13240E","#0F150D"],"heroLight":["#E6F5DA","#F8FCF4"],"pattern":"contours"}',
   '{"type":"level","level":10}', 60),
  ('ashen_crown', 'Ashen Crown', 'Crimson skies of the Ashen Peak. Only for those who reached the summit.', 'mythic',
   '{"accent":"#FF5A5F","accentMuted":"#8F1F27","onAccent":"#2B0507","secondary":"#FFB15C","heroDark":["#2A0D10","#141012"],"heroLight":["#FFE1E2","#FFF7F7"],"pattern":"embers"}',
   '{"type":"reward"}', 70),
  ('alpenglow', 'Alpenglow', 'Rose-lit granite from the high passes between Chamonix and Zermatt.', 'epic',
   '{"accent":"#FF8FA3","accentMuted":"#9A3A50","onAccent":"#2E0A13","secondary":"#A9C7E8","heroDark":["#25141C","#121319"],"heroLight":["#FFE5EB","#FFF8FA"],"pattern":"peaks"}',
   '{"type":"reward"}', 80),
  ('sakura', 'Sakura Road', 'Blossoms along the old Tōkaidō.', 'epic',
   '{"accent":"#FF9EC7","accentMuted":"#99406A","onAccent":"#33081D","secondary":"#FFE3A3","heroDark":["#2A1220","#151116"],"heroLight":["#FFE6F1","#FFF8FB"],"pattern":"petals"}',
   '{"type":"reward"}', 90),
  ('caucasus', 'Caucasus Vine', 'Saperavi red and mountain green, from the Black Sea to Kazbegi.', 'epic',
   '{"accent":"#E0526F","accentMuted":"#7D2236","onAccent":"#2A0710","secondary":"#7FC48A","heroDark":["#251018","#111512"],"heroLight":["#FBE1E7","#F8FBF6"],"pattern":"peaks"}',
   '{"type":"reward"}', 100),
  ('tidewater', 'Tidewater', 'Atlantic blues from Porto to Santiago.', 'epic',
   '{"accent":"#3CC6D9","accentMuted":"#156C78","onAccent":"#03252A","secondary":"#F7D488","heroDark":["#0A2329","#0C1519"],"heroLight":["#D8F6FA","#F4FCFD"],"pattern":"waves"}',
   '{"type":"reward"}', 110),
  ('sky_lantern', 'Sky Lantern', 'Amber lights over indigo seas, earned together.', 'mythic',
   '{"accent":"#FFB347","accentMuted":"#8F5A10","onAccent":"#2B1702","secondary":"#8C9EFF","heroDark":["#151634","#0D0F1F"],"heroLight":["#FFF0D9","#F7F8FF"],"pattern":"aurora"}',
   '{"type":"reward"}', 120)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, tier = excluded.tier,
  palette = excluded.palette, unlock_rule = excluded.unlock_rule, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Achievements (icons are MaterialCommunityIcons names rendered by the app)
-- ---------------------------------------------------------------------------

insert into public.achievements (id, title, description, icon, tier, category, rule, xp_reward, reward_theme_id, sort_order) values
  ('first_steps', 'First Steps', 'Record or log your first activity.', 'shoe-print', 'bronze', 'milestone',
   '{"type":"activity_count","count":1}', 25, null, 10),
  ('first_5k', 'First 5K', 'Complete a single run of at least 5 km.', 'run-fast', 'bronze', 'distance',
   '{"type":"single_activity_distance","threshold_m":5000,"activity_types":["run","indoor_run"]}', 50, null, 20),
  ('double_digits', 'Double Digits', 'Complete a single run of at least 10 km.', 'numeric-10-circle', 'silver', 'distance',
   '{"type":"single_activity_distance","threshold_m":10000,"activity_types":["run","indoor_run"]}', 75, null, 30),
  ('half_marathoner', 'Half Marathoner', 'Run at least 21.1 km in a single activity.', 'trophy-variant', 'gold', 'distance',
   '{"type":"single_activity_distance","threshold_m":21097,"activity_types":["run","indoor_run"]}', 150, null, 40),
  ('club_100k', '100 KM Club', 'Accumulate 100 km across all activities.', 'medal', 'silver', 'distance',
   '{"type":"total_distance","threshold_m":100000}', 100, null, 50),
  ('trail_seeker', 'Trail Seeker', 'Hike 50 km in total.', 'pine-tree', 'silver', 'distance',
   '{"type":"total_distance","threshold_m":50000,"activity_types":["hike"]}', 75, null, 55),
  ('century_ride', 'Century Ride', 'Ride 100 km in a single activity.', 'bike-fast', 'gold', 'distance',
   '{"type":"single_activity_distance","threshold_m":100000,"activity_types":["ride"]}', 150, null, 60),
  ('explorer_1000k', '1,000 KM Explorer', 'Accumulate 1,000 km across all activities.', 'compass-rose', 'gold', 'distance',
   '{"type":"total_distance","threshold_m":1000000}', 300, null, 70),
  ('seven_day_streak', 'Seven-Day Streak', 'Be active (10+ minutes) on seven consecutive days.', 'fire', 'silver', 'consistency',
   '{"type":"daily_streak","days":7}', 100, null, 80),
  ('thirty_sessions', 'Thirty Sessions', 'Complete 30 activities.', 'calendar-star', 'silver', 'consistency',
   '{"type":"activity_count","count":30}', 100, null, 90),
  ('early_bird', 'Early Bird', 'Start a 10+ minute activity before 7:00.', 'weather-sunset-up', 'bronze', 'consistency',
   '{"type":"early_activity","before_hour":7}', 25, null, 100),
  ('monthly_finisher', 'Monthly Finisher', 'Complete a monthly challenge.', 'calendar-check', 'silver', 'challenges',
   '{"type":"challenges_completed","count":1,"period":"monthly"}', 75, null, 110),
  ('team_player', 'Team Player', 'Help a group or team reach a shared challenge goal.', 'account-group', 'silver', 'challenges',
   '{"type":"challenges_completed","count":1,"modes":["collaborative","team"]}', 75, null, 120),
  ('challenge_hunter', 'Challenge Hunter', 'Complete five challenges.', 'flag-checkered', 'gold', 'challenges',
   '{"type":"challenges_completed","count":5}', 150, null, 130),
  ('epic_journey', 'Epic Journey Completed', 'Finish any epic journey.', 'map-marker-path', 'gold', 'journeys',
   '{"type":"journeys_completed","count":1}', 200, null, 140),
  ('fellowship', 'Fellowship', 'Make three friends on QuestFit.', 'handshake', 'bronze', 'social',
   '{"type":"friends","count":3}', 25, null, 150),
  ('seasoned_ranger', 'Seasoned Ranger', 'Reach level 10.', 'shield-star', 'gold', 'milestone',
   '{"type":"level","level":10}', 0, null, 160)
on conflict (id) do update set
  title = excluded.title, description = excluded.description, icon = excluded.icon, tier = excluded.tier,
  category = excluded.category, rule = excluded.rule, xp_reward = excluded.xp_reward,
  reward_theme_id = excluded.reward_theme_id, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Journeys and checkpoints
-- ---------------------------------------------------------------------------

insert into public.journeys (
  slug, title, subtitle, description, story_intro, art_key, region, is_fictional, total_distance_m,
  activity_types, allow_manual, supports_solo, supports_group, max_group_size, completion_xp,
  reward_theme_id, difficulty, map_path, sort_order
) values
  ('ashen-peak', 'The Road to the Ashen Peak', 'An original fantasy expedition',
   'Leave the quiet valleys of Hearthmeadow and carry your lantern across mountains, plains and the Iron Gate to the smouldering summit of the Ashen Peak.',
   'Every legend starts with a single step out of the door. Somewhere far to the east, a mountain glows at night. Nobody from Hearthmeadow has ever reached it. Yet.',
   'ashen', 'The Realm of Elsewhere', true, 1000000,
   '{run,indoor_run,walk,hike}', true, true, true, 12, 1000, 'ashen_crown', 'epic',
   '[[0.10,0.90],[0.20,0.82],[0.28,0.72],[0.22,0.62],[0.32,0.52],[0.48,0.48],[0.60,0.54],[0.72,0.46],[0.68,0.34],[0.78,0.24],[0.88,0.10]]', 10),
  ('haute-route', 'Across the Alps', 'Chamonix to Zermatt beneath Mont Blanc and the Matterhorn',
   'Trace the classic high route between two great alpine towns: over cols, past glacier lakes and through quiet Valais villages.',
   'Two of the most famous peaks in the Alps stand at either end of this route. The way between them is all yours.',
   'alps', 'France and Switzerland', false, 200000,
   '{run,walk,hike,indoor_run}', true, true, true, 12, 400, 'alpenglow', 'moderate',
   '[[0.08,0.30],[0.20,0.22],[0.30,0.38],[0.42,0.30],[0.52,0.46],[0.60,0.40],[0.70,0.56],[0.80,0.50],[0.92,0.70]]', 20),
  ('tokaido', 'The Tōkaidō Road', 'Edo to Kyoto along Japan''s historic coastal highway',
   'Follow the old Eastern Sea Road from Nihonbashi in Tokyo to the Sanjō bridge in Kyoto, passing Hakone, Mount Fuji''s foothills and the castle towns of the coast.',
   'For centuries travellers walked this road between the shogun''s city and the imperial capital. Now it is your turn.',
   'japan', 'Japan', false, 492000,
   '{run,walk,hike,ride,indoor_run}', true, true, true, 12, 700, 'sakura', 'hard',
   '[[0.92,0.28],[0.80,0.36],[0.70,0.34],[0.60,0.46],[0.50,0.50],[0.40,0.56],[0.30,0.52],[0.20,0.62],[0.10,0.58]]', 30),
  ('georgian-odyssey', 'Georgian Odyssey', 'From the Black Sea to the foot of Mount Kazbek',
   'Cross Georgia from subtropical Batumi through Kutaisi, the spa forests of Borjomi, ancient Uplistsikhe and Mtskheta, the streets of Tbilisi, and up the Georgian Military Road to Stepantsminda.',
   'Vineyards, cave cities, sulphur baths and the high Caucasus. This road has welcomed travellers for three thousand years.',
   'georgia', 'Georgia', false, 555000,
   '{run,walk,hike,ride,indoor_run}', true, true, true, 12, 750, 'caucasus', 'hard',
   '[[0.06,0.62],[0.22,0.52],[0.36,0.66],[0.48,0.60],[0.56,0.62],[0.66,0.54],[0.72,0.60],[0.78,0.42],[0.84,0.20]]', 40),
  ('atlantic-coast', 'The Atlantic Coastal Way', 'Porto to Santiago de Compostela by the sea',
   'Walk the coastal pilgrim way north from Porto: fishing towns, sea forts and long beaches into Galicia, then inland to the cathedral city of Santiago.',
   'Salt air on one side, pine forests on the other, and a cathedral waiting at the end.',
   'coast', 'Portugal and Spain', false, 265000,
   '{run,walk,hike,indoor_run}', true, true, true, 12, 450, 'tidewater', 'moderate',
   '[[0.30,0.92],[0.26,0.80],[0.22,0.68],[0.24,0.56],[0.20,0.44],[0.28,0.32],[0.40,0.24],[0.52,0.16],[0.62,0.08]]', 50),
  ('sky-lantern', 'Expedition to the Sky Lantern Isles', 'A community voyage to a fictional archipelago',
   'Rally a crew and sail together across 5,000 km of imagined seas to light the great lantern on the highest isle. Every member''s distance moves the ship.',
   'Legend says the lantern can only be lit by a crew, never by a lone sailor. Gather your friends.',
   'lantern', 'The Endless Sea', true, 5000000,
   '{run,indoor_run,walk,hike,ride,swim}', true, false, true, 50, 1200, 'sky_lantern', 'epic',
   '[[0.10,0.80],[0.24,0.70],[0.34,0.78],[0.46,0.64],[0.58,0.70],[0.66,0.52],[0.78,0.46],[0.84,0.30],[0.90,0.14]]', 60)
on conflict (slug) do update set
  title = excluded.title, subtitle = excluded.subtitle, description = excluded.description,
  story_intro = excluded.story_intro, art_key = excluded.art_key, region = excluded.region,
  is_fictional = excluded.is_fictional, total_distance_m = excluded.total_distance_m,
  activity_types = excluded.activity_types, allow_manual = excluded.allow_manual,
  supports_solo = excluded.supports_solo, supports_group = excluded.supports_group,
  max_group_size = excluded.max_group_size, completion_xp = excluded.completion_xp,
  reward_theme_id = excluded.reward_theme_id, difficulty = excluded.difficulty,
  map_path = excluded.map_path, sort_order = excluded.sort_order;

with cp (slug, position, name, description, story, distance_m, xp) as (
  values
    ('ashen-peak', 0, 'Hearthmeadow', 'Hedgerows, chimney smoke and the first step of the road.', 'You close the garden gate behind you. The road east is longer than anyone admits.', 0, 0),
    ('ashen-peak', 1, 'The Bramblewood Inn', 'A crooked inn where travellers trade rumours.', 'Over warm bread, a stranger draws you a map on a napkin. The Ashen Peak is real.', 60000, 50),
    ('ashen-peak', 2, 'Elderglade', 'A hidden valley of silver birches where plans are made.', 'The keepers of Elderglade give you a lantern that never goes out.', 240000, 100),
    ('ashen-peak', 3, 'Frostspine Pass', 'Snow, thin air and the hardest climb so far.', 'The wind tries to turn you back three times. Three times you keep walking.', 420000, 120),
    ('ashen-peak', 4, 'The Windswept Plains', 'Endless grassland under a restless sky.', 'Wild horses run beside you for a while, then vanish into the evening haze.', 600000, 120),
    ('ashen-peak', 5, 'The Iron Gate', 'A colossal gate of rusted iron guarding the ashen lands.', 'The gate creaks open just wide enough for one determined traveller.', 850000, 150),
    ('ashen-peak', 6, 'The Ashen Peak', 'The smouldering summit at the end of the world.', 'You raise your lantern at the summit. Far behind, Hearthmeadow sees a new star.', 1000000, 200),

    ('haute-route', 0, 'Chamonix', 'Beneath Mont Blanc, where the route begins.', null, 0, 0),
    ('haute-route', 1, 'Col de Balme', 'The first high col and the border into Switzerland.', null, 18000, 40),
    ('haute-route', 2, 'Champex-Lac', 'A mirror-still lake ringed by pines.', null, 45000, 50),
    ('haute-route', 3, 'Le Châble', 'Valley village below Verbier.', null, 65000, 50),
    ('haute-route', 4, 'Cabane de Prafleuri', 'A remote hut among old quarry stone.', null, 95000, 60),
    ('haute-route', 5, 'Arolla', 'Glaciers close enough to hear them crack.', null, 120000, 60),
    ('haute-route', 6, 'Zinal', 'The Val d''Anniviers and its five 4,000 m peaks.', null, 160000, 70),
    ('haute-route', 7, 'Zermatt', 'Car-free streets in the shadow of the Matterhorn.', null, 200000, 100),

    ('tokaido', 0, 'Nihonbashi', 'The bridge in Edo where every road was measured from.', null, 0, 0),
    ('tokaido', 1, 'Hakone', 'Hot springs and the old checkpoint barrier.', null, 100000, 60),
    ('tokaido', 2, 'Sunpu', 'Modern Shizuoka, in view of Mount Fuji.', null, 180000, 70),
    ('tokaido', 3, 'Hamamatsu', 'The castle town by Lake Hamana.', null, 250000, 70),
    ('tokaido', 4, 'Miya', 'Today''s Nagoya, where travellers took the ferry across the bay.', null, 340000, 80),
    ('tokaido', 5, 'Seki', 'A preserved post town of wooden inns.', null, 400000, 80),
    ('tokaido', 6, 'Kusatsu', 'Where the Tōkaidō and Nakasendō roads meet.', null, 465000, 80),
    ('tokaido', 7, 'Sanjō Ōhashi', 'The great bridge into Kyoto.', null, 492000, 120),

    ('georgian-odyssey', 0, 'Batumi', 'Palms and sea breeze on the Black Sea coast.', null, 0, 0),
    ('georgian-odyssey', 1, 'Kutaisi', 'Ancient capital of Colchis and the Bagrati Cathedral.', null, 150000, 70),
    ('georgian-odyssey', 2, 'Borjomi', 'Mineral springs and deep forest gorges.', null, 245000, 70),
    ('georgian-odyssey', 3, 'Gori', 'Crossroads town of the Kartli plain.', null, 310000, 60),
    ('georgian-odyssey', 4, 'Uplistsikhe', 'A cave city carved into rock three millennia ago.', null, 325000, 60),
    ('georgian-odyssey', 5, 'Mtskheta', 'Where the Aragvi and Mtkvari rivers meet beneath Jvari.', null, 385000, 70),
    ('georgian-odyssey', 6, 'Tbilisi', 'Sulphur baths, balconies and the old town.', null, 405000, 80),
    ('georgian-odyssey', 7, 'Ananuri', 'A fortress above the turquoise Zhinvali reservoir.', null, 470000, 70),
    ('georgian-odyssey', 8, 'Stepantsminda', 'Gergeti Trinity Church below the snows of Kazbek.', null, 555000, 120),

    ('atlantic-coast', 0, 'Porto', 'Ribeira''s riverside and the start of the coastal way.', null, 0, 0),
    ('atlantic-coast', 1, 'Vila do Conde', 'A shipbuilding town with a long aqueduct.', null, 28000, 40),
    ('atlantic-coast', 2, 'Esposende', 'Dunes and the Cávado estuary.', null, 52000, 40),
    ('atlantic-coast', 3, 'Viana do Castelo', 'Santa Luzia watches over the Lima river.', null, 78000, 50),
    ('atlantic-coast', 4, 'Caminha', 'The Minho river border into Spain.', null, 103000, 50),
    ('atlantic-coast', 5, 'Baiona', 'A fortified harbour on the Galician coast.', null, 140000, 50),
    ('atlantic-coast', 6, 'Vigo', 'A busy port facing the Cíes Islands.', null, 165000, 50),
    ('atlantic-coast', 7, 'Pontevedra', 'Stone squares and the pilgrims'' chapel.', null, 200000, 60),
    ('atlantic-coast', 8, 'Padrón', 'Where legend says the apostle''s boat came ashore.', null, 241000, 60),
    ('atlantic-coast', 9, 'Santiago de Compostela', 'The cathedral square at journey''s end.', null, 265000, 100),

    ('sky-lantern', 0, 'Harbour of First Light', 'The crew gathers and the ship slips its moorings.', 'Every sailor brings one lamp. Together they light the deck.', 0, 0),
    ('sky-lantern', 1, 'The Glass Reef', 'Shallow seas that shimmer like broken mirrors.', 'The water is so clear you can see your reflection in the coral.', 600000, 80),
    ('sky-lantern', 2, 'Stormwatch Lighthouse', 'A lighthouse keeper who has waited years for a crew like yours.', 'She trims your sails and points you toward the drifting markets.', 1400000, 100),
    ('sky-lantern', 3, 'The Drifting Markets', 'Floating bazaars tied together by rope bridges.', 'You trade stories for supplies. The merchants have heard of you.', 2300000, 120),
    ('sky-lantern', 4, 'Isle of Echoes', 'Cliffs that answer every voice twice.', 'The crew shouts their names and the isle repeats them all night.', 3300000, 140),
    ('sky-lantern', 5, 'The Lantern Spire', 'The highest isle and the great unlit lantern.', 'Together the crew lifts the flame. The whole sea turns gold.', 5000000, 250)
)
insert into public.journey_checkpoints (journey_id, position, name, description, story, distance_m, xp_reward)
select j.id, cp.position, cp.name, cp.description, cp.story, cp.distance_m, cp.xp
from cp join public.journeys j on j.slug = cp.slug
on conflict (journey_id, position) do update set
  name = excluded.name, description = excluded.description, story = excluded.story,
  distance_m = excluded.distance_m, xp_reward = excluded.xp_reward;

-- ---------------------------------------------------------------------------
-- Official recurring challenges. Only the current period's instance is created here; later
-- instances are rolled forward by refresh_challenges() / roll_recurring_challenges().
-- ---------------------------------------------------------------------------

with tpl (title, description, category, cover_art, mode, metric, target_value, activity_types, recurrence, xp_reward, featured) as (
  values
    ('Weekly 25K', 'Run 25 km this week, indoors or out.', 'running', 'ember', 'individual', 'distance', 25000::bigint,
     '{run,indoor_run}'::public.activity_type[], 'weekly', 100, true),
    ('Walk 50 km This Week', 'Fifty kilometres of walks and hikes in seven days.', 'walking', 'meadow', 'individual', 'distance', 50000::bigint,
     '{walk,hike}'::public.activity_type[], 'weekly', 120, false),
    ('Weekly Distance Duel', 'Most distance on foot this week wins. No finish line, just bragging rights.', 'competitive', 'duel', 'competitive', 'distance', null::bigint,
     '{run,indoor_run,walk,hike}'::public.activity_type[], 'weekly', 0, true),
    ('Monthly 100 km Run', 'The classic: 100 km of running in a calendar month.', 'running', 'summit', 'individual', 'distance', 100000::bigint,
     '{run,indoor_run}'::public.activity_type[], 'monthly', 200, true),
    ('Cycle 500 km in a Month', 'Five hundred kilometres in the saddle.', 'cycling', 'alps', 'individual', 'distance', 500000::bigint,
     '{ride}'::public.activity_type[], 'monthly', 250, false),
    ('20 Activities in a Month', 'Any sport counts. Show up twenty times this month.', 'consistency', 'trailhead', 'individual', 'count', 20::bigint,
     '{run,indoor_run,walk,ride,hike,swim,workout,other}'::public.activity_type[], 'monthly', 200, false),
    ('Hour Power: 10 Hours', 'Ten hours of moving time this month, in any sport.', 'consistency', 'aurora', 'individual', 'duration', 36000::bigint,
     '{run,indoor_run,walk,ride,hike,swim,workout,other}'::public.activity_type[], 'monthly', 150, false),
    ('Community 1,000 km', 'Everyone''s runs, walks, hikes and rides add up to one shared goal.', 'community', 'lantern', 'collaborative', 'distance', 1000000::bigint,
     '{run,indoor_run,walk,hike,ride}'::public.activity_type[], 'monthly', 150, true),
    ('Ember vs Tide', 'Pick a side. The team with the most distance on foot at month''s end wins.', 'teams', 'duel', 'team', 'distance', null::bigint,
     '{run,indoor_run,walk,hike}'::public.activity_type[], 'monthly', 0, true),
    ('Year of Movement: 1,000 km', 'One thousand kilometres over the whole year, in any distance sport.', 'yearly', 'mythic', 'individual', 'distance', 1000000::bigint,
     '{run,indoor_run,walk,hike,ride,swim}'::public.activity_type[], 'yearly', 500, false)
),
ins as (
  insert into public.challenges (
    series_id, title, description, category, cover_art, is_official, is_featured, visibility, mode, metric,
    target_value, activity_types, allow_manual, period, recurrence, timezone, starts_at, ends_at,
    submission_grace_hours, retroactive, xp_reward
  )
  select gen_random_uuid(), t.title, t.description, t.category, t.cover_art, true, t.featured, 'public',
         t.mode::public.challenge_mode, t.metric::public.challenge_metric, t.target_value, t.activity_types, true,
         t.recurrence::public.challenge_period, t.recurrence::public.challenge_recurrence, 'UTC',
         app_private.period_start(t.recurrence::public.challenge_recurrence, now(), 'UTC'),
         ((app_private.period_start(t.recurrence::public.challenge_recurrence, now(), 'UTC') at time zone 'UTC')
           + app_private.period_step(t.recurrence::public.challenge_recurrence)) at time zone 'UTC',
         72, true, t.xp_reward
  from tpl t
  where not exists (select 1 from public.challenges c where c.is_official and c.title = t.title)
  returning id, title
)
insert into public.challenge_teams (challenge_id, name, color)
select ins.id, team.name, team.color
from ins
cross join (values ('Team Ember', '#FF7A45'), ('Team Tide', '#3BA8FF')) as team(name, color)
where ins.title = 'Ember vs Tide';
