-- SmartSwing content library tables for drills and tactics

CREATE TABLE IF NOT EXISTS public.drill_library (
  id text PRIMARY KEY,
  title text NOT NULL,
  video_url text NOT NULL,
  channel text NOT NULL,
  stroke_type text NOT NULL DEFAULT 'multi',
  skill_level text NOT NULL DEFAULT 'intermediate',
  duration text,
  focus text,
  metric_tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tactic_library (
  id text PRIMARY KEY,
  title text NOT NULL,
  video_url text NOT NULL,
  channel text NOT NULL,
  situation text NOT NULL DEFAULT 'general',
  skill_level text NOT NULL DEFAULT 'intermediate',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drill_library_skill_stroke ON public.drill_library(skill_level, stroke_type);
CREATE INDEX IF NOT EXISTS idx_tactic_library_skill_situation ON public.tactic_library(skill_level, situation);

ALTER TABLE public.drill_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactic_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drill_library_read_all ON public.drill_library;
CREATE POLICY drill_library_read_all
  ON public.drill_library
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS tactic_library_read_all ON public.tactic_library;
CREATE POLICY tactic_library_read_all
  ON public.tactic_library
  FOR SELECT
  USING (true);

INSERT INTO public.drill_library (id, title, video_url, channel, stroke_type, skill_level, duration, focus, metric_tags) VALUES
('drill_01_complete_beginner', 'Complete Beginner Lesson: Forehand, Backhand & Serve', 'https://www.youtube.com/watch?v=YqgcykDGB2A', 'Intuitive Tennis', 'multi', 'beginner', '~20 min', 'Complete stroke foundations', ARRAY['shoulder','elbow','knee']),
('drill_02_beginner_rally', 'Beginner Rally Lesson: How to Keep the Ball in Play', 'https://www.youtube.com/watch?v=mdfFGXCsHYI', 'Intuitive Tennis', 'multi', 'beginner', '12:15', 'Rally consistency', ARRAY['shoulder','trunk','wrist']),
('drill_03_serve_masterclass', 'Simple Tennis Serve Technique Masterclass for Beginners', 'https://www.youtube.com/watch?v=IiRGdagtOKE', 'Top Tennis Training', 'serve', 'beginner', '~16 min', 'Serve mechanics from scratch', ARRAY['shoulder','knee','trunk','wrist']),
('drill_04_forehand_complete', 'Mastering the Tennis Forehand: A Complete Guide', 'https://www.youtube.com/watch?v=r9VroI2sNzI', 'Essential Tennis', 'forehand', 'beginner', '~15 min', 'Forehand fundamentals', ARRAY['shoulder','elbow','hip']),
('drill_05_basic_serve_venus', 'How To Hit A Basic Tennis Serve', 'https://www.youtube.com/watch?v=bRCQwLgEs9M', 'Venus Williams', 'serve', 'beginner', '~13 min', 'Simple reliable first serve', ARRAY['shoulder','knee','wrist']),
('drill_06_serve_drills_img', '3 Tennis Drills to Improve Your Serve', 'https://www.youtube.com/watch?v=4UKvZkFVmyA', 'IMG Academy', 'serve', 'beginner', '~8 min', 'Serve toss and stance consistency', ARRAY['shoulder','trunk','wrist']),
('drill_07_backhand_easy', '4 Easy Tennis Drills to Improve Your Backhand', 'https://www.youtube.com/watch?v=d_jfsCXePG8', 'Tennis Coaching', 'backhand', 'beginner', '~13 min', 'Backhand contact and footwork', ARRAY['shoulder','elbow','knee']),
('drill_08_forehand_img', '3 Tennis Drills to Hit a Better Forehand', 'https://www.youtube.com/watch?v=QZtxvwHvNe4', 'IMG Academy', 'forehand', 'intermediate', '~8 min', 'Forehand spacing and acceleration', ARRAY['hip','knee','trunk']),
('drill_09_volley_img', '3 Tennis Drills to Hit a Better Volley', 'https://www.youtube.com/watch?v=nQbI8gl6VGg', 'IMG Academy', 'volley', 'intermediate', '~8 min', 'Touch and net control', ARRAY['shoulder','wrist','trunk']),
('drill_10_modern_forehand', 'Modern Forehand Tennis Lesson', 'https://www.youtube.com/watch?v=W1Ef8HFZAuU', 'Intuitive Tennis', 'forehand', 'intermediate', '~15 min', 'Modern topspin forehand', ARRAY['shoulder','hip','wrist']),
('drill_11_slice_serve_feel', 'Slice Serve Drill and Technique', 'https://www.youtube.com/watch?v=l0dqozevSEk', 'Feel Tennis', 'serve', 'intermediate', '~10 min', 'Slice serve spin path', ARRAY['shoulder','wrist','trunk']),
('drill_12_kinetic_chain', 'Serve Kinetic Chain Drill', 'https://www.youtube.com/watch?v=xed3lmub3Fo', 'Rick Macci Tennis', 'serve', 'intermediate', '~1 min', 'Serve sequence power transfer', ARRAY['knee','hip','trunk']),
('drill_13_watch_ball', 'How To Watch The Ball in Tennis', 'https://www.youtube.com/watch?v=eW_iHszB1Ck', 'Essential Tennis', 'multi', 'intermediate', '~10 min', 'Ball tracking and cleaner contact', ARRAY['shoulder','trunk']),
('drill_14_mouratoglou_forehand', 'How Good Can Her Forehand Get in One Lesson?', 'https://www.youtube.com/watch?v=8XYxMn0sXsY', 'Patrick Mouratoglou', 'forehand', 'intermediate', '~15 min', 'Forehand rebuild progression', ARRAY['shoulder','hip','wrist']),
('drill_15_serve_plus_one', 'Serve Plus One Strategy Drill', 'https://www.youtube.com/watch?v=UguFrKS-NfA', 'Top Tennis Training', 'serve', 'intermediate', '~12 min', 'Serve + first ball planning', ARRAY['shoulder','trunk']),
('drill_16_return_reaction', 'Return of Serve Drills: Improve Your Reaction Time', 'https://www.youtube.com/watch?v=mY0j4CgxgIQ', 'Intuitive Tennis', 'return', 'intermediate', '~12 min', 'Return timing and split-step', ARRAY['knee','trunk','shoulder']),
('drill_17_volley_elite_set', 'Tennis Volley Drills: Power, Control, Placement & Footwork', 'https://www.youtube.com/watch?v=ebSB47mHNuQ', 'Intuitive Tennis', 'volley', 'advanced', '~25 min', 'Advanced net movement and finishing', ARRAY['knee','trunk','wrist']),
('drill_18_slice_serve_macci', 'Slice Serve Method: Slicing at 3 O''Clock', 'https://www.youtube.com/watch?v=axQQGnUdHwg', 'Rick Macci Tennis', 'serve', 'advanced', '~5 min', 'Penetrating slice serve', ARRAY['shoulder','wrist']),
('drill_19_forehand_masterclass_macci', 'Forehand Masterclass - 14-Minute Breakdown', 'https://www.youtube.com/watch?v=Gq0hPQoxG68', 'Rick Macci Tennis', 'forehand', 'advanced', '~14 min', 'Lag, drop, and acceleration', ARRAY['shoulder','elbow','wrist']),
('drill_20_return_advanced', 'Return of Serve: Advanced Technique and Positioning', 'https://www.youtube.com/watch?v=phKa3TEolPM', 'Rick Macci Tennis', 'return', 'advanced', '~8 min', 'Aggressive return positioning', ARRAY['knee','trunk','shoulder']),
('drill_21_split_step', 'Split Step Drill Demonstration', 'https://www.youtube.com/watch?v=dU6tm_gaqO4', 'Tennis Coaching', 'multi', 'all', '~5 min', 'Explosive first step', ARRAY['knee','hip']),
('drill_22_footwork_5_drills', 'Tennis Footwork - 5 Drills to Improve Your Movement', 'https://www.youtube.com/@TopTennisTraining/search?query=Tennis%20Footwork%205%20Drills%20to%20Improve%20Your%20Movement', 'Top Tennis Training', 'multi', 'all', '~10 min', 'On-court movement patterns', ARRAY['knee','hip','trunk']),
('drill_23_ball_machine_set', 'Ball Machine Drills - Forehand, Backhand & Volleys', 'https://www.youtube.com/@TopTennisTraining/search?query=Ball%20Machine%20Drills%20Forehand%20Backhand%20Volleys', 'Top Tennis Training', 'multi', 'advanced', '~15 min', 'Machine-feed decision and recovery', ARRAY['shoulder','knee','trunk']),
('drill_24_agility_no_equipment', '5 Agility & Footwork Drills - No Equipment Needed', 'https://www.functionaltennis.com/blogs/news/5-agility-footwork-drill-for-tennis-players', 'Functional Tennis / IMG Academy', 'multi', 'advanced', '~8 min', 'Off-court speed and agility', ARRAY['knee','hip','trunk']),
('drill_25_fix_forehand_mistakes', 'How to Fix the 5 Most Common Tennis Forehand Mistakes', 'https://www.youtube.com/@IntuitiveTennis/search?query=5%20most%20common%20tennis%20forehand%20mistakes', 'Intuitive Tennis', 'forehand', 'intermediate', '~12 min', 'Correct high-frequency forehand errors', ARRAY['shoulder','hip','wrist']),
('drill_26_windshield_wiper', 'How to Hit Topspin on Your Forehand - Windshield Wiper Technique', 'https://www.youtube.com/@TopTennisTraining/search?query=How%20to%20Hit%20Topspin%20on%20Your%20Forehand%20Windshield%20Wiper%20Technique', 'Top Tennis Training', 'forehand', 'intermediate', '~10 min', 'Forehand topspin mechanics', ARRAY['shoulder','wrist','trunk']),
('drill_27_wrist_lag', 'Tennis Forehand Wrist Lag in 3 Steps', 'https://www.youtube.com/@TopTennisTraining/search?query=Tennis%20Forehand%20Wrist%20Lag%20in%203%20Steps', 'Top Tennis Training', 'forehand', 'advanced', '~8 min', 'Racquet-head speed through lag', ARRAY['wrist','elbow','shoulder']),
('drill_28_topspin_5_steps', 'Topspin Secrets: How To Hit Perfect Topspin in 5 Steps', 'https://www.youtube.com/@TopTennisTraining/search?query=Topspin%20Secrets%20How%20To%20Hit%20Perfect%20Topspin%20in%205%20Steps', 'Top Tennis Training', 'multi', 'intermediate', '~12 min', 'Heavy topspin repeatability', ARRAY['shoulder','trunk','wrist']),
('drill_29_warmup_coordination', 'Tennis Warm-Up Coordination & Footwork Drills', 'https://www.feeltennis.net/warm-up-drills/', 'Feel Tennis', 'multi', 'all', '~15 min', 'Rhythm and stroke coordination', ARRAY['knee','hip','trunk']),
('drill_30_basics_footwork', 'Basics of Tennis Footwork: Less (Steps) is More (Time)', 'https://www.feeltennis.net/basics-of-tennis-footwork/', 'Feel Tennis', 'multi', 'all', '~10 min', 'Court positioning efficiency', ARRAY['knee','hip','trunk'])
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  video_url = EXCLUDED.video_url,
  channel = EXCLUDED.channel,
  stroke_type = EXCLUDED.stroke_type,
  skill_level = EXCLUDED.skill_level,
  duration = EXCLUDED.duration,
  focus = EXCLUDED.focus,
  metric_tags = EXCLUDED.metric_tags;

INSERT INTO public.tactic_library (id, title, video_url, channel, situation, skill_level, summary) VALUES
('tactic_01_crosscourt_geometry', 'Tennis Tactics: Where to Aim in Singles (Crosscourt vs Down the Line)', 'https://youtu.be/ESYuG4qObNc', 'Love Tennis', 'baseline', 'beginner', 'Crosscourt gives more margin, lower net clearance risk, and better recovery geometry.'),
('tactic_02_watch_ball', 'How To Watch The Ball in Tennis', 'https://www.youtube.com/watch?v=eW_iHszB1Ck', 'Essential Tennis', 'general', 'beginner', 'Improves tactical decision quality by improving visual tracking and reducing rushed errors.'),
('tactic_03_beginner_consistency', 'Beginner Rally Lesson: Keeping the Ball in Play', 'https://www.youtube.com/watch?v=mdfFGXCsHYI', 'Intuitive Tennis', 'defense', 'beginner', 'Build the highest-impact beginner tactic: win by reducing unforced errors first.'),
('tactic_04_four_zones', 'Tennis Singles Strategy: Control The Four Zones', 'https://www.youtube.com/@TopTennisTraining/search?query=Control%20The%20Four%20Zones', 'Top Tennis Training', 'point-construction', 'intermediate', 'Choose shots based on defensive, neutral, attack, and finish court positions.'),
('tactic_05_where_to_aim', 'Tennis Tactics: Where To Aim In Singles', 'https://www.youtube.com/@TopTennisTraining/search?query=Where%20To%20Aim%20In%20Singles', 'Top Tennis Training', 'baseline', 'intermediate', 'Apply an 80/20 direction model: mostly crosscourt, selective down-the-line changes.'),
('tactic_06_serve_reliability', '3 Tennis Drills to Improve Serve Reliability', 'https://www.youtube.com/watch?v=4UKvZkFVmyA', 'IMG Academy', 'serve', 'beginner', 'Start points with reliable serve patterns before chasing power.'),
('tactic_07_serve_plus_one', 'Serve Plus One Strategy', 'https://www.youtube.com/watch?v=UguFrKS-NfA', 'Top Tennis Training', 'serve', 'intermediate', 'Plan serve direction and first ball location together to control the rally early.'),
('tactic_08_serve_plus_one_essential', 'Serve Plus ONE: Tennis Singles Strategy Lesson', 'https://www.essentialtennis.com/serve-plus-one-tennis-singles-strategy-lesson/', 'Essential Tennis', 'serve', 'intermediate', 'Four practical serve+1 scenarios for proactive singles construction.'),
('tactic_09_dominate_net', 'Tennis Tactics: How to Dominate the Net in Singles', 'https://www.youtube.com/@TopTennisTraining/search?query=How%20to%20Dominate%20the%20Net%20in%20Singles', 'Top Tennis Training', 'net', 'intermediate', 'Approach direction, split-step timing, and first-volley positioning for net control.'),
('tactic_10_return_positioning', 'Return of Serve: Technique and Positioning', 'https://www.youtube.com/watch?v=phKa3TEolPM', 'Rick Macci Tennis', 'serve', 'intermediate', 'Adjust return stance and swing length by server pace and spin profile.'),
('tactic_11_approach_mastery', 'Tennis Approach Shot Mastery: When and How to Attack the Net', 'https://www.feeltennis.net/approach-shot/', 'Feel Tennis', 'net', 'intermediate', 'Use a repeatable decision tree for when to approach, where to aim, and how to close.'),
('tactic_12_beat_pusher', 'Singles Strategy: 5 Tactics to Beat the Tennis Pusher', 'https://tennisevolution.com/singles-strategy-5-ways-to-beat-the-tennis-pusher/', 'Tennis Evolution', 'defense', 'intermediate', 'Break passive defenders with angle, depth, and selective net pressure.'),
('tactic_13_slice_vs_kick', 'Slice Serve vs Kick Serve: How and When to Use Each', 'https://www.youtube.com/@TopTennisTraining/search?query=Slice%20Serve%20vs%20Kick%20Serve', 'Top Tennis Training', 'serve', 'intermediate', 'Choose serve type by score context, returner position, and side of court.'),
('tactic_14_dominate_singles', 'Tennis Tactics: 5 Ways to Dominate in Singles', 'https://www.youtube.com/@TopTennisTraining/search?query=5%20Ways%20to%20Dominate%20in%20Singles', 'Top Tennis Training', 'general', 'intermediate', 'Structure points with clear intent instead of reactive shot selection.'),
('tactic_15_crosscourt_habit', 'Smart Players Hit Cross Court', 'https://www.essentialtennis.com/smart-players-hit-cross-court/', 'Essential Tennis', 'baseline', 'intermediate', 'Use percentages and geometry to build a safer baseline default pattern.'),
('tactic_16_first_four_shots', 'AO Analyst Strategic Breakdown (Craig O''Shannessy)', 'https://www.youtube.com/watch?v=8NrA-BanUfM', 'Australian Open / Brain Game Tennis', 'point-construction', 'advanced', 'First 4 shots framework for elite serve+1 and return+1 execution.'),
('tactic_17_one_two_pattern', 'Singles Strategy: Play Winning Tennis - The 1-2 Tactic', 'https://www.youtube.com/@TennisEvolution/search?query=Play%20Winning%20Tennis%20The%201-2%20Tactic', 'Tennis Evolution', 'point-construction', 'advanced', 'Sequence setup and finish balls instead of isolated shot attempts.'),
('tactic_18_serve_plus_one_advanced', 'Singles Tactics: Smart SERVE +1 Strategy', 'https://www.youtube.com/@TennisEvolution/search?query=Smart%20Serve%20%2B1%20Strategy', 'Tennis Evolution', 'serve', 'advanced', 'Advanced serve+1 combinations under pressure and return variation.'),
('tactic_19_down_line_margin', 'Tennis Strategy: How To Play Down the Line (Smart Targets)', 'https://www.youtube.com/@TennisEvolution/search?query=How%20To%20Play%20Down%20the%20Line%20Smart%20Targets', 'Tennis Evolution', 'baseline', 'advanced', 'Use high-margin direction changes instead of flat low-percentage line drives.'),
('tactic_20_smart_defense', 'Singles Strategy: Play Smart Defense and Hit Passing Shots', 'https://www.youtube.com/@TennisEvolution/search?query=Play%20Smart%20Defense%20Passing%20Shots', 'Tennis Evolution', 'defense', 'advanced', 'Convert defensive positions into neutral or offensive outcomes with intent.'),
('tactic_21_return_case_study', 'Case Study: Forehand Return Shot Selection Strategy', 'https://www.youtube.com/@TennisEvolution/search?query=Forehand%20Return%20Shot%20Selection%20Strategy', 'Tennis Evolution', 'serve', 'advanced', 'Return decision templates for pace, spin, and court positioning.'),
('tactic_22_inside_out_fix', 'Inside-Out Forehand: The Weak Backhand Fix', 'https://www.essentialtennis.com/inside-out-forehand-the-weak-backhand-fix/', 'Essential Tennis', 'point-construction', 'advanced', 'Run-around patterns to protect backhand liabilities and dictate forehand exchanges.'),
('tactic_23_inside_out_perfect', 'How to Hit the Perfect Inside-Out Forehand in Tennis', 'https://www.youtube.com/@TopTennisTraining/search?query=How%20to%20Hit%20the%20Perfect%20Inside-Out%20Forehand%20in%20Tennis', 'Top Tennis Training', 'point-construction', 'advanced', 'Combine footwork and direction control to create forehand advantage patterns.'),
('tactic_24_backhand_defense', 'Tennis Backhand: How To Play Smarter Defense', 'https://www.youtube.com/@TennisEvolution/search?query=Backhand%20How%20To%20Play%20Smarter%20Defense', 'Tennis Evolution', 'defense', 'advanced', 'Use backhand neutralizers and recovery positioning to extend points intelligently.'),
('tactic_25_outsmart_opponent', 'Singles Strategy: Outsmart Your Opponent', 'https://www.youtube.com/@TennisEvolution/search?query=Outsmart%20Your%20Opponent', 'Tennis Evolution', 'general', 'advanced', 'Read tendencies early and adapt patterns during the match.'),
('tactic_26_golden_rules', 'Craig O''Shannessy: 25 Golden Rules of Singles Strategy', 'https://braingametennis.com/25-golden-rules-of-singles-strategy/', 'Brain Game Tennis', 'point-construction', 'all', 'Data-driven strategic rules for high-percentage singles decision making.'),
('tactic_27_baseline_patterns', 'Tennis Baseline Strategy Patterns, Percentages & Drills', 'https://braingametennis.com/webinar-7-baseline-strategy-patterns-and-percentages/', 'Brain Game Tennis', 'baseline', 'advanced', 'Baseline targeting model and percentage choices for competitive rallies.'),
('tactic_28_attack_net', 'How to Attack the Net: Tennis Approach Strategy', 'https://www.youtube.com/@TennisEvolution/search?query=How%20to%20Attack%20the%20Net%20Tennis%20Approach%20Strategy', 'Tennis Evolution', 'net', 'advanced', 'Approach selection and transition-to-net execution under match pressure.'),
('tactic_29_footwork_positioning', 'Tennis Strategy: Footwork Tactic & Positioning', 'https://www.youtube.com/@TennisEvolution/search?query=Footwork%20Tactic%20and%20Positioning', 'Tennis Evolution', 'general', 'advanced', 'Court position determines tactical options and shot-quality outcomes.'),
('tactic_30_one_way_beat_pusher', 'The 1 Strategy to Beat the Pusher', 'https://www.youtube.com/@TennisEvolution/search?query=The%201%20Strategy%20to%20Beat%20the%20Pusher', 'Tennis Evolution', 'defense', 'intermediate', 'One repeatable pattern to stop losing control against moonball and pusher styles.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  video_url = EXCLUDED.video_url,
  channel = EXCLUDED.channel,
  situation = EXCLUDED.situation,
  skill_level = EXCLUDED.skill_level,
  summary = EXCLUDED.summary;
