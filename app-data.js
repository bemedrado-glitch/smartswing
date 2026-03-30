(function () {
  const KEYS = {
    users: 'smartswing_users',
    session: 'smartswing_session',
    checkoutIntent: 'smartswing_checkout_intent',
    assessments: 'smartswing_assessments',
    coachSessions: 'smartswing_coach_sessions',
    messages: 'smartswing_messages',
    goals: 'smartswing_goals',
    drillAssignments: 'smartswing_drill_assignments',
    progressEvents: 'smartswing_progress_events',
    reportUsage: 'smartswing_report_usage',
    lastSession: 'smartswing_last_session',
    supabaseConfig: 'smartswing_supabase_config',
    autoSessionOptOut: 'smartswing_auto_session_opt_out',
    paymentCheckoutState: 'smartswing_payment_checkout_state'
  };

  const DEFAULT_COACHES = [
    { id: 'coach-1', name: 'Coach Serena Blake', specialty: 'Serve + first-strike patterns' },
    { id: 'coach-2', name: 'Coach Rafael Mendes', specialty: 'Forehand mechanics + footwork' },
    { id: 'coach-3', name: 'Coach Naomi Carter', specialty: 'Backhand timing + recovery' }
  ];

  const YEARLY_DISCOUNT_PERCENT = 15;

  const PLAN_DEFINITIONS = {
    free: {
      id: 'free',
      name: 'Free',
      monthlyPrice: 0,
      yearlyPrice: 0,
      monthlyReviews: 2,
      canSaveReport: false,
      canPrintReport: false,
      hasDrillLibrary: false,
      hasTacticLibrary: false,
      canConnectCoaches: false,
      canConnectPlayers: false,
      perks: ['1 analysis report per month', 'No report save/export']
    },
    starter: {
      id: 'starter',
      name: 'Player',
      monthlyPrice: 9.99,
      yearlyPrice: 101.90,
      monthlyReviews: 10,
      canSaveReport: true,
      canPrintReport: true,
      hasDrillLibrary: false,
      hasTacticLibrary: false,
      canConnectCoaches: false,
      canConnectPlayers: false,
      perks: ['10 reports per month', 'Report save + print', 'Yearly plan saves 15%']
    },
    pro: {
      id: 'pro',
      name: 'Performance',
      monthlyPrice: 19.99,
      yearlyPrice: 203.90,
      monthlyReviews: Infinity,
      canSaveReport: true,
      canPrintReport: true,
      hasDrillLibrary: true,
      hasTacticLibrary: true,
      canConnectCoaches: true,
      canConnectPlayers: true,
      perks: [
        'Unlimited reports',
        'Full drill and tactics video library',
        'Connect with coaches and players',
        'Priority progress insights',
        'Yearly plan saves 15%'
      ]
    },
    elite: {
      id: 'elite',
      name: 'Tournament Pro',
      monthlyPrice: 49.99,
      yearlyPrice: 509.90,
      monthlyReviews: Infinity,
      canSaveReport: true,
      canPrintReport: true,
      hasDrillLibrary: true,
      hasTacticLibrary: true,
      canConnectCoaches: true,
      canConnectPlayers: true,
      perks: [
        'Unlimited reports',
        'Certified coach feedback workflow',
        'Tournament prep and match-plan reviews',
        'Priority scheduling and accountability queue',
        'Yearly plan saves 15%'
      ]
    }
  };

  const PAYMENT_PROVIDER_SETTINGS = {
    activeProvider: 'stripe',
    publicOrigin: 'https://www.smartswingai.com',
    stripe: {
      providerLabel: 'Stripe Checkout',
      apiBasePath: '/api',
      setupStatus: 'server_env_required',
      notes: 'Paid subscriptions run through Stripe-hosted checkout with server-side verification and webhook sync.',
      plans: {
        free: {
          mode: 'internal-free',
          label: 'Free internal activation'
        },
        starter: {
          mode: 'stripe-subscription',
          planName: 'SmartSwing Player',
          recurring: true,
          buyable: true,
          intervals: {
            monthly: {
              envPriceKey: 'STRIPE_PRICE_STARTER_MONTHLY',
              planName: 'SmartSwing Player Monthly',
              amount: 9.99
            },
            yearly: {
              envPriceKey: 'STRIPE_PRICE_STARTER_YEARLY',
              planName: 'SmartSwing Player Yearly',
              amount: 101.90
            }
          }
        },
        pro: {
          mode: 'stripe-subscription',
          planName: 'SmartSwing Performance',
          recurring: true,
          buyable: true,
          intervals: {
            monthly: {
              envPriceKey: 'STRIPE_PRICE_PRO_MONTHLY',
              planName: 'SmartSwing Performance Monthly',
              amount: 19.99
            },
            yearly: {
              envPriceKey: 'STRIPE_PRICE_PRO_YEARLY',
              planName: 'SmartSwing Performance Yearly',
              amount: 203.90
            }
          }
        },
        elite: {
          mode: 'stripe-subscription',
          planName: 'SmartSwing Tournament Pro',
          recurring: true,
          buyable: true,
          intervals: {
            monthly: {
              envPriceKey: 'STRIPE_PRICE_ELITE_MONTHLY',
              planName: 'SmartSwing Tournament Pro Monthly',
              amount: 49.99
            },
            yearly: {
              envPriceKey: 'STRIPE_PRICE_ELITE_YEARLY',
              planName: 'SmartSwing Tournament Pro Yearly',
              amount: 509.90
            }
          }
        }
      }
    }
  };

  const DRILL_LIBRARY = [
    { id: 'drill_01_complete_beginner', title: 'Complete Beginner Lesson: Forehand, Backhand & Serve', videoUrl: 'https://www.youtube.com/watch?v=YqgcykDGB2A', channel: 'Intuitive Tennis', strokeType: 'multi', skillLevel: 'beginner', duration: '~20 min', focus: 'Complete stroke foundations', metricTags: ['shoulder', 'elbow', 'knee'] },
    { id: 'drill_02_beginner_rally', title: 'Beginner Rally Lesson: How to Keep the Ball in Play', videoUrl: 'https://www.youtube.com/watch?v=mdfFGXCsHYI', channel: 'Intuitive Tennis', strokeType: 'multi', skillLevel: 'beginner', duration: '12:15', focus: 'Rally consistency', metricTags: ['shoulder', 'trunk', 'wrist'] },
    { id: 'drill_03_serve_masterclass', title: 'Simple Tennis Serve Technique Masterclass for Beginners', videoUrl: 'https://www.youtube.com/watch?v=IiRGdagtOKE', channel: 'Top Tennis Training', strokeType: 'serve', skillLevel: 'beginner', duration: '~16 min', focus: 'Serve mechanics from scratch', metricTags: ['shoulder', 'knee', 'trunk', 'wrist'] },
    { id: 'drill_04_forehand_complete', title: 'Mastering the Tennis Forehand: A Complete Guide', videoUrl: 'https://www.youtube.com/watch?v=r9VroI2sNzI', channel: 'Essential Tennis', strokeType: 'forehand', skillLevel: 'beginner', duration: '~15 min', focus: 'Forehand fundamentals', metricTags: ['shoulder', 'elbow', 'hip'] },
    { id: 'drill_05_basic_serve_venus', title: 'How To Hit A Basic Tennis Serve', videoUrl: 'https://www.youtube.com/watch?v=bRCQwLgEs9M', channel: 'Venus Williams', strokeType: 'serve', skillLevel: 'beginner', duration: '~13 min', focus: 'Simple reliable first serve', metricTags: ['shoulder', 'knee', 'wrist'] },
    { id: 'drill_06_serve_drills_img', title: '3 Tennis Drills to Improve Your Serve', videoUrl: 'https://www.youtube.com/watch?v=4UKvZkFVmyA', channel: 'IMG Academy', strokeType: 'serve', skillLevel: 'beginner', duration: '~8 min', focus: 'Serve toss and stance consistency', metricTags: ['shoulder', 'trunk', 'wrist'] },
    { id: 'drill_07_backhand_easy', title: '4 Easy Tennis Drills to Improve Your Backhand', videoUrl: 'https://www.youtube.com/watch?v=d_jfsCXePG8', channel: 'Tennis Coaching', strokeType: 'backhand', skillLevel: 'beginner', duration: '~13 min', focus: 'Backhand contact and footwork', metricTags: ['shoulder', 'elbow', 'knee'] },
    { id: 'drill_08_forehand_img', title: '3 Tennis Drills to Hit a Better Forehand', videoUrl: 'https://www.youtube.com/watch?v=QZtxvwHvNe4', channel: 'IMG Academy', strokeType: 'forehand', skillLevel: 'intermediate', duration: '~8 min', focus: 'Forehand spacing and acceleration', metricTags: ['hip', 'knee', 'trunk'] },
    { id: 'drill_09_volley_img', title: '3 Tennis Drills to Hit a Better Volley', videoUrl: 'https://www.youtube.com/watch?v=nQbI8gl6VGg', channel: 'IMG Academy', strokeType: 'volley', skillLevel: 'intermediate', duration: '~8 min', focus: 'Touch and net control', metricTags: ['shoulder', 'wrist', 'trunk'] },
    { id: 'drill_10_modern_forehand', title: 'Modern Forehand Tennis Lesson', videoUrl: 'https://www.youtube.com/watch?v=W1Ef8HFZAuU', channel: 'Intuitive Tennis', strokeType: 'forehand', skillLevel: 'intermediate', duration: '~15 min', focus: 'Modern topspin forehand', metricTags: ['shoulder', 'hip', 'wrist'] },
    { id: 'drill_11_slice_serve_feel', title: 'Slice Serve Drill and Technique', videoUrl: 'https://www.youtube.com/watch?v=l0dqozevSEk', channel: 'Feel Tennis', strokeType: 'serve', skillLevel: 'intermediate', duration: '~10 min', focus: 'Slice serve spin path', metricTags: ['shoulder', 'wrist', 'trunk'] },
    { id: 'drill_12_kinetic_chain', title: 'Serve Kinetic Chain Drill', videoUrl: 'https://www.youtube.com/watch?v=xed3lmub3Fo', channel: 'Rick Macci Tennis', strokeType: 'serve', skillLevel: 'intermediate', duration: '~1 min', focus: 'Serve sequence power transfer', metricTags: ['knee', 'hip', 'trunk'] },
    { id: 'drill_13_watch_ball', title: 'How To Watch The Ball in Tennis', videoUrl: 'https://www.youtube.com/watch?v=eW_iHszB1Ck', channel: 'Essential Tennis', strokeType: 'multi', skillLevel: 'intermediate', duration: '~10 min', focus: 'Ball tracking and cleaner contact', metricTags: ['shoulder', 'trunk'] },
    { id: 'drill_14_mouratoglou_forehand', title: 'How Good Can Her Forehand Get in One Lesson?', videoUrl: 'https://www.youtube.com/watch?v=8XYxMn0sXsY', channel: 'Patrick Mouratoglou', strokeType: 'forehand', skillLevel: 'intermediate', duration: '~15 min', focus: 'Forehand rebuild progression', metricTags: ['shoulder', 'hip', 'wrist'] },
    { id: 'drill_15_serve_plus_one', title: 'Serve Plus One Strategy Drill', videoUrl: 'https://www.youtube.com/watch?v=UguFrKS-NfA', channel: 'Top Tennis Training', strokeType: 'serve', skillLevel: 'intermediate', duration: '~12 min', focus: 'Serve + first ball planning', metricTags: ['shoulder', 'trunk'] },
    { id: 'drill_16_return_reaction', title: 'Return of Serve Drills: Improve Your Reaction Time', videoUrl: 'https://www.youtube.com/watch?v=mY0j4CgxgIQ', channel: 'Intuitive Tennis', strokeType: 'return', skillLevel: 'intermediate', duration: '~12 min', focus: 'Return timing and split-step', metricTags: ['knee', 'trunk', 'shoulder'] },
    { id: 'drill_17_volley_elite_set', title: 'Tennis Volley Drills: Power, Control, Placement & Footwork', videoUrl: 'https://www.youtube.com/watch?v=ebSB47mHNuQ', channel: 'Intuitive Tennis', strokeType: 'volley', skillLevel: 'advanced', duration: '~25 min', focus: 'Advanced net movement and finishing', metricTags: ['knee', 'trunk', 'wrist'] },
    { id: 'drill_18_slice_serve_macci', title: 'Slice Serve Method: Slicing at 3 O\'Clock', videoUrl: 'https://www.youtube.com/watch?v=axQQGnUdHwg', channel: 'Rick Macci Tennis', strokeType: 'serve', skillLevel: 'advanced', duration: '~5 min', focus: 'Penetrating slice serve', metricTags: ['shoulder', 'wrist'] },
    { id: 'drill_19_forehand_masterclass_macci', title: 'Forehand Masterclass - 14-Minute Breakdown', videoUrl: 'https://www.youtube.com/watch?v=Gq0hPQoxG68', channel: 'Rick Macci Tennis', strokeType: 'forehand', skillLevel: 'advanced', duration: '~14 min', focus: 'Lag, drop, and acceleration', metricTags: ['shoulder', 'elbow', 'wrist'] },
    { id: 'drill_20_return_advanced', title: 'Return of Serve: Advanced Technique and Positioning', videoUrl: 'https://www.youtube.com/watch?v=phKa3TEolPM', channel: 'Rick Macci Tennis', strokeType: 'return', skillLevel: 'advanced', duration: '~8 min', focus: 'Aggressive return positioning', metricTags: ['knee', 'trunk', 'shoulder'] },
    { id: 'drill_21_split_step', title: 'Split Step Drill Demonstration', videoUrl: 'https://www.youtube.com/watch?v=dU6tm_gaqO4', channel: 'Tennis Coaching', strokeType: 'multi', skillLevel: 'all', duration: '~5 min', focus: 'Explosive first step', metricTags: ['knee', 'hip'] },
    { id: 'drill_22_footwork_5_drills', title: 'Tennis Footwork - 5 Drills to Improve Your Movement', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Tennis%20Footwork%205%20Drills%20to%20Improve%20Your%20Movement', channel: 'Top Tennis Training', strokeType: 'multi', skillLevel: 'all', duration: '~10 min', focus: 'On-court movement patterns', metricTags: ['knee', 'hip', 'trunk'] },
    { id: 'drill_23_ball_machine_set', title: 'Ball Machine Drills - Forehand, Backhand & Volleys', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Ball%20Machine%20Drills%20Forehand%20Backhand%20Volleys', channel: 'Top Tennis Training', strokeType: 'multi', skillLevel: 'advanced', duration: '~15 min', focus: 'Machine-feed decision and recovery', metricTags: ['shoulder', 'knee', 'trunk'] },
    { id: 'drill_24_agility_no_equipment', title: '5 Agility & Footwork Drills - No Equipment Needed', videoUrl: 'https://www.functionaltennis.com/blogs/news/5-agility-footwork-drill-for-tennis-players', channel: 'Functional Tennis / IMG Academy', strokeType: 'multi', skillLevel: 'advanced', duration: '~8 min', focus: 'Off-court speed and agility', metricTags: ['knee', 'hip', 'trunk'] },
    { id: 'drill_25_fix_forehand_mistakes', title: 'How to Fix the 5 Most Common Tennis Forehand Mistakes', videoUrl: 'https://www.youtube.com/@IntuitiveTennis/search?query=5%20most%20common%20tennis%20forehand%20mistakes', channel: 'Intuitive Tennis', strokeType: 'forehand', skillLevel: 'intermediate', duration: '~12 min', focus: 'Correct high-frequency forehand errors', metricTags: ['shoulder', 'hip', 'wrist'] },
    { id: 'drill_26_windshield_wiper', title: 'How to Hit Topspin on Your Forehand - Windshield Wiper Technique', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=How%20to%20Hit%20Topspin%20on%20Your%20Forehand%20Windshield%20Wiper%20Technique', channel: 'Top Tennis Training', strokeType: 'forehand', skillLevel: 'intermediate', duration: '~10 min', focus: 'Forehand topspin mechanics', metricTags: ['shoulder', 'wrist', 'trunk'] },
    { id: 'drill_27_wrist_lag', title: 'Tennis Forehand Wrist Lag in 3 Steps', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Tennis%20Forehand%20Wrist%20Lag%20in%203%20Steps', channel: 'Top Tennis Training', strokeType: 'forehand', skillLevel: 'advanced', duration: '~8 min', focus: 'Racquet-head speed through lag', metricTags: ['wrist', 'elbow', 'shoulder'] },
    { id: 'drill_28_topspin_5_steps', title: 'Topspin Secrets: How To Hit Perfect Topspin in 5 Steps', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Topspin%20Secrets%20How%20To%20Hit%20Perfect%20Topspin%20in%205%20Steps', channel: 'Top Tennis Training', strokeType: 'multi', skillLevel: 'intermediate', duration: '~12 min', focus: 'Heavy topspin repeatability', metricTags: ['shoulder', 'trunk', 'wrist'] },
    { id: 'drill_29_warmup_coordination', title: 'Tennis Warm-Up Coordination & Footwork Drills', videoUrl: 'https://www.feeltennis.net/warm-up-drills/', channel: 'Feel Tennis', strokeType: 'multi', skillLevel: 'all', duration: '~15 min', focus: 'Rhythm and stroke coordination', metricTags: ['knee', 'hip', 'trunk'] },
    { id: 'drill_30_basics_footwork', title: 'Basics of Tennis Footwork: Less (Steps) is More (Time)', videoUrl: 'https://www.feeltennis.net/basics-of-tennis-footwork/', channel: 'Feel Tennis', strokeType: 'multi', skillLevel: 'all', duration: '~10 min', focus: 'Court positioning efficiency', metricTags: ['knee', 'hip', 'trunk'] }
  ];

  const TACTIC_LIBRARY = [
    { id: 'tactic_01_crosscourt_geometry', title: 'Tennis Tactics: Where to Aim in Singles (Crosscourt vs Down the Line)', videoUrl: 'https://youtu.be/ESYuG4qObNc', channel: 'Love Tennis', situation: 'baseline', skillLevel: 'beginner', summary: 'Crosscourt gives more margin, lower net clearance risk, and better recovery geometry.' },
    { id: 'tactic_02_watch_ball', title: 'How To Watch The Ball in Tennis', videoUrl: 'https://www.youtube.com/watch?v=eW_iHszB1Ck', channel: 'Essential Tennis', situation: 'general', skillLevel: 'beginner', summary: 'Improves tactical decision quality by improving visual tracking and reducing rushed errors.' },
    { id: 'tactic_03_beginner_consistency', title: 'Beginner Rally Lesson: Keeping the Ball in Play', videoUrl: 'https://www.youtube.com/watch?v=mdfFGXCsHYI', channel: 'Intuitive Tennis', situation: 'defense', skillLevel: 'beginner', summary: 'Build the highest-impact beginner tactic: win by reducing unforced errors first.' },
    { id: 'tactic_04_four_zones', title: 'Tennis Singles Strategy: Control The Four Zones', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Control%20The%20Four%20Zones', channel: 'Top Tennis Training', situation: 'point-construction', skillLevel: 'intermediate', summary: 'Choose shots based on defensive, neutral, attack, and finish court positions.' },
    { id: 'tactic_05_where_to_aim', title: 'Tennis Tactics: Where To Aim In Singles', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Where%20To%20Aim%20In%20Singles', channel: 'Top Tennis Training', situation: 'baseline', skillLevel: 'intermediate', summary: 'Apply an 80/20 direction model: mostly crosscourt, selective down-the-line changes.' },
    { id: 'tactic_06_serve_reliability', title: '3 Tennis Drills to Improve Serve Reliability', videoUrl: 'https://www.youtube.com/watch?v=4UKvZkFVmyA', channel: 'IMG Academy', situation: 'serve', skillLevel: 'beginner', summary: 'Start points with reliable serve patterns before chasing power.' },
    { id: 'tactic_07_serve_plus_one', title: 'Serve Plus One Strategy', videoUrl: 'https://www.youtube.com/watch?v=UguFrKS-NfA', channel: 'Top Tennis Training', situation: 'serve', skillLevel: 'intermediate', summary: 'Plan serve direction and first ball location together to control the rally early.' },
    { id: 'tactic_08_serve_plus_one_essential', title: 'Serve Plus ONE: Tennis Singles Strategy Lesson', videoUrl: 'https://www.essentialtennis.com/serve-plus-one-tennis-singles-strategy-lesson/', channel: 'Essential Tennis', situation: 'serve', skillLevel: 'intermediate', summary: 'Four practical serve+1 scenarios for proactive singles construction.' },
    { id: 'tactic_09_dominate_net', title: 'Tennis Tactics: How to Dominate the Net in Singles', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=How%20to%20Dominate%20the%20Net%20in%20Singles', channel: 'Top Tennis Training', situation: 'net', skillLevel: 'intermediate', summary: 'Approach direction, split-step timing, and first-volley positioning for net control.' },
    { id: 'tactic_10_return_positioning', title: 'Return of Serve: Technique and Positioning', videoUrl: 'https://www.youtube.com/watch?v=phKa3TEolPM', channel: 'Rick Macci Tennis', situation: 'serve', skillLevel: 'intermediate', summary: 'Adjust return stance and swing length by server pace and spin profile.' },
    { id: 'tactic_11_approach_mastery', title: 'Tennis Approach Shot Mastery: When and How to Attack the Net', videoUrl: 'https://www.feeltennis.net/approach-shot/', channel: 'Feel Tennis', situation: 'net', skillLevel: 'intermediate', summary: 'Use a repeatable decision tree for when to approach, where to aim, and how to close.' },
    { id: 'tactic_12_beat_pusher', title: 'Singles Strategy: 5 Tactics to Beat the Tennis Pusher', videoUrl: 'https://tennisevolution.com/singles-strategy-5-ways-to-beat-the-tennis-pusher/', channel: 'Tennis Evolution', situation: 'defense', skillLevel: 'intermediate', summary: 'Break passive defenders with angle, depth, and selective net pressure.' },
    { id: 'tactic_13_slice_vs_kick', title: 'Slice Serve vs Kick Serve: How and When to Use Each', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=Slice%20Serve%20vs%20Kick%20Serve', channel: 'Top Tennis Training', situation: 'serve', skillLevel: 'intermediate', summary: 'Choose serve type by score context, returner position, and side of court.' },
    { id: 'tactic_14_dominate_singles', title: 'Tennis Tactics: 5 Ways to Dominate in Singles', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=5%20Ways%20to%20Dominate%20in%20Singles', channel: 'Top Tennis Training', situation: 'general', skillLevel: 'intermediate', summary: 'Structure points with clear intent instead of reactive shot selection.' },
    { id: 'tactic_15_crosscourt_habit', title: 'Smart Players Hit Cross Court', videoUrl: 'https://www.essentialtennis.com/smart-players-hit-cross-court/', channel: 'Essential Tennis', situation: 'baseline', skillLevel: 'intermediate', summary: 'Use percentages and geometry to build a safer baseline default pattern.' },
    { id: 'tactic_16_first_four_shots', title: 'AO Analyst Strategic Breakdown (Craig O\'Shannessy)', videoUrl: 'https://www.youtube.com/watch?v=8NrA-BanUfM', channel: 'Australian Open / Brain Game Tennis', situation: 'point-construction', skillLevel: 'advanced', summary: 'First 4 shots framework for elite serve+1 and return+1 execution.' },
    { id: 'tactic_17_one_two_pattern', title: 'Singles Strategy: Play Winning Tennis - The 1-2 Tactic', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Play%20Winning%20Tennis%20The%201-2%20Tactic', channel: 'Tennis Evolution', situation: 'point-construction', skillLevel: 'advanced', summary: 'Sequence setup and finish balls instead of isolated shot attempts.' },
    { id: 'tactic_18_serve_plus_one_advanced', title: 'Singles Tactics: Smart SERVE +1 Strategy', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Smart%20Serve%20%2B1%20Strategy', channel: 'Tennis Evolution', situation: 'serve', skillLevel: 'advanced', summary: 'Advanced serve+1 combinations under pressure and return variation.' },
    { id: 'tactic_19_down_line_margin', title: 'Tennis Strategy: How To Play Down the Line (Smart Targets)', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=How%20To%20Play%20Down%20the%20Line%20Smart%20Targets', channel: 'Tennis Evolution', situation: 'baseline', skillLevel: 'advanced', summary: 'Use high-margin direction changes instead of flat low-percentage line drives.' },
    { id: 'tactic_20_smart_defense', title: 'Singles Strategy: Play Smart Defense and Hit Passing Shots', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Play%20Smart%20Defense%20Passing%20Shots', channel: 'Tennis Evolution', situation: 'defense', skillLevel: 'advanced', summary: 'Convert defensive positions into neutral or offensive outcomes with intent.' },
    { id: 'tactic_21_return_case_study', title: 'Case Study: Forehand Return Shot Selection Strategy', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Forehand%20Return%20Shot%20Selection%20Strategy', channel: 'Tennis Evolution', situation: 'serve', skillLevel: 'advanced', summary: 'Return decision templates for pace, spin, and court positioning.' },
    { id: 'tactic_22_inside_out_fix', title: 'Inside-Out Forehand: The Weak Backhand Fix', videoUrl: 'https://www.essentialtennis.com/inside-out-forehand-the-weak-backhand-fix/', channel: 'Essential Tennis', situation: 'point-construction', skillLevel: 'advanced', summary: 'Run-around patterns to protect backhand liabilities and dictate forehand exchanges.' },
    { id: 'tactic_23_inside_out_perfect', title: 'How to Hit the Perfect Inside-Out Forehand in Tennis', videoUrl: 'https://www.youtube.com/@TopTennisTraining/search?query=How%20to%20Hit%20the%20Perfect%20Inside-Out%20Forehand%20in%20Tennis', channel: 'Top Tennis Training', situation: 'point-construction', skillLevel: 'advanced', summary: 'Combine footwork and direction control to create forehand advantage patterns.' },
    { id: 'tactic_24_backhand_defense', title: 'Tennis Backhand: How To Play Smarter Defense', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Backhand%20How%20To%20Play%20Smarter%20Defense', channel: 'Tennis Evolution', situation: 'defense', skillLevel: 'advanced', summary: 'Use backhand neutralizers and recovery positioning to extend points intelligently.' },
    { id: 'tactic_25_outsmart_opponent', title: 'Singles Strategy: Outsmart Your Opponent', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Outsmart%20Your%20Opponent', channel: 'Tennis Evolution', situation: 'general', skillLevel: 'advanced', summary: 'Read tendencies early and adapt patterns during the match.' },
    { id: 'tactic_26_golden_rules', title: 'Craig O\'Shannessy: 25 Golden Rules of Singles Strategy', videoUrl: 'https://braingametennis.com/25-golden-rules-of-singles-strategy/', channel: 'Brain Game Tennis', situation: 'point-construction', skillLevel: 'all', summary: 'Data-driven strategic rules for high-percentage singles decision making.' },
    { id: 'tactic_27_baseline_patterns', title: 'Tennis Baseline Strategy Patterns, Percentages & Drills', videoUrl: 'https://braingametennis.com/webinar-7-baseline-strategy-patterns-and-percentages/', channel: 'Brain Game Tennis', situation: 'baseline', skillLevel: 'advanced', summary: 'Baseline targeting model and percentage choices for competitive rallies.' },
    { id: 'tactic_28_attack_net', title: 'How to Attack the Net: Tennis Approach Strategy', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=How%20to%20Attack%20the%20Net%20Tennis%20Approach%20Strategy', channel: 'Tennis Evolution', situation: 'net', skillLevel: 'advanced', summary: 'Approach selection and transition-to-net execution under match pressure.' },
    { id: 'tactic_29_footwork_positioning', title: 'Tennis Strategy: Footwork Tactic & Positioning', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=Footwork%20Tactic%20and%20Positioning', channel: 'Tennis Evolution', situation: 'general', skillLevel: 'advanced', summary: 'Court position determines tactical options and shot-quality outcomes.' },
    { id: 'tactic_30_one_way_beat_pusher', title: 'The 1 Strategy to Beat the Pusher', videoUrl: 'https://www.youtube.com/@TennisEvolution/search?query=The%201%20Strategy%20to%20Beat%20the%20Pusher', channel: 'Tennis Evolution', situation: 'defense', skillLevel: 'intermediate', summary: 'One repeatable pattern to stop losing control against moonball and pusher styles.' }
  ];

  const METRIC_TO_WEAKNESS = {
    shoulder: 'shoulder_rotation_low',
    elbow: 'elbow_extension_low',
    hip: 'hip_rotation_low',
    knee: 'leg_drive_low',
    trunk: 'trunk_rotation_low',
    wrist: 'racquet_speed_low',
    stanceWidth: 'base_width_unstable',
    contactHeight: 'contact_height_inconsistent',
    reach: 'spacing_inconsistent',
    balance: 'balance_unstable',
    alignmentGap: 'kinetic_chain_disconnect',
    footworkLoad: 'footwork_slow',
    timing: 'timing_inconsistent',
    positioning: 'court_positioning_low',
    consistency: 'consistency_low'
  };

  const WEAKNESS_TO_DRILL_MAP = {
    shoulder_rotation_low: { strokeFilter: ['forehand', 'backhand', 'serve', 'multi'], drillIds: ['drill_01_complete_beginner', 'drill_04_forehand_complete', 'drill_10_modern_forehand', 'drill_19_forehand_masterclass_macci'], targets: ['shoulder rotation', 'unit turn', 'coil depth'], expectedGain: '6-12 deg cleaner unit turn in 2-3 sessions', practice: '12-15 min/day' },
    elbow_extension_low: { strokeFilter: ['forehand', 'backhand', 'volley', 'multi'], drillIds: ['drill_04_forehand_complete', 'drill_07_backhand_easy', 'drill_09_volley_img', 'drill_19_forehand_masterclass_macci'], targets: ['contact extension', 'arm path', 'ball control'], expectedGain: '4-8 deg cleaner contact structure', practice: '10-12 min/day' },
    hip_rotation_low: { strokeFilter: ['forehand', 'backhand', 'serve', 'multi'], drillIds: ['drill_08_forehand_img', 'drill_12_kinetic_chain', 'drill_14_mouratoglou_forehand', 'drill_24_agility_no_equipment'], targets: ['hip drive', 'kinetic chain', 'power transfer'], expectedGain: '5-10 deg more lower-body contribution', practice: '12-18 min/day' },
    leg_drive_low: { strokeFilter: ['serve', 'forehand', 'volley', 'multi'], drillIds: ['drill_03_serve_masterclass', 'drill_06_serve_drills_img', 'drill_12_kinetic_chain', 'drill_21_split_step'], targets: ['leg drive', 'loading depth', 'explosiveness'], expectedGain: '5-9 points in power/readiness blend', practice: '10-15 min/day' },
    trunk_rotation_low: { strokeFilter: ['forehand', 'backhand', 'serve', 'multi'], drillIds: ['drill_10_modern_forehand', 'drill_12_kinetic_chain', 'drill_28_topspin_5_steps', 'drill_29_warmup_coordination'], targets: ['torso sequencing', 'rotation timing', 'core transfer'], expectedGain: '5-8 deg cleaner torso transfer', practice: '12-15 min/day' },
    racquet_speed_low: { strokeFilter: ['forehand', 'serve', 'multi'], drillIds: ['drill_08_forehand_img', 'drill_12_kinetic_chain', 'drill_19_forehand_masterclass_macci', 'drill_27_wrist_lag'], targets: ['racquet-head speed', 'lag and release', 'acceleration'], expectedGain: '4-9 mph equivalent speed gain', practice: '10-14 min/day' },
    contact_height_inconsistent: { strokeFilter: ['forehand', 'backhand', 'serve', 'multi'], drillIds: ['drill_02_beginner_rally', 'drill_13_watch_ball', 'drill_23_ball_machine_set', 'drill_25_fix_forehand_mistakes'], targets: ['contact window', 'spacing', 'timing'], expectedGain: '6-10 points in contact-height score', practice: '10-12 min/day' },
    spacing_inconsistent: { strokeFilter: ['forehand', 'backhand', 'volley', 'multi'], drillIds: ['drill_08_forehand_img', 'drill_16_return_reaction', 'drill_23_ball_machine_set', 'drill_30_basics_footwork'], targets: ['spacing', 'distance from body', 'recovery positioning'], expectedGain: '6-10 points in spacing score', practice: '10-15 min/day' },
    balance_unstable: { strokeFilter: ['forehand', 'backhand', 'volley', 'serve', 'multi'], drillIds: ['drill_09_volley_img', 'drill_17_volley_elite_set', 'drill_21_split_step', 'drill_29_warmup_coordination'], targets: ['balance', 'base control', 'centered strike'], expectedGain: '5-9 points in footwork score', practice: '8-12 min/day' },
    footwork_slow: { strokeFilter: ['multi', 'forehand', 'backhand', 'return'], drillIds: ['drill_16_return_reaction', 'drill_21_split_step', 'drill_22_footwork_5_drills', 'drill_24_agility_no_equipment', 'drill_30_basics_footwork'], targets: ['split step', 'first move', 'court recovery'], expectedGain: '8-14 points in footwork/readiness', practice: '10-15 min/day' },
    consistency_low: { strokeFilter: ['multi', 'forehand', 'backhand'], drillIds: ['drill_02_beginner_rally', 'drill_13_watch_ball', 'drill_23_ball_machine_set', 'drill_28_topspin_5_steps'], targets: ['repeatability', 'margin', 'clean contact'], expectedGain: '6-12 points in timing consistency', practice: '12-18 min/day' },
    timing_inconsistent: { strokeFilter: ['multi', 'forehand', 'backhand', 'serve'], drillIds: ['drill_02_beginner_rally', 'drill_13_watch_ball', 'drill_16_return_reaction', 'drill_29_warmup_coordination'], targets: ['strike timing', 'ball tracking', 'tempo'], expectedGain: '6-12 points in timing consistency', practice: '8-12 min/day' },
    court_positioning_low: { strokeFilter: ['multi', 'forehand', 'backhand', 'return'], drillIds: ['drill_21_split_step', 'drill_22_footwork_5_drills', 'drill_24_agility_no_equipment', 'drill_30_basics_footwork'], targets: ['court position', 'recovery routes', 'base width'], expectedGain: '5-10 points in positioning score', practice: '10-12 min/day' },
    kinetic_chain_disconnect: { strokeFilter: ['forehand', 'serve', 'backhand', 'multi'], drillIds: ['drill_10_modern_forehand', 'drill_12_kinetic_chain', 'drill_19_forehand_masterclass_macci', 'drill_29_warmup_coordination'], targets: ['upper-lower sync', 'chain transfer', 'posture control'], expectedGain: '5-8 points in biomechanics blend', practice: '10-14 min/day' }
  };

  const TACTIC_RECOMMENDATION_MAP = [
    { id: 'baseline-margin', situations: ['baseline'], tacticIds: ['tactic_01_crosscourt_geometry', 'tactic_05_where_to_aim', 'tactic_15_crosscourt_habit'], when: (ctx) => ctx.shotType !== 'serve' },
    { id: 'serve-patterns', situations: ['serve'], tacticIds: ['tactic_07_serve_plus_one', 'tactic_08_serve_plus_one_essential', 'tactic_13_slice_vs_kick'], when: (ctx) => ctx.shotType === 'serve' || ctx.readiness < 78 },
    { id: 'net-pressure', situations: ['net'], tacticIds: ['tactic_09_dominate_net', 'tactic_11_approach_mastery', 'tactic_28_attack_net'], when: (ctx) => ctx.shotType === 'volley' || ctx.positioning < 76 },
    { id: 'defense-reset', situations: ['defense'], tacticIds: ['tactic_12_beat_pusher', 'tactic_20_smart_defense', 'tactic_24_backhand_defense', 'tactic_30_one_way_beat_pusher'], when: (ctx) => ctx.footwork < 78 || ctx.mode.includes('injury') || ctx.mode.includes('rebuild') },
    { id: 'point-construction', situations: ['point-construction'], tacticIds: ['tactic_16_first_four_shots', 'tactic_17_one_two_pattern', 'tactic_22_inside_out_fix', 'tactic_26_golden_rules'], when: (ctx) => ctx.mode.includes('match') || ctx.score >= 78 },
    { id: 'general-discipline', situations: ['general'], tacticIds: ['tactic_02_watch_ball', 'tactic_04_four_zones', 'tactic_14_dominate_singles', 'tactic_25_outsmart_opponent'], when: () => true }
  ];

  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  let supabaseClient = null;
  let supabaseLoadPromise = null;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function addDaysIso(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function slugShot(value) {
    return String(value || 'forehand').toLowerCase().replace(/\s+/g, '-');
  }

  function normalizeLevel(value) {
    const input = String(value || 'intermediate').toLowerCase();
    if (input.includes('beginner')) return 'beginner';
    if (input.includes('advanced')) return 'advanced';
    if (input.includes('pro')) return 'pro';
    return 'intermediate';
  }

  function normalizeShot(value) {
    const input = slugShot(value);
    if (input.includes('backhand')) return 'backhand';
    if (input.includes('serve')) return 'serve';
    if (input.includes('volley')) return 'volley';
    if (input.includes('slice')) return 'slice';
    if (input.includes('drop')) return 'drop-shot';
    if (input.includes('lob')) return 'lob';
    if (input.includes('return')) return 'return';
    return 'forehand';
  }

  function levelRank(level) {
    return { beginner: 1, intermediate: 2, advanced: 3, pro: 4 }[normalizeLevel(level)] || 2;
  }

  function skillRank(level) {
    if (String(level || '').toLowerCase() === 'all') return 0;
    return levelRank(level);
  }

  function supportsShot(strokeType, shotType) {
    const stroke = String(strokeType || '').toLowerCase();
    const shot = normalizeShot(shotType);
    if (!stroke || stroke.includes('multi') || stroke.includes('all')) return true;
    if (shot === 'drop-shot' || shot === 'lob' || shot === 'slice') {
      return stroke.includes('forehand') || stroke.includes('backhand') || stroke.includes(shot.replace('-', ''));
    }
    if (shot === 'return') return stroke.includes('return') || stroke.includes('serve');
    return stroke.includes(shot);
  }

  function isLevelAppropriate(resourceLevel, userLevel) {
    const resourceRank = skillRank(resourceLevel);
    const userRank = levelRank(userLevel);
    if (resourceRank === 0) return true;
    return resourceRank >= Math.max(1, userRank - 1) && resourceRank <= Math.min(4, userRank + 1);
  }

  function uniqueList(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function humanizeWeaknessKey(key) {
    return String(key || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function enrichDrillResource(drill) {
    const mappings = Object.entries(WEAKNESS_TO_DRILL_MAP).filter(([, config]) => (config.drillIds || []).includes(drill.id));
    const targets = uniqueList(mappings.flatMap(([, config]) => config.targets || []));
    const weaknessMatch = mappings.reduce((acc, [weaknessKey]) => {
      acc[weaknessKey] = 0.9;
      return acc;
    }, {});
    const expectedImprovement = mappings.reduce((acc, [weaknessKey, config]) => {
      acc[weaknessKey] = config.expectedGain;
      return acc;
    }, {});

    return {
      ...drill,
      strokeTypeLabel: String(drill.strokeType || '').replace(/multi/g, 'Multi-stroke'),
      targets,
      weaknessMatch,
      expectedImprovement,
      recommendedPracticeTime: mappings[0]?.[1]?.practice || '10-15 min/day'
    };
  }

  function enrichTacticResource(tactic) {
    const tacticalFocus = uniqueList([
      tactic.situation,
      tactic.situation === 'baseline' ? 'percentage play' : '',
      tactic.situation === 'serve' ? 'serve plus one' : '',
      tactic.situation === 'net' ? 'transition pressure' : '',
      tactic.situation === 'defense' ? 'neutralizing patterns' : '',
      tactic.situation === 'point-construction' ? 'pattern building' : '',
      tactic.situation === 'general' ? 'match discipline' : ''
    ]);

    return {
      ...tactic,
      tacticalFocus,
      expectedImprovement: tactic.situation === 'serve'
        ? { pointConstruction: '+10-18%', firstBallIntent: '+12-20%' }
        : tactic.situation === 'baseline'
          ? { consistency: '+10-15%', decisionMaking: '+12-18%' }
          : tactic.situation === 'defense'
            ? { neutralBalls: '+10-16%', recovery: '+8-14%' }
            : { decisionMaking: '+8-15%', tacticalClarity: '+10-18%' }
    };
  }

  function metricScoreLookup(assessment) {
    const lookup = {};
    (assessment.metricComparisons || []).forEach((item) => {
      lookup[item.metric] = safeNumber(item.score, 70);
    });
    lookup.timing = safeNumber(assessment.componentScores?.timing, safeNumber(assessment.performanceKpis?.timingConsistency, 70));
    lookup.footwork = safeNumber(assessment.componentScores?.footwork, safeNumber(assessment.performanceKpis?.footworkScore, 70));
    lookup.positioning = safeNumber(assessment.componentScores?.positioning, safeNumber(assessment.performanceKpis?.positioningScore, 70));
    lookup.readiness = safeNumber(assessment.componentScores?.readiness, safeNumber(assessment.performanceKpis?.readinessIndex, 70));
    lookup.consistency = safeNumber(assessment.performanceKpis?.timingConsistency, 70);
    return lookup;
  }

  function detectWeaknesses(assessment) {
    const directMetrics = [...(assessment.metricComparisons || [])]
      .filter((item) => item.status === 'needs-work' || item.status === 'workable' || safeNumber(item.score, 80) < 78)
      .sort((a, b) => {
        if (safeNumber(a.score, 0) !== safeNumber(b.score, 0)) return safeNumber(a.score, 0) - safeNumber(b.score, 0);
        return Math.abs(safeNumber(b.delta, 0)) - Math.abs(safeNumber(a.delta, 0));
      })
      .map((item) => ({
        weaknessKey: METRIC_TO_WEAKNESS[item.metric] || `${item.metric}_low`,
        metric: item.metric,
        score: safeNumber(item.score, 70),
        severity: item.status === 'needs-work' ? 'high' : 'moderate',
        priority: item.status === 'needs-work' ? 1 : 2,
        delta: safeNumber(item.delta, 0),
        label: humanizeWeaknessKey(METRIC_TO_WEAKNESS[item.metric] || `${item.metric}_low`)
      }));

    const supplemental = [];
    const kpis = assessment.performanceKpis || {};
    if (safeNumber(kpis.timingConsistency, 100) < 76) supplemental.push({ weaknessKey: 'timing_inconsistent', metric: 'timing', score: safeNumber(kpis.timingConsistency, 70), severity: 'high', priority: 1, delta: 0, label: 'Timing Inconsistent' });
    if (safeNumber(kpis.footworkScore, 100) < 76) supplemental.push({ weaknessKey: 'footwork_slow', metric: 'footwork', score: safeNumber(kpis.footworkScore, 70), severity: 'high', priority: 1, delta: 0, label: 'Footwork Slow' });
    if (safeNumber(kpis.positioningScore, 100) < 76) supplemental.push({ weaknessKey: 'court_positioning_low', metric: 'positioning', score: safeNumber(kpis.positioningScore, 70), severity: 'moderate', priority: 2, delta: 0, label: 'Court Positioning Low' });
    if (safeNumber(kpis.spacingScore, 100) < 76) supplemental.push({ weaknessKey: 'spacing_inconsistent', metric: 'reach', score: safeNumber(kpis.spacingScore, 70), severity: 'moderate', priority: 2, delta: 0, label: 'Spacing Inconsistent' });

    const merged = [...directMetrics, ...supplemental];
    const byKey = new Map();
    merged.forEach((item) => {
      if (!byKey.has(item.weaknessKey) || safeNumber(item.score, 100) < safeNumber(byKey.get(item.weaknessKey).score, 100)) {
        byKey.set(item.weaknessKey, item);
      }
    });

    return [...byKey.values()]
      .sort((a, b) => a.priority - b.priority || safeNumber(a.score, 100) - safeNumber(b.score, 100))
      .slice(0, 5);
  }

  function calculateDrillRelevance(drill, weakness, assessment) {
    const mapping = WEAKNESS_TO_DRILL_MAP[weakness.weaknessKey];
    if (!mapping) return 0;
    let score = 0;
    if ((mapping.drillIds || []).includes(drill.id)) score += 55;
    if ((drill.metricTags || []).includes(weakness.metric)) score += 20;
    if (supportsShot(drill.strokeType, assessment.shotType)) score += 15;
    if (isLevelAppropriate(drill.skillLevel, assessment.level || assessment.playerLevel)) score += 10;
    if (String(drill.channel || '').includes('Intuitive') || String(drill.channel || '').includes('Top Tennis') || String(drill.channel || '').includes('Rick Macci')) score += 5;
    return score;
  }

  function matchDrillsToWeaknesses(assessment) {
    const shotType = normalizeShot(assessment.shotType || 'forehand');
    const level = normalizeLevel(assessment.level || assessment.playerLevel || 'intermediate');
    const weaknesses = detectWeaknesses(assessment);
    const recommendations = [];
    const used = new Set();

    weaknesses.forEach((weakness) => {
      const mapping = WEAKNESS_TO_DRILL_MAP[weakness.weaknessKey];
      if (!mapping) return;
      const candidates = getDrillLibrary({ level, shotType })
        .filter((drill) => !used.has(drill.id))
        .filter((drill) => (mapping.drillIds || []).includes(drill.id) || (mapping.strokeFilter || []).some((stroke) => supportsShot(drill.strokeType, stroke)))
        .map((drill) => ({
          weakness,
          drill,
          relevanceScore: calculateDrillRelevance(drill, weakness, { ...assessment, shotType, level })
        }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      const top = candidates[0];
      if (!top) return;
      used.add(top.drill.id);
      recommendations.push({
        id: top.drill.id,
        title: top.drill.title,
        focus: `${humanizeWeaknessKey(weakness.weaknessKey)} | ${top.drill.focus}`,
        prescription: `${mapping.practice || top.drill.recommendedPracticeTime || '10-15 min/day'} with one focused correction cue, then 6-10 live-ball reps.`,
        cue: metricCue(weakness.metric, safeNumber(weakness.delta, 0)),
        videoUrl: top.drill.videoUrl,
        videoTitle: top.drill.title,
        channel: top.drill.channel,
        duration: top.drill.duration || '',
        libraryFocus: top.drill.focus || '',
        priority: weakness.priority,
        priorityLabel: weakness.severity === 'high' ? 'High priority' : 'Build next',
        weaknessKey: weakness.weaknessKey,
        weaknessLabel: weakness.label,
        targets: mapping.targets || top.drill.targets || [],
        expectedImprovement: mapping.expectedGain,
        whyThisFits: `Recommended because ${weakness.label.toLowerCase()} is one of the largest gaps in this session and this drill directly trains ${((mapping.targets || []).slice(0, 2).join(' and ')) || 'the needed movement pattern'}.`,
        relevanceScore: top.relevanceScore,
        recommendedPracticeTime: mapping.practice || top.drill.recommendedPracticeTime || '10-15 min/day'
      });
    });

    return recommendations.slice(0, 5);
  }

  function calculateTacticRelevance(tactic, context, assessment) {
    let score = 0;
    if ((context.tacticIds || []).includes(tactic.id)) score += 55;
    if (String(tactic.situation || '').includes(context.situations?.[0] || '')) score += 20;
    if (isLevelAppropriate(tactic.skillLevel, assessment.level || assessment.playerLevel)) score += 15;
    if (assessment.sessionMode && String(tactic.summary || '').toLowerCase().includes('pressure')) score += 5;
    return score;
  }

  function matchTacticsToProfile(assessment) {
    const level = normalizeLevel(assessment.level || assessment.playerLevel || 'intermediate');
    const score = safeNumber(assessment.overallScore, assessment.score, 70);
    const metrics = metricScoreLookup(assessment);
    const mode = String(assessment.sessionMode || '').toLowerCase();
    const ctx = {
      shotType: normalizeShot(assessment.shotType || 'forehand'),
      mode,
      score,
      readiness: safeNumber(assessment.performanceKpis?.readinessIndex, safeNumber(metrics.readiness, 70)),
      footwork: safeNumber(assessment.performanceKpis?.footworkScore, safeNumber(metrics.footwork, 70)),
      positioning: safeNumber(assessment.performanceKpis?.positioningScore, safeNumber(metrics.positioning, 70))
    };

    const picks = [];
    const used = new Set();
    TACTIC_RECOMMENDATION_MAP.forEach((context) => {
      if (!context.when(ctx)) return;
      const candidate = getTacticLibrary({ level, situation: context.situations[0] })
        .filter((item) => !used.has(item.id))
        .map((item) => ({ tactic: item, score: calculateTacticRelevance(item, context, assessment) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!candidate) return;
      used.add(candidate.tactic.id);
      picks.push({
        ...candidate.tactic,
        relevanceScore: candidate.score,
        message: context.id === 'serve-patterns'
          ? 'You are ready for a serve-plus-one plan so the serve and next ball work as one pattern.'
          : context.id === 'baseline-margin'
            ? 'Your report needs higher-margin baseline decisions, not just cleaner mechanics.'
            : context.id === 'net-pressure'
              ? 'These tactics help you turn improved movement into finishing patterns at the net.'
              : context.id === 'defense-reset'
                ? 'Use these tactical resets to survive pressure while the mechanics catch up.'
                : context.id === 'point-construction'
                  ? 'Your score is high enough to benefit from intentional point-building patterns.'
                  : 'These match-play habits raise decision quality and reduce free points given away.'
      });
    });

    return picks.slice(0, 3);
  }

  function getMonthKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  }

  function getSupabaseConfig() {
    const fromWindow = window.SMARTSWING_SUPABASE_CONFIG || {};
    const fromStorage = read(KEYS.supabaseConfig, {}) || {};
    const url = String(fromWindow.url || fromStorage.url || '').trim();
    const anonKey = String(fromWindow.anonKey || fromStorage.anonKey || '').trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  }

  function isLocalDevelopmentHost() {
    const host = String(window.location.hostname || '').toLowerCase();
    return !host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  }

  function allowLocalDataMode() {
    if (window.SMARTSWING_ALLOW_LOCAL_MODE === true) return true;
    if (window.SMARTSWING_ALLOW_LOCAL_MODE === false) return false;
    return isLocalDevelopmentHost();
  }

  function getAuthAvailability() {
    const supabaseConfigured = isSupabaseConfigured();
    const localDataMode = allowLocalDataMode();
    return {
      supabaseConfigured,
      localDataMode,
      emailPasswordAvailable: supabaseConfigured || localDataMode,
      socialOAuthAvailable: supabaseConfigured
    };
  }

  async function getOAuthProviderAvailability(provider) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const providerLabel = normalizedProvider === 'facebook'
      ? 'Meta'
      : normalizedProvider
        ? `${normalizedProvider.slice(0, 1).toUpperCase()}${normalizedProvider.slice(1)}`
        : 'OAuth';
    const cfg = getSupabaseConfig();
    if (!cfg || !normalizedProvider) {
      return {
        provider: normalizedProvider,
        available: false,
        reason: `${providerLabel} sign-in is unavailable because the Supabase public configuration is incomplete.`
      };
    }

    const probeUrl = new URL('/auth/v1/authorize', cfg.url);
    probeUrl.searchParams.set('provider', normalizedProvider);
    probeUrl.searchParams.set('redirect_to', getOAuthCallbackUrl());

    try {
      const response = await fetch(probeUrl.toString(), {
        method: 'GET',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`
        },
        redirect: 'manual'
      });

      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400) || response.ok) {
        return {
          provider: normalizedProvider,
          available: true,
          reason: ''
        };
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const message = String(
        payload?.msg ||
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        ''
      ).trim();

      if (/provider is not enabled/i.test(message)) {
        return {
          provider: normalizedProvider,
          available: false,
          reason: `${providerLabel} sign-in is not enabled in Supabase yet.`
        };
      }

      return {
        provider: normalizedProvider,
        available: false,
        reason: message || `${providerLabel} sign-in is unavailable right now.`
      };
    } catch (error) {
      return {
        provider: normalizedProvider,
        available: false,
        reason: error?.message || `${providerLabel} sign-in is unavailable right now.`
      };
    }
  }

  function clearUnsafeLocalSession() {
    if (allowLocalDataMode() || isSupabaseConfigured()) return;
    localStorage.removeItem(KEYS.session);
  }

  function setSupabaseConfig(config) {
    const payload = {
      url: String(config?.url || '').trim(),
      anonKey: String(config?.anonKey || '').trim()
    };
    if (!payload.url || !payload.anonKey) {
      throw new Error('Supabase URL and anon key are required.');
    }
    write(KEYS.supabaseConfig, payload);
    supabaseClient = null;
    supabaseLoadPromise = null;
    return payload;
  }

  function clearSupabaseConfig() {
    localStorage.removeItem(KEYS.supabaseConfig);
    supabaseClient = null;
    supabaseLoadPromise = null;
  }

  function isSupabaseConfigured() {
    return !!getSupabaseConfig();
  }

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (supabaseLoadPromise) return supabaseLoadPromise;
    supabaseLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Supabase library.'));
      document.head.appendChild(script);
    });
    return supabaseLoadPromise;
  }

  async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    const cfg = getSupabaseConfig();
    if (!cfg) return null;
    await loadSupabaseLibrary();
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    if (!supabaseClient.__smartSwingAuthListenerBound) {
      supabaseClient.__smartSwingAuthListenerBound = true;
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(KEYS.session);
          return;
        }
        if (!session?.user) return;
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          Promise.resolve()
            .then(() => hydrateSupabaseUser(session.user, { pullLatest: event !== 'INITIAL_SESSION' }))
            .catch(() => {});
        }
      });
    }
    return supabaseClient;
  }

  function getAppBaseUrl() {
    return `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}`;
  }

  /**
   * Fire-and-forget transactional email via /api/send-email.
   * Never throws — email failures must not break the user flow.
   * @param {string} type  — welcome | analysis_warning | paywall_hit | payment_success | win_back_7d | win_back_21d
   * @param {object} data  — { firstName, email, planName, billingInterval, … }
   */
  function fireEmailEvent(type, data = {}) {
    try {
      const endpoint = `${getAppBaseUrl()}api/send-email`;
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data })
      }).catch((err) => {
        console.warn('[SmartSwing] Email event failed (non-critical):', type, err?.message || err);
      });
    } catch (err) {
      console.warn('[SmartSwing] fireEmailEvent error (non-critical):', err?.message || err);
    }
  }

  function getOAuthCallbackUrl() {
    return `${getAppBaseUrl()}auth-callback.html`;
  }

  function setCheckoutIntent(intent = {}) {
    const planId = String(intent.planId || '').toLowerCase();
    if (!PLAN_DEFINITIONS[planId]) return null;
    return write(KEYS.checkoutIntent, {
      planId,
      billingInterval: normalizeBillingInterval(intent.billingInterval || intent.interval || 'monthly'),
      source: intent.source || window.location.pathname || '',
      createdAt: intent.createdAt || nowIso()
    });
  }

  function getCheckoutIntent() {
    return read(KEYS.checkoutIntent, null);
  }

  function clearCheckoutIntent() {
    localStorage.removeItem(KEYS.checkoutIntent);
  }

  function getCheckoutIntentDestination(intent = getCheckoutIntent()) {
    if (!intent?.planId || !PLAN_DEFINITIONS[intent.planId]) return '';
    const params = new URLSearchParams({ plan: intent.planId });
    if (intent.planId !== 'free') {
      params.set('interval', normalizeBillingInterval(intent.billingInterval || 'monthly'));
    }
    return `${getAppBaseUrl()}cart.html?${params.toString()}`;
  }

  function isOnboardingRequired(userId) {
    const user = userId
      ? getUsers().find((entry) => entry.id === userId)
      : getCurrentUser();
    if (!user || user.role !== 'player') return false;
    return Boolean(user.onboardingRequiredAt && !user.onboardingCompletedAt);
  }

  function getOnboardingRoute(user) {
    const targetUser = user?.id
      ? (getUsers().find((entry) => entry.id === user.id) || user)
      : getCurrentUser();
    if (!isOnboardingRequired(targetUser?.id)) return '';
    const params = new URLSearchParams({
      plan: targetUser?.onboardingPlanId || targetUser?.trialPlanId || targetUser?.planId || 'free'
    });
    const planId = params.get('plan');
    if (planId && planId !== 'free') {
      params.set('interval', normalizeBillingInterval(targetUser?.billingInterval || 'monthly'));
    }
    return `${getAppBaseUrl()}welcome.html?${params.toString()}`;
  }

  function getPostAuthDestinationForUser(user) {
    const checkoutIntentDestination = getCheckoutIntentDestination();
    if (checkoutIntentDestination) return checkoutIntentDestination;
    const onboardingRoute = getOnboardingRoute(user);
    if (onboardingRoute) return onboardingRoute;
    const access = getAccessContext(user?.id);
    if (access.role === 'coach' && access.canAccessCoachDashboard) return `${getAppBaseUrl()}coach-dashboard.html`;
    return `${getAppBaseUrl()}dashboard.html`;
  }

  function buildLocalUserFromSupabase(authUser, profile = null) {
    const email = String(profile?.email || authUser?.email || '').trim().toLowerCase();
    const existingLocal = getUsers().find((entry) => entry.id === authUser?.id || (email && entry.email === email));
    return {
      id: authUser.id,
      fullName: profile?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || existingLocal?.fullName || authUser.email || 'Player',
      email: email || existingLocal?.email || '',
      role: profile?.role || authUser.user_metadata?.role || existingLocal?.role || 'player',
      ageRange: profile?.age_range || existingLocal?.ageRange || '',
      gender: profile?.gender || existingLocal?.gender || '',
      ustaLevel: profile?.usta_level || existingLocal?.ustaLevel || '',
      utrRating: profile?.utr_rating || existingLocal?.utrRating || '',
      preferredHand: profile?.preferred_hand || existingLocal?.preferredHand || 'right',
      avatarDataUrl: existingLocal?.avatarDataUrl || profile?.avatar_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '',
      planId: profile?.subscription_tier || existingLocal?.planId || 'free',
      trialPlanId: profile?.trial_plan_id || existingLocal?.trialPlanId || null,
      trialStartedAt: profile?.trial_started_at || existingLocal?.trialStartedAt || null,
      trialEndsAt: profile?.trial_ends_at || existingLocal?.trialEndsAt || null,
      trialHistory: Array.isArray(profile?.trial_history) ? profile.trial_history : getTrialHistory(existingLocal),
      subscriptionStatus: profile?.subscription_status || existingLocal?.subscriptionStatus || 'free',
      stripeCustomerId: profile?.stripe_customer_id || existingLocal?.stripeCustomerId || '',
      stripeSubscriptionId: profile?.stripe_subscription_id || existingLocal?.stripeSubscriptionId || '',
      billingPeriodEnd: profile?.billing_period_end || existingLocal?.billingPeriodEnd || null,
      billingInterval: normalizeBillingInterval(profile?.billing_interval || existingLocal?.billingInterval || 'monthly'),
      subscriptionCancelAtPeriodEnd: Boolean(profile?.subscription_cancel_at_period_end ?? existingLocal?.subscriptionCancelAtPeriodEnd ?? false),
      subscriptionCanceledAt: profile?.subscription_canceled_at || existingLocal?.subscriptionCanceledAt || null,
      phone: profile?.phone || existingLocal?.phone || '',
      addressLine1: profile?.address_line_1 || existingLocal?.addressLine1 || '',
      addressLine2: profile?.address_line_2 || existingLocal?.addressLine2 || '',
      city: profile?.city || existingLocal?.city || '',
      stateRegion: profile?.state_region || existingLocal?.stateRegion || '',
      postalCode: profile?.postal_code || existingLocal?.postalCode || '',
      country: profile?.country || existingLocal?.country || '',
      playerIdentity: existingLocal?.playerIdentity || '',
      playingStyle: existingLocal?.playingStyle || '',
      practiceFrequency: existingLocal?.practiceFrequency || '',
      favoriteShot: existingLocal?.favoriteShot || '',
      improvementGoals: Array.isArray(existingLocal?.improvementGoals) ? existingLocal.improvementGoals : [],
      onboardingRequiredAt: existingLocal?.onboardingRequiredAt || null,
      onboardingCompletedAt: existingLocal?.onboardingCompletedAt || null,
      onboardingPlanId: existingLocal?.onboardingPlanId || null,
      onboardingSource: existingLocal?.onboardingSource || '',
      createdAt: profile?.created_at || existingLocal?.createdAt || nowIso()
    };
  }

  async function hydrateSupabaseUser(authUser, options = {}) {
    if (!authUser?.id) return null;
    const client = await getSupabaseClient();
    if (!client) return null;
    const { data: profile } = await client.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    const local = buildLocalUserFromSupabase(authUser, profile);
    upsertLocalUser(local);
    write(KEYS.session, { userId: local.id, loggedInAt: nowIso(), provider: 'supabase' });
    localStorage.removeItem(KEYS.autoSessionOptOut);
    await ensureRemoteProfile(local);
    if (options.pullLatest !== false) {
      await pullRemoteState(local.id);
    }
    return local;
  }

  async function restoreSupabaseSession() {
    if (!isSupabaseConfigured()) return null;
    const client = await getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(error.message || 'Unable to restore Supabase session.');
    const authUser = data?.session?.user;
    if (!authUser) return null;
    return hydrateSupabaseUser(authUser);
  }

  function getUsers() {
    return read(KEYS.users, []);
  }

  function getAssessments() {
    return read(KEYS.assessments, []);
  }

  function getCoachSessions() {
    return read(KEYS.coachSessions, []);
  }

  function getGoals() {
    return read(KEYS.goals, []);
  }

  function getMessages() {
    return read(KEYS.messages, []);
  }

  function getDrillAssignments() {
    return read(KEYS.drillAssignments, []);
  }

  function getProgressEvents() {
    return read(KEYS.progressEvents, []);
  }

  function getReportUsage() {
    return read(KEYS.reportUsage, []);
  }

  function getCurrentSession() {
    return read(KEYS.session, null);
  }

  function getCurrentUser() {
    const session = getCurrentSession();
    if (!session?.userId) return null;
    return getUsers().find((user) => user.id === session.userId) || null;
  }

  function getPlanDefinition(planId) {
    return PLAN_DEFINITIONS[planId] || PLAN_DEFINITIONS.free;
  }

  function normalizeBillingInterval(value) {
    const input = String(value || 'monthly').trim().toLowerCase();
    if (input === 'annual') return 'yearly';
    return input === 'yearly' ? 'yearly' : 'monthly';
  }

  function getPlanPrice(planId, billingInterval = 'monthly') {
    const plan = getPlanDefinition(planId);
    const interval = normalizeBillingInterval(billingInterval);
    const amount = interval === 'yearly' && Number.isFinite(plan.yearlyPrice)
      ? plan.yearlyPrice
      : plan.monthlyPrice;
    const monthlyEquivalent = interval === 'yearly' && amount
      ? Number((amount / 12).toFixed(2))
      : plan.monthlyPrice;
    return {
      amount,
      interval,
      monthlyEquivalent,
      discountPercent: interval === 'yearly' && amount ? YEARLY_DISCOUNT_PERCENT : 0
    };
  }

  function getPaymentProviderSettings() {
    const fromWindow = window.SMARTSWING_PAYMENT_CONFIG || {};
    return {
      ...PAYMENT_PROVIDER_SETTINGS,
      stripe: {
        ...PAYMENT_PROVIDER_SETTINGS.stripe,
        ...(fromWindow.stripe || {}),
        apiBasePath: String(
          fromWindow?.stripe?.apiBasePath ||
          PAYMENT_PROVIDER_SETTINGS.stripe.apiBasePath ||
          '/api'
        ).trim() || '/api',
        portalApiPath: String(
          fromWindow?.stripe?.portalApiPath ||
          PAYMENT_PROVIDER_SETTINGS.stripe.portalApiPath ||
          '/api/create-billing-portal-session'
        ).trim() || '/api/create-billing-portal-session'
      }
    };
  }

  function getPublicOrigin() {
    if (typeof window !== 'undefined' && /^https?:/i.test(window.location.origin || '')) {
      return window.location.origin;
    }
    return getPaymentProviderSettings().publicOrigin;
  }

  function getStripePlanConfig(planId, billingInterval = 'monthly') {
    const config = getPaymentProviderSettings().stripe.plans[String(planId || 'free').toLowerCase()] || null;
    if (!config || config.mode !== 'stripe-subscription') return config;
    const interval = normalizeBillingInterval(billingInterval);
    const intervalConfig = config.intervals?.[interval] || config.intervals?.monthly || null;
    if (!intervalConfig) return null;
    return {
      ...config,
      billingInterval: interval,
      intervalConfig,
      envPriceKey: intervalConfig.envPriceKey,
      planName: intervalConfig.planName,
      amount: intervalConfig.amount
    };
  }

  function getPendingExternalCheckout() {
    return read(KEYS.paymentCheckoutState, null);
  }

  function clearPendingExternalCheckout() {
    localStorage.removeItem(KEYS.paymentCheckoutState);
  }

  function beginExternalCheckout(planId, options = {}) {
    const checkout = {
      id: uid('checkout'),
      planId: String(planId || 'free').toLowerCase(),
      billingInterval: normalizeBillingInterval(options.billingInterval || 'monthly'),
      provider: options.provider || getPaymentProviderSettings().activeProvider,
      startedAt: nowIso(),
      returnTo: String(options.returnTo || './dashboard.html'),
      cancelTo: String(options.cancelTo || './checkout.html'),
      source: String(options.source || 'checkout')
    };
    write(KEYS.paymentCheckoutState, checkout);
    return checkout;
  }

  function updatePendingExternalCheckout(updates = {}) {
    const current = getPendingExternalCheckout();
    if (!current) return null;
    const next = {
      ...current,
      ...updates,
      updatedAt: nowIso()
    };
    write(KEYS.paymentCheckoutState, next);
    return next;
  }

  function getExternalCheckoutRoute(planId, options = {}) {
    const normalizedPlanId = String(planId || 'free').toLowerCase();
    const billingInterval = normalizeBillingInterval(options.billingInterval || 'monthly');
    if (normalizedPlanId === 'free') {
      return {
        provider: 'internal',
        mode: 'internal-free',
        ready: true,
        href: `./checkout.html?plan=${encodeURIComponent(normalizedPlanId)}&interval=${encodeURIComponent(billingInterval)}`,
        reason: ''
      };
    }

    const stripePlan = getStripePlanConfig(normalizedPlanId, billingInterval);
    if (!stripePlan || stripePlan.mode !== 'stripe-subscription') {
      return {
        provider: getPaymentProviderSettings().activeProvider,
        mode: 'unsupported',
        ready: false,
        href: '',
        reason: 'No Stripe price mapping exists for this app plan yet.'
      };
    }

    return {
      provider: 'stripe',
      mode: 'stripe-subscription',
      ready: true,
      href: '',
      reason: '',
      stripePlan,
      billingInterval,
      apiPath: `${getPaymentProviderSettings().stripe.apiBasePath.replace(/\/$/, '')}/create-checkout-session`
    };
  }

  async function createStripeCheckout(planId, options = {}) {
    const normalizedPlanId = String(planId || 'free').toLowerCase();
    const billingInterval = normalizeBillingInterval(options.billingInterval || 'monthly');
    if (normalizedPlanId === 'free') {
      return {
        provider: 'internal',
        mode: 'internal-free',
        redirectUrl: `./checkout.html?plan=${encodeURIComponent(normalizedPlanId)}&interval=${encodeURIComponent(billingInterval)}`
      };
    }

    const stripePlan = getStripePlanConfig(normalizedPlanId, billingInterval);
    if (!stripePlan || stripePlan.mode !== 'stripe-subscription') {
      throw new Error('No Stripe price mapping exists for this SmartSwing plan.');
    }

    const user = getCurrentUser();
    if (!user) {
      throw new Error('You must sign in before starting a paid checkout.');
    }

    const checkout = beginExternalCheckout(normalizedPlanId, {
      provider: 'stripe',
      billingInterval,
      returnTo: options.returnTo,
      cancelTo: options.cancelTo,
      source: options.source
    });

    const endpoint = `${getPaymentProviderSettings().stripe.apiBasePath.replace(/\/$/, '')}/create-checkout-session`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: normalizedPlanId,
        billingInterval,
        smartSwingUserId: user.id,
        email: user.email,
        fullName: user.fullName || '',
        stripeCustomerId: user.stripeCustomerId || '',
        checkoutId: checkout.id,
        source: options.source || 'checkout-page',
        couponCode: options.couponCode ? String(options.couponCode).trim().toUpperCase() : ''
      })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok || !payload?.url || !payload?.sessionId) {
      throw new Error(payload?.error || 'Unable to create Stripe checkout session right now.');
    }

    updatePendingExternalCheckout({
      provider: 'stripe',
      stripeSessionId: payload.sessionId,
      stripeCheckoutUrl: payload.url,
      billingInterval
    });

    return {
      provider: 'stripe',
      mode: 'stripe-subscription',
      sessionId: payload.sessionId,
      billingInterval,
      url: payload.url
    };
  }

  async function createStripeBillingPortal(returnTo = './settings.html') {
    const user = getCurrentUser();
    if (!user) {
      throw new Error('You must sign in before managing billing.');
    }
    const endpoint = String(getPaymentProviderSettings().stripe.portalApiPath || '/api/create-billing-portal-session').replace(/\/$/, '');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smartSwingUserId: user.id,
        returnTo
      })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || 'Unable to open Stripe billing portal right now.');
    }

    return payload;
  }

  async function verifyStripeCheckoutSession(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      throw new Error('Stripe session id is required for verification.');
    }

    const endpoint = `${getPaymentProviderSettings().stripe.apiBasePath.replace(/\/$/, '')}/checkout-session-status?session_id=${encodeURIComponent(normalizedSessionId)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok || !payload) {
      throw new Error(payload?.error || 'Unable to verify Stripe checkout session.');
    }

    return payload;
  }

  function applyBillingActivation(userId, billing = {}) {
    const targetUserId = userId || requireUser().id;
    const users = getUsers();
    const idx = users.findIndex((entry) => entry.id === targetUserId);
    if (idx < 0) throw new Error('User not found for billing update.');

    const requestedPlan = getPlanDefinition(billing.planId || users[idx].planId || 'free');
    const normalizedStatus = String(billing.subscriptionStatus || billing.status || '').toLowerCase();
    const finalPlan = ['canceled', 'unpaid', 'incomplete_expired'].includes(normalizedStatus)
      ? PLAN_DEFINITIONS.free
      : requestedPlan;

    users[idx] = {
      ...users[idx],
      planId: finalPlan.id,
      subscriptionStatus: normalizedStatus || (finalPlan.id === 'free' ? 'free' : 'active'),
      stripeCustomerId: billing.stripeCustomerId ?? users[idx].stripeCustomerId ?? '',
      stripeSubscriptionId: billing.stripeSubscriptionId ?? users[idx].stripeSubscriptionId ?? '',
      billingPeriodEnd: billing.billingPeriodEnd ?? users[idx].billingPeriodEnd ?? null,
      billingInterval: normalizeBillingInterval(billing.billingInterval ?? users[idx].billingInterval ?? 'monthly'),
      subscriptionCancelAtPeriodEnd: Boolean(billing.subscriptionCancelAtPeriodEnd ?? users[idx].subscriptionCancelAtPeriodEnd ?? false),
      subscriptionCanceledAt: billing.subscriptionCanceledAt ?? users[idx].subscriptionCanceledAt ?? null,
      trialPlanId: finalPlan.id === 'free' ? null : users[idx].trialPlanId,
      trialStartedAt: finalPlan.id === 'free' ? null : users[idx].trialStartedAt,
      trialEndsAt: finalPlan.id === 'free' ? null : users[idx].trialEndsAt,
      onboardingRequiredAt: users[idx].role === 'player' && finalPlan.id !== 'free' && !users[idx].onboardingCompletedAt
        ? (users[idx].onboardingRequiredAt || nowIso())
        : (users[idx].onboardingRequiredAt || null),
      onboardingPlanId: users[idx].role === 'player' && finalPlan.id !== 'free'
        ? finalPlan.id
        : (users[idx].onboardingPlanId || null),
      onboardingSource: users[idx].role === 'player' && finalPlan.id !== 'free'
        ? 'payment-success'
        : (users[idx].onboardingSource || ''),
      updatedAt: nowIso()
    };
    persistUsers(users);
    return users[idx];
  }

  function isTrialActive(user) {
    if (!user?.trialEndsAt) return false;
    return new Date(user.trialEndsAt).getTime() > Date.now();
  }

  function isManagerRole(role) {
    return role === 'manager' || role === 'admin';
  }

  function getTrialHistory(user) {
    return Array.isArray(user?.trialHistory) ? user.trialHistory : [];
  }

  function hasConsumedTrial(user, planId) {
    const history = getTrialHistory(user);
    if (!history.length) return false;
    if (!planId) return true;
    return history.some((entry) => (entry.planId || entry.plan || '').toLowerCase() === String(planId).toLowerCase());
  }

  function getTrialEligibility(userId, planId) {
    const user = userId
      ? getUsers().find((entry) => entry.id === userId)
      : getCurrentUser();
    const normalizedPlanId = String(planId || user?.planId || 'free').toLowerCase();
    if (normalizedPlanId === 'free') {
      return { eligible: false, reason: 'Free plan does not use trial access.' };
    }
    if (!user) {
      return { eligible: true, reason: 'Available after account creation.' };
    }
    if (isTrialActive(user)) {
      return { eligible: false, reason: 'A trial is already active on this account.' };
    }
    if (hasConsumedTrial(user, normalizedPlanId) || getTrialHistory(user).length > 0) {
      return { eligible: false, reason: 'Trial already used on this account.' };
    }
    return { eligible: true, reason: '' };
  }

  function getCurrentPlan(userId) {
    const user = userId
      ? getUsers().find((entry) => entry.id === userId)
      : getCurrentUser();
    const planId = isTrialActive(user)
      ? (user?.trialPlanId || user?.planId || 'free')
      : (user?.planId || 'free');
    const plan = getPlanDefinition(planId);
    return {
      ...plan,
      isTrial: isTrialActive(user),
      trialEndsAt: user?.trialEndsAt || null,
      subscriptionStatus: user?.subscriptionStatus || 'active',
      billingInterval: normalizeBillingInterval(user?.billingInterval || 'monthly'),
      subscriptionCancelAtPeriodEnd: Boolean(user?.subscriptionCancelAtPeriodEnd || false),
      subscriptionCanceledAt: user?.subscriptionCanceledAt || null
    };
  }

  function setCurrentPlan(planId, userId) {
    const plan = getPlanDefinition(planId);
    const targetUserId = userId || requireUser().id;
    const users = getUsers();
    const idx = users.findIndex((entry) => entry.id === targetUserId);
    if (idx < 0) throw new Error('User not found for plan update.');
    users[idx] = {
      ...users[idx],
      planId: plan.id,
      trialPlanId: null,
      trialStartedAt: null,
      trialEndsAt: null,
      updatedAt: nowIso(),
      subscriptionStatus: plan.id === 'free' ? 'free' : 'active',
      billingPeriodEnd: null,
      billingInterval: 'monthly',
      subscriptionCancelAtPeriodEnd: false,
      subscriptionCanceledAt: null,
      onboardingRequiredAt: users[idx].role === 'player' && !users[idx].onboardingCompletedAt
        ? (users[idx].onboardingRequiredAt || nowIso())
        : (users[idx].onboardingRequiredAt || null),
      onboardingPlanId: users[idx].role === 'player' ? plan.id : (users[idx].onboardingPlanId || null),
      onboardingSource: users[idx].role === 'player' ? 'plan-activation' : (users[idx].onboardingSource || '')
    };
    persistUsers(users);
    return plan;
  }

  function startPlanTrial(planId, userId) {
    // Free trials are no longer available. New accounts receive 2 free lifetime assessments.
    // To unlock more analyses, choose a paid plan on the pricing page.
    throw new Error('Free trials are no longer available. Please choose a plan to get started.');
  }

  function getMonthlyUsage(userId, monthKey) {
    const id = userId || getCurrentUser()?.id;
    const month = monthKey || getMonthKey();
    if (!id) {
      return {
        userId: null,
        monthKey: month,
        count: 0,
        history: []
      };
    }
    return getReportUsage().find((entry) => entry.userId === id && entry.monthKey === month) || {
      userId: id,
      monthKey: month,
      count: 0,
      history: []
    };
  }

  function canGenerateReport(userId) {
    const plan = getCurrentPlan(userId);
    // Free users get a lifetime quota of 2 assessments (not monthly resets)
    const usageKey = plan.id === 'free' ? 'lifetime-free' : undefined;
    const usage = getMonthlyUsage(userId, usageKey);
    const limit = plan.monthlyReviews;
    if (!Number.isFinite(limit)) {
      return { allowed: true, remaining: Infinity, used: usage.count, limit, plan };
    }
    const remaining = Math.max(0, limit - usage.count);
    return { allowed: remaining > 0, remaining, used: usage.count, limit, plan };
  }

  function consumeMonthlyReportCredit(payload) {
    const user = requireUser();
    const plan = getCurrentPlan(user.id);
    // Free users track against a lifetime key so the quota never resets
    const monthKey = plan.id === 'free' ? 'lifetime-free' : getMonthKey();
    const check = canGenerateReport(user.id);
    if (!check.allowed) {
      const planLabel = check.plan.name || 'current';
      const msg = check.plan.id === 'free'
        ? 'You have used your 2 free analyses. Choose a plan to keep analysing your game.'
        : `Monthly report limit reached for ${planLabel}. Upgrade your plan to continue.`;
      const err = new Error(msg);
      err.redirectToPricing = true;
      throw err;
    }

    const all = getReportUsage();
    const idx = all.findIndex((entry) => entry.userId === user.id && entry.monthKey === monthKey);
    const historyItem = {
      id: uid('usage'),
      createdAt: nowIso(),
      shotType: normalizeShot(payload?.shotType || 'forehand'),
      source: payload?.source || 'analysis-report'
    };

    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        count: safeNumber(all[idx].count) + 1,
        history: [historyItem, ...(all[idx].history || [])].slice(0, 120)
      };
    } else {
      all.push({
        id: uid('usage_month'),
        userId: user.id,
        monthKey,
        count: 1,
        history: [historyItem]
      });
    }

    persistReportUsage(all);
    const afterState = canGenerateReport(user.id);

    // Trigger email events based on remaining free analyses (fire-and-forget)
    if (plan.id === 'free') {
      const firstName = (user.fullName || '').split(' ')[0] || 'there';
      const email = user.email || '';
      if (email) {
        if (afterState.remaining === 1) {
          fireEmailEvent('analysis_warning', { firstName, email });
        } else if (afterState.remaining === 0) {
          fireEmailEvent('paywall_hit', { firstName, email });
        }
      }
    }

    return afterState;
  }

  function canSaveReport(userId) {
    return !!getCurrentPlan(userId).canSaveReport;
  }

  function canPrintReport(userId) {
    return !!getCurrentPlan(userId).canPrintReport;
  }

  function canAccessLibrary(userId) {
    const plan = getCurrentPlan(userId);
    return !!(plan.hasDrillLibrary || plan.hasTacticLibrary);
  }

  function persistUsers(users) {
    write(KEYS.users, users);
    return users;
  }

  function persistAssessments(assessments) {
    write(KEYS.assessments, assessments);
    return assessments;
  }

  function persistCoachSessions(sessions) {
    write(KEYS.coachSessions, sessions);
    return sessions;
  }

  function persistGoals(goals) {
    write(KEYS.goals, goals);
    return goals;
  }

  function persistMessages(messages) {
    write(KEYS.messages, messages);
    return messages;
  }

  function persistDrillAssignments(assignments) {
    write(KEYS.drillAssignments, assignments);
    return assignments;
  }

  function persistProgressEvents(events) {
    write(KEYS.progressEvents, events);
    return events;
  }

  function persistReportUsage(entries) {
    write(KEYS.reportUsage, entries);
    return entries;
  }

  function upsertLocalUser(user) {
    const users = getUsers();
    const idx = users.findIndex((item) => item.id === user.id || item.email === user.email);
    if (idx >= 0) users[idx] = { ...users[idx], ...user };
    else users.push(user);
    persistUsers(users);
    return user;
  }

  function createProfile(fullName, email, fields) {
    const requestedPlan = String(fields.planId || 'free').toLowerCase();
    const initialPlanId = requestedPlan === 'free'
      ? 'free'
      : String(fields.activePlanId || (fields.subscriptionStatus === 'active' ? requestedPlan : 'free')).toLowerCase();
    const plan = getPlanDefinition(initialPlanId);
    return {
      id: uid('user'),
      fullName,
      email: String(email || '').trim().toLowerCase(),
      password: fields.password,
      role: fields.userRole || 'player',
      ageRange: fields.ageRange || '',
      gender: fields.gender || '',
      ustaLevel: fields.ustaLevel || '',
      utrRating: fields.utrRating || '',
      preferredHand: fields.preferredHand || 'right',
      phone: fields.phone || '',
      addressLine1: fields.addressLine1 || '',
      addressLine2: fields.addressLine2 || '',
      city: fields.city || '',
      stateRegion: fields.stateRegion || '',
      postalCode: fields.postalCode || '',
      country: fields.country || '',
      avatarDataUrl: fields.avatarDataUrl || '',
      planId: plan.id,
      trialPlanId: fields.trialPlanId || null,
      trialStartedAt: fields.trialStartedAt || null,
      trialEndsAt: fields.trialEndsAt || null,
      trialHistory: Array.isArray(fields.trialHistory) ? fields.trialHistory : [],
      subscriptionStatus: fields.subscriptionStatus || (plan.id === 'free' ? 'free' : 'active'),
      stripeCustomerId: fields.stripeCustomerId || '',
      stripeSubscriptionId: fields.stripeSubscriptionId || '',
      billingPeriodEnd: fields.billingPeriodEnd || null,
      billingInterval: normalizeBillingInterval(fields.billingInterval || 'monthly'),
      subscriptionCancelAtPeriodEnd: Boolean(fields.subscriptionCancelAtPeriodEnd || false),
      subscriptionCanceledAt: fields.subscriptionCanceledAt || null,
      playerIdentity: fields.playerIdentity || '',
      playingStyle: fields.playingStyle || '',
      practiceFrequency: fields.practiceFrequency || '',
      favoriteShot: fields.favoriteShot || '',
      improvementGoals: Array.isArray(fields.improvementGoals) ? fields.improvementGoals.filter(Boolean) : [],
      onboardingRequiredAt: fields.onboardingRequiredAt || null,
      onboardingCompletedAt: fields.onboardingCompletedAt || null,
      onboardingPlanId: fields.onboardingPlanId || null,
      onboardingSource: fields.onboardingSource || '',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  async function updateProfile(fields = {}) {
    const currentUser = requireUser();
    const existing = getUsers().find((user) => user.id === currentUser.id) || currentUser;
    const nextFullName = String(fields.fullName || existing.fullName || '').trim();
    if (!nextFullName) throw new Error('Full name is required.');
    const updated = {
      ...existing,
      fullName: nextFullName,
      ageRange: fields.ageRange ?? existing.ageRange ?? '',
      gender: fields.gender ?? existing.gender ?? '',
      ustaLevel: fields.ustaLevel ?? existing.ustaLevel ?? '',
      utrRating: fields.utrRating ?? existing.utrRating ?? '',
      preferredHand: fields.preferredHand ?? existing.preferredHand ?? 'right',
      phone: fields.phone ?? existing.phone ?? '',
      addressLine1: fields.addressLine1 ?? existing.addressLine1 ?? '',
      addressLine2: fields.addressLine2 ?? existing.addressLine2 ?? '',
      city: fields.city ?? existing.city ?? '',
      stateRegion: fields.stateRegion ?? existing.stateRegion ?? '',
      postalCode: fields.postalCode ?? existing.postalCode ?? '',
      country: fields.country ?? existing.country ?? '',
      avatarDataUrl: fields.avatarDataUrl ?? existing.avatarDataUrl ?? '',
      updatedAt: nowIso()
    };
    upsertLocalUser(updated);
    await ensureRemoteProfile(updated);
    return updated;
  }

  async function saveOnboardingQuiz(fields = {}, userId) {
    const currentUser = userId
      ? getUsers().find((entry) => entry.id === userId)
      : requireUser();
    if (!currentUser) throw new Error('Please sign in first.');
    const goals = Array.isArray(fields.improvementGoals)
      ? fields.improvementGoals
      : String(fields.improvementGoals || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const updated = {
      ...currentUser,
      playerIdentity: fields.playerIdentity ?? currentUser.playerIdentity ?? '',
      playingStyle: fields.playingStyle ?? currentUser.playingStyle ?? '',
      practiceFrequency: fields.practiceFrequency ?? currentUser.practiceFrequency ?? '',
      favoriteShot: fields.favoriteShot ?? currentUser.favoriteShot ?? '',
      improvementGoals: goals.filter(Boolean).slice(0, 6),
      onboardingRequiredAt: currentUser.onboardingRequiredAt || nowIso(),
      onboardingCompletedAt: nowIso(),
      onboardingPlanId: fields.onboardingPlanId ?? currentUser.onboardingPlanId ?? currentUser.trialPlanId ?? currentUser.planId ?? 'free',
      onboardingSource: fields.onboardingSource ?? currentUser.onboardingSource ?? 'welcome-quiz',
      updatedAt: nowIso()
    };
    upsertLocalUser(updated);
    await ensureRemoteProfile(updated);
    return updated;
  }

  async function ensureRemoteProfile(user) {
    const client = await getSupabaseClient();
    if (!client || !user?.id) return;
    await client.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: user.role || 'player',
      age_range: user.ageRange || null,
      gender: user.gender || null,
      usta_level: user.ustaLevel || null,
      utr_rating: user.utrRating || null,
      preferred_hand: user.preferredHand || 'right',
      avatar_url: user.avatarDataUrl || null,
      subscription_tier: user.planId || 'free',
      subscription_status: user.subscriptionStatus || 'free',
      stripe_customer_id: user.stripeCustomerId || null,
      stripe_subscription_id: user.stripeSubscriptionId || null,
      billing_period_end: user.billingPeriodEnd || null,
      billing_interval: normalizeBillingInterval(user.billingInterval || 'monthly'),
      subscription_cancel_at_period_end: Boolean(user.subscriptionCancelAtPeriodEnd || false),
      subscription_canceled_at: user.subscriptionCanceledAt || null,
      phone: user.phone || null,
      address_line_1: user.addressLine1 || null,
      address_line_2: user.addressLine2 || null,
      city: user.city || null,
      state_region: user.stateRegion || null,
      postal_code: user.postalCode || null,
      country: user.country || null,
      trial_plan_id: user.trialPlanId || null,
      trial_started_at: user.trialStartedAt || null,
      trial_ends_at: user.trialEndsAt || null,
      trial_history: getTrialHistory(user)
    }, { onConflict: 'id' });
  }

  async function pullRemoteState(userId) {
    const client = await getSupabaseClient();
    if (!client || !userId) return;

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      const users = getUsers();
      const idx = users.findIndex((entry) => entry.id === userId || entry.email === profile.email);
      if (idx >= 0) {
        users[idx] = {
          ...users[idx],
          email: profile.email || users[idx].email,
          fullName: profile.full_name || users[idx].fullName,
          role: profile.role || users[idx].role || 'player',
          ageRange: profile.age_range || users[idx].ageRange || '',
          gender: profile.gender || users[idx].gender || '',
          ustaLevel: profile.usta_level || users[idx].ustaLevel || '',
          utrRating: profile.utr_rating || users[idx].utrRating || '',
          preferredHand: profile.preferred_hand || users[idx].preferredHand || 'right',
          avatarDataUrl: users[idx].avatarDataUrl || profile.avatar_url || '',
          planId: profile.subscription_tier || users[idx].planId || 'free',
          trialPlanId: profile.trial_plan_id || users[idx].trialPlanId || null,
          trialStartedAt: profile.trial_started_at || users[idx].trialStartedAt || null,
          trialEndsAt: profile.trial_ends_at || users[idx].trialEndsAt || null,
          trialHistory: Array.isArray(profile.trial_history) ? profile.trial_history : getTrialHistory(users[idx]),
          subscriptionStatus: profile.subscription_status || users[idx].subscriptionStatus || 'free',
          stripeCustomerId: profile.stripe_customer_id || users[idx].stripeCustomerId || '',
          stripeSubscriptionId: profile.stripe_subscription_id || users[idx].stripeSubscriptionId || '',
          billingPeriodEnd: profile.billing_period_end || users[idx].billingPeriodEnd || null,
          billingInterval: normalizeBillingInterval(profile.billing_interval || users[idx].billingInterval || 'monthly'),
          subscriptionCancelAtPeriodEnd: Boolean(profile.subscription_cancel_at_period_end ?? users[idx].subscriptionCancelAtPeriodEnd ?? false),
          subscriptionCanceledAt: profile.subscription_canceled_at || users[idx].subscriptionCanceledAt || null,
          phone: profile.phone || users[idx].phone || '',
          addressLine1: profile.address_line_1 || users[idx].addressLine1 || '',
          addressLine2: profile.address_line_2 || users[idx].addressLine2 || '',
          city: profile.city || users[idx].city || '',
          stateRegion: profile.state_region || users[idx].stateRegion || '',
          postalCode: profile.postal_code || users[idx].postalCode || '',
          country: profile.country || users[idx].country || '',
          createdAt: profile.created_at || users[idx].createdAt || nowIso()
        };
        persistUsers(users);
      }
    }

    const { data: assessments, error: assessmentError } = await client
      .from('assessments')
      .select('*')
      .eq('user_id', userId)
      .order('analyzed_at', { ascending: false })
      .limit(120);

    if (!assessmentError && Array.isArray(assessments)) {
      const local = getAssessments();
      const map = new Map(local.map((item) => [item.externalId || item.id, item]));
      assessments.forEach((row) => {
        const externalId = row.external_id || row.id;
        map.set(externalId, {
          ...map.get(externalId),
          id: externalId,
          externalId,
          remoteId: row.id,
          userId: row.user_id,
          analyzedAt: row.analyzed_at || row.created_at || nowIso(),
          overallScore: safeNumber(row.overall_score),
          grade: row.grade || 'N/A',
          percentile: safeNumber(row.percentile),
          shotType: slugShot(row.shot_type),
          framesAnalyzed: safeNumber(row.frames_analyzed),
          avgConfidence: safeNumber(row.avg_confidence),
          avgLandmarks: safeNumber(row.avg_landmarks),
          avgAngles: row.avg_angles || {},
          benchmarkSummary: row.benchmark_summary || '',
          metricComparisons: row.metric_comparisons || [],
          tailoredDrills: row.tailored_drills || [],
          sessionMode: row.session_mode || 'stroke-tune-up',
          sessionGoal: row.session_goal || '',
          setupScore: safeNumber(row.setup_score, 100),
          videoPath: row.video_path || '',
          notes: row.notes || '',
          syncedAt: nowIso()
        });
      });
      persistAssessments(Array.from(map.values()).sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt)));
    }

    const { data: sessions, error: sessionError } = await client
      .from('coach_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('when_at', { ascending: true })
      .limit(120);

    if (!sessionError && Array.isArray(sessions)) {
      const local = getCoachSessions();
      const map = new Map(local.map((item) => [item.externalId || item.id, item]));
      sessions.forEach((row) => {
        const externalId = row.external_id || row.id;
        map.set(externalId, {
          ...map.get(externalId),
          id: externalId,
          externalId,
          remoteId: row.id,
          userId: row.user_id,
          coachId: row.coach_id,
          coachName: row.coach_name,
          specialty: row.specialty,
          when: row.when_at,
          format: row.format || 'Virtual',
          focus: row.focus || 'Technique review',
          status: row.status || 'scheduled',
          bookedAt: row.booked_at || nowIso(),
          syncedAt: nowIso()
        });
      });
      persistCoachSessions(Array.from(map.values()).sort((a, b) => new Date(a.when) - new Date(b.when)));
    }

    const { data: goals, error: goalError } = await client
      .from('player_goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(120);

    if (!goalError && Array.isArray(goals)) {
      const local = getGoals();
      const map = new Map(local.map((item) => [item.externalId || item.id, item]));
      goals.forEach((row) => {
        const externalId = row.external_id || row.id;
        map.set(externalId, {
          ...map.get(externalId),
          id: externalId,
          externalId,
          remoteId: row.id,
          userId: row.user_id,
          title: row.title || 'Goal',
          metric: row.metric || 'score',
          baseline: safeNumber(row.baseline_value),
          target: safeNumber(row.target_value),
          current: safeNumber(row.current_value),
          comparator: row.comparator || 'at-least',
          status: row.status || 'active',
          dueDate: row.due_date || null,
          createdAt: row.created_at || nowIso(),
          updatedAt: row.updated_at || nowIso(),
          syncedAt: nowIso()
        });
      });
      persistGoals(Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }

    const { data: drillAssignments, error: drillError } = await client
      .from('drill_assignments')
      .select('*')
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false })
      .limit(240);

    if (!drillError && Array.isArray(drillAssignments)) {
      const local = getDrillAssignments();
      const map = new Map(local.map((item) => [item.externalId || item.id, item]));
      drillAssignments.forEach((row) => {
        const externalId = row.external_id || row.id;
        map.set(externalId, {
          ...map.get(externalId),
          id: externalId,
          externalId,
          remoteId: row.id,
          userId: row.user_id,
          assessmentId: row.assessment_id || null,
          focus: row.focus || 'Technique',
          title: row.title || 'Drill',
          prescription: row.prescription || '',
          cue: row.cue || '',
          videoUrl: row.video_url || '',
          channel: row.channel || '',
          status: row.status || 'assigned',
          assignedAt: row.assigned_at || nowIso(),
          completedAt: row.completed_at || null,
          dueDate: row.due_date || null,
          syncedAt: nowIso()
        });
      });
      persistDrillAssignments(Array.from(map.values()).sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt)));
    }

    const { data: events, error: eventError } = await client
      .from('progress_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300);

    if (!eventError && Array.isArray(events)) {
      const local = getProgressEvents();
      const map = new Map(local.map((item) => [item.externalId || item.id, item]));
      events.forEach((row) => {
        const externalId = row.external_id || row.id;
        map.set(externalId, {
          ...map.get(externalId),
          id: externalId,
          externalId,
          remoteId: row.id,
          userId: row.user_id,
          eventType: row.event_type || 'note',
          title: row.title || '',
          detail: row.detail || '',
          payload: row.payload || {},
          createdAt: row.created_at || nowIso(),
          syncedAt: nowIso()
        });
      });
      persistProgressEvents(Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }

    const { data: messages, error: messageError } = await client
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    if (!messageError && Array.isArray(messages)) {
      const local = getMessages();
      const map = new Map(local.map((item) => [item.externalId || item.id, item]));
      messages.forEach((row) => {
        const externalId = row.external_id || row.id;
        map.set(externalId, {
          ...map.get(externalId),
          id: externalId,
          externalId,
          remoteId: row.id,
          userId: row.user_id || row.from_user_id,
          fromUserId: row.from_user_id || row.user_id,
          toUserId: row.to_user_id || null,
          fromName: row.from_name || map.get(externalId)?.fromName || 'SmartSwing',
          toName: row.to_name || map.get(externalId)?.toName || 'Inbox',
          subject: row.subject || 'Message',
          body: row.body || '',
          channel: row.channel || 'dashboard',
          createdAt: row.created_at || nowIso(),
          syncedAt: nowIso()
        });
      });
      persistMessages(Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }
  }

  async function signUp(fields) {
    const fullName = String(fields.fullName || '').trim();
    const email = String(fields.email || '').trim().toLowerCase();
    const password = String(fields.password || '');
    if (!fullName || !email || !password) {
      throw new Error('Full name, email, and password are required.');
    }

    if (isSupabaseConfigured()) {
      const client = await getSupabaseClient();
      if (client) {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role: fields.userRole || 'player' } }
        });
        if (error) throw new Error(error.message);
        if (!data.user) throw new Error('Signup created but no active user returned.');

        const local = createProfile(fullName, email, { ...fields, password: '' });
        local.id = data.user.id;
        local.avatarDataUrl = fields.avatarDataUrl || data.user.user_metadata?.avatar_url || '';
        // Free trials removed — new accounts start with 2 lifetime free assessments on the free plan
        upsertLocalUser(local);
        if (!data.session) {
          return { ...local, requiresEmailConfirmation: true };
        }
        write(KEYS.session, { userId: local.id, loggedInAt: nowIso(), provider: 'supabase' });
        localStorage.removeItem(KEYS.autoSessionOptOut);
        await ensureRemoteProfile(local);
        await pullRemoteState(local.id);
        // Welcome email — fire-and-forget, non-blocking
        fireEmailEvent('welcome', { firstName: (local.fullName || '').split(' ')[0] || 'there', email: local.email });
        return { ...local, requiresEmailConfirmation: false };
      }
    }

    if (!allowLocalDataMode()) {
      throw new Error('Live account creation is temporarily unavailable until Supabase authentication is configured.');
    }

    const users = getUsers();
    if (users.some((user) => user.email === email)) {
      throw new Error('An account with this email already exists.');
    }
    const user = createProfile(fullName, email, { ...fields, password });
    // Free trials removed — new accounts start with 2 lifetime free assessments on the free plan
    persistUsers([...users, user]);
    write(KEYS.session, { userId: user.id, loggedInAt: nowIso() });
    localStorage.removeItem(KEYS.autoSessionOptOut);
    // Welcome email — fire-and-forget, non-blocking
    fireEmailEvent('welcome', { firstName: (user.fullName || '').split(' ')[0] || 'there', email: user.email });
    return user;
  }

  async function signIn(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    if (isSupabaseConfigured()) {
      const client = await getSupabaseClient();
      if (client) {
        const { data, error } = await client.auth.signInWithPassword({
          email: normalizedEmail,
          password: normalizedPassword
        });
        if (error) throw new Error(error.message || 'Invalid email or password.');
        if (!data.user) throw new Error('No authenticated user returned.');

        const { data: profile } = await client.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
        const local = buildLocalUserFromSupabase(data.user, profile);
        upsertLocalUser(local);
        write(KEYS.session, { userId: local.id, loggedInAt: nowIso(), provider: 'supabase' });
        localStorage.removeItem(KEYS.autoSessionOptOut);
        await ensureRemoteProfile(local);
        await pullRemoteState(local.id);
        return local;
      }
    }

    if (!allowLocalDataMode()) {
      throw new Error('Live sign-in is temporarily unavailable until Supabase authentication is configured.');
    }

    const user = getUsers().find((item) => item.email === normalizedEmail && item.password === normalizedPassword);
    if (!user) throw new Error('Invalid email or password.');
    write(KEYS.session, { userId: user.id, loggedInAt: nowIso() });
    localStorage.removeItem(KEYS.autoSessionOptOut);
    return user;
  }

  async function signInWithOAuthProvider(provider) {
    if (!isSupabaseConfigured()) {
      throw new Error(`${String(provider || 'OAuth')} OAuth requires Supabase configuration.`);
    }
    const availability = await getOAuthProviderAvailability(provider);
    if (!availability.available) {
      throw new Error(availability.reason || `${String(provider || 'OAuth')} sign-in is unavailable right now.`);
    }
    const client = await getSupabaseClient();
    if (!client) throw new Error('Supabase client unavailable.');
    const redirectTo = getOAuthCallbackUrl();
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });
    if (error) throw new Error(error.message || `${provider} sign-in failed.`);
  }

  async function signInWithGoogle() {
    return signInWithOAuthProvider('google');
  }

  async function signInWithFacebook() {
    return signInWithOAuthProvider('facebook');
  }

  async function signInWithApple() {
    return signInWithOAuthProvider('apple');
  }

  function signOut() {
    localStorage.removeItem(KEYS.session);
    localStorage.setItem(KEYS.autoSessionOptOut, '1');
    getSupabaseClient().then((client) => client?.auth.signOut()).catch(() => {});
  }

  function requireUser() {
    const user = getCurrentUser();
    if (!user) throw new Error('Please sign in first.');
    return user;
  }

  function getAssignedCoachIdsForPlayer(userId) {
    if (!userId) return [];
    const ids = new Set();
    getCoachSessions().forEach((session) => {
      if (session.userId === userId && session.coachId) ids.add(session.coachId);
    });
    return Array.from(ids);
  }

  function getAssignedAthleteIdsForCoach(coachId) {
    if (!coachId) return [];
    const ids = new Set();
    getCoachSessions().forEach((session) => {
      if (session.coachId === coachId && session.userId) ids.add(session.userId);
    });
    getMessages().forEach((message) => {
      if (message.fromUserId === coachId && message.toUserId) ids.add(message.toUserId);
      if (message.toUserId === coachId && message.fromUserId) ids.add(message.fromUserId);
    });
    return Array.from(ids);
  }

  function canAccessUserRecord(targetUserId, access = getAccessContext()) {
    if (!access.user || !targetUserId) return false;
    if (access.canAccessManagerAnalytics) return true;
    if (access.user.id === targetUserId) return true;
    if (access.role === 'coach') {
      return getAssignedAthleteIdsForCoach(access.user.id).includes(targetUserId);
    }
    if (access.role === 'player') {
      return getAssignedCoachIdsForPlayer(access.user.id).includes(targetUserId);
    }
    return false;
  }

  function getVisibleUsersForCurrentUser(userId) {
    const access = getAccessContext(userId);
    if (!access.user) return [];
    if (access.canAccessManagerAnalytics) return getUsers();
    if (access.role === 'coach') {
      const athleteIds = new Set(getAssignedAthleteIdsForCoach(access.user.id));
      return getUsers().filter((user) => athleteIds.has(user.id));
    }
    return getUsers().filter((user) => user.id === access.user.id);
  }

  function getVisibleMessagesForCurrentUser(userId) {
    const access = getAccessContext(userId);
    if (!access.user) return [];
    if (access.canAccessManagerAnalytics) {
      return getMessages().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const participantIds = new Set([access.user.id]);
    getAssignedAthleteIdsForCoach(access.user.id).forEach((id) => participantIds.add(id));
    getAssignedCoachIdsForPlayer(access.user.id).forEach((id) => participantIds.add(id));
    DEFAULT_COACHES.forEach((coach) => participantIds.add(coach.id));

    return getMessages()
      .filter((message) => {
        const fromId = message.fromUserId || message.userId;
        const toId = message.toUserId || null;
        return participantIds.has(fromId) || participantIds.has(toId) || message.userId === access.user.id;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getMessagingTargets(userId) {
    const access = getAccessContext(userId);
    if (!access.user) return [];
    if (access.canAccessManagerAnalytics) {
      return getUsers()
        .filter((user) => user.id !== access.user.id)
        .map((user) => ({ id: user.id, label: `${user.fullName} | ${user.role}`, kind: 'user' }));
    }
    if (access.role === 'coach') {
      return getVisibleUsersForCurrentUser(access.user.id)
        .map((user) => ({ id: user.id, label: `${user.fullName} | athlete`, kind: 'user' }));
    }

    const targets = [];
    if (access.canBookCoach) {
      DEFAULT_COACHES.forEach((coach) => {
        targets.push({ id: coach.id, label: `${coach.name} | ${coach.specialty}`, kind: 'coach' });
      });
    }
    const assignedCoachIds = new Set(getAssignedCoachIdsForPlayer(access.user.id));
    getUsers()
      .filter((user) => assignedCoachIds.has(user.id) && user.id !== access.user.id)
      .forEach((coach) => targets.push({ id: coach.id, label: `${coach.fullName} | coach`, kind: 'user' }));
    if (!targets.length) {
      targets.push({ id: '', label: 'SmartSwing Support', kind: 'support' });
    }
    return targets;
  }

  function getAccessContext(userId) {
    const user = userId ? getUsers().find((entry) => entry.id === userId) : getCurrentUser();
    const plan = getCurrentPlan(user?.id);
    const usage = canGenerateReport(user?.id);
    const role = user?.role || 'guest';
    const isInternalManager = isManagerRole(role) || String(user?.email || '').toLowerCase().endsWith('@smartswing.ai');
    return {
      user,
      role,
      plan,
      usage,
      isTrial: !!plan.isTrial,
      trialEndsAt: plan.trialEndsAt,
      canAccessPlayerDashboard: !!user,
      canAccessCoachDashboard: role === 'coach' || isInternalManager,
      canAccessManagerAnalytics: isInternalManager,
      canMessage: !!user && (role === 'coach' || isInternalManager || !!plan.canConnectCoaches),
      canExport: isInternalManager || role === 'coach' || !!plan.canPrintReport,
      canBookCoach: !!plan.canConnectCoaches,
      canManageBilling: !!user && (!!user.stripeCustomerId || !!user.stripeSubscriptionId || plan.id !== 'free')
    };
  }

  function getVisibleAssessmentsForCurrentUser(targetUserId) {
    const access = getAccessContext();
    if (!access.user) return [];
    if (targetUserId && !canAccessUserRecord(targetUserId, access)) {
      return [];
    }
    if (access.canAccessManagerAnalytics) {
      return targetUserId ? getUserAssessments(targetUserId) : getAssessments().slice().sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
    }
    if (access.role === 'coach') {
      const athleteIds = new Set(getAssignedAthleteIdsForCoach(access.user.id));
      const base = getAssessments()
        .filter((assessment) => athleteIds.has(assessment.userId))
        .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
      return targetUserId ? base.filter((assessment) => assessment.userId === targetUserId) : base;
    }
    return getUserAssessments(access.user.id);
  }

  function getVisibleCoachSessionsForCurrentUser(targetUserId) {
    const access = getAccessContext();
    if (!access.user) return [];
    if (targetUserId && !canAccessUserRecord(targetUserId, access) && targetUserId !== access.user.id) {
      return [];
    }
    if (access.canAccessManagerAnalytics) {
      const sessions = getCoachSessions().slice().sort((a, b) => new Date(a.when) - new Date(b.when));
      return targetUserId ? sessions.filter((session) => session.userId === targetUserId) : sessions;
    }
    if (access.role === 'coach') {
      const sessions = getCoachSessions()
        .filter((session) => session.coachId === access.user.id)
        .sort((a, b) => new Date(a.when) - new Date(b.when));
      return targetUserId ? sessions.filter((session) => session.userId === targetUserId) : sessions;
    }
    return getUserCoachSessions(access.user.id);
  }

  function compareAgainstBenchmark(avgAngles, benchmarks) {
    return Object.entries(avgAngles || {}).map(([name, value]) => {
      const benchmark = benchmarks?.[name];
      const current = safeNumber(value, null);
      if (!benchmark || current == null) return null;
      const delta = Math.round(current - benchmark.optimal);
      const range = Math.max(1, safeNumber(benchmark.max) - safeNumber(benchmark.min));
      const softWindow = Math.max(5, Math.round(range * 0.2));
      const goodWindow = Math.max(9, Math.round(range * 0.42));
      return {
        metric: name,
        current,
        target: benchmark.optimal,
        min: benchmark.min,
        max: benchmark.max,
        delta,
        deviation: Math.abs(delta),
        score: Math.max(40, Math.round(100 - ((Math.abs(delta) / range) * 100))),
        status: Math.abs(delta) <= softWindow ? 'excellent' : Math.abs(delta) <= goodWindow ? 'good' : Math.abs(delta) <= Math.round(range * 0.72) ? 'workable' : 'needs-work'
      };
    }).filter(Boolean);
  }

  function getDrillLibrary(filters = {}) {
    const shotType = filters.shotType ? normalizeShot(filters.shotType) : null;
    const level = filters.level ? normalizeLevel(filters.level) : null;
    const metric = String(filters.metric || '').toLowerCase();

    return DRILL_LIBRARY.filter((item) => {
      if (shotType && !supportsShot(item.strokeType, shotType)) return false;
      if (level && !isLevelAppropriate(item.skillLevel, level)) return false;
      if (metric && !(item.metricTags || []).includes(metric)) return false;
      return true;
    }).map(enrichDrillResource);
  }

  function getTacticLibrary(filters = {}) {
    const level = filters.level ? normalizeLevel(filters.level) : null;
    const situation = String(filters.situation || '').toLowerCase();

    return TACTIC_LIBRARY.filter((item) => {
      if (level && !isLevelAppropriate(item.skillLevel, level)) return false;
      if (situation && !String(item.situation || '').toLowerCase().includes(situation)) return false;
      return true;
    }).map(enrichTacticResource);
  }

  function metricCue(metric, delta) {
    const up = delta > 0;
    if (metric === 'shoulder') return up ? 'Reduce over-rotation and stabilize contact alignment.' : 'Load more unit turn before acceleration.';
    if (metric === 'elbow') return up ? 'Avoid over-extension before contact.' : 'Extend through contact for cleaner transfer.';
    if (metric === 'hip') return up ? 'Control hip opening to avoid leaking power early.' : 'Drive hips earlier from the ground up.';
    if (metric === 'knee') return up ? 'Add loading depth before drive.' : 'Push up and forward through contact.';
    if (metric === 'trunk') return up ? 'Stabilize trunk tilt and sequence rotation.' : 'Increase torso rotation through contact.';
    if (metric === 'wrist') return up ? 'Quiet late wrist action for control.' : 'Create cleaner lag and release timing.';
    if (metric === 'stanceWidth') return up ? 'Tighten the base slightly so rotation does not stall.' : 'Create a slightly wider athletic base before the strike.';
    if (metric === 'contactHeight') return up ? 'Meet the ball a little lower and farther in front.' : 'Raise the strike window with earlier preparation and leg timing.';
    if (metric === 'reach') return up ? 'Avoid over-reaching. Let spacing come from footwork.' : 'Create more spacing before contact so the arm can extend naturally.';
    if (metric === 'balance') return up ? 'Stay centered over your base through contact and recovery.' : 'Hold the center line and avoid drifting early.';
    if (metric === 'alignmentGap') return up ? 'Keep shoulders and hips working in the same posture window.' : 'Maintain cleaner upper-lower body connection.';
    if (metric === 'footworkLoad') return up ? 'Keep the feet active, then quiet the finish.' : 'Add a stronger split-step and first move into the ball.';
    return up ? 'Tighten movement sequence.' : 'Increase movement range into target window.';
  }

  function buildTailoredDrills(assessment) {
    return matchDrillsToWeaknesses(assessment);
  }

  function getTacticRecommendations(assessment) {
    return matchTacticsToProfile(assessment);
  }

  function evaluateGoalStatus(goal) {
    const current = safeNumber(goal.current);
    const target = safeNumber(goal.target);
    const comparator = goal.comparator || 'at-least';
    const complete = comparator === 'at-most' ? current <= target : current >= target;
    return complete ? 'completed' : 'active';
  }

  function createProgressEvent(payload) {
    const user = requireUser();
    const event = {
      id: uid('progress_event'),
      externalId: uid('progress_ext'),
      userId: user.id,
      eventType: payload.eventType || 'note',
      title: payload.title || 'Progress update',
      detail: payload.detail || '',
      payload: payload.payload || {},
      createdAt: nowIso(),
      syncedAt: null
    };
    persistProgressEvents([event, ...getProgressEvents()]);
    void syncProgressEventToCloud(event);
    return event;
  }

  function getUserGoals(userId) {
    const id = userId || requireUser().id;
    return getGoals().filter((goal) => goal.userId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function setPlayerGoal(payload) {
    const user = requireUser();
    const title = String(payload.title || '').trim();
    if (!title) throw new Error('Goal title is required.');
    const metric = String(payload.metric || 'score');
    const baseline = safeNumber(payload.baseline);
    const target = safeNumber(payload.target, baseline);
    const current = safeNumber(payload.current, baseline);
    const goal = {
      id: uid('goal'),
      externalId: uid('goal_ext'),
      userId: user.id,
      title,
      metric,
      baseline,
      target,
      current,
      comparator: payload.comparator === 'at-most' ? 'at-most' : 'at-least',
      status: 'active',
      dueDate: payload.dueDate || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      syncedAt: null
    };
    goal.status = evaluateGoalStatus(goal);
    persistGoals([goal, ...getGoals()]);
    void syncGoalToCloud(goal);
    createProgressEvent({
      eventType: 'goal_created',
      title: `Goal created: ${goal.title}`,
      detail: `${goal.metric} target ${goal.comparator === 'at-most' ? '<=' : '>='} ${goal.target}`
    });
    return goal;
  }

  function updateGoalProgress(goalId, currentValue, meta) {
    const goals = getGoals();
    const idx = goals.findIndex((goal) => goal.id === goalId || goal.externalId === goalId);
    if (idx < 0) throw new Error('Goal not found.');
    goals[idx] = {
      ...goals[idx],
      current: safeNumber(currentValue),
      status: evaluateGoalStatus({ ...goals[idx], current: safeNumber(currentValue) }),
      updatedAt: nowIso(),
      syncedAt: null
    };
    persistGoals(goals);
    void syncGoalToCloud(goals[idx]);
    createProgressEvent({
      eventType: goals[idx].status === 'completed' ? 'goal_completed' : 'goal_progress',
      title: goals[idx].status === 'completed' ? `Goal completed: ${goals[idx].title}` : `Goal updated: ${goals[idx].title}`,
      detail: meta?.detail || `Current ${goals[idx].metric}: ${goals[idx].current}`,
      payload: { goalId: goals[idx].id }
    });
    return goals[idx];
  }

  function getUserDrillAssignments(userId) {
    const id = userId || requireUser().id;
    return getDrillAssignments()
      .filter((assignment) => assignment.userId === id)
      .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  }

  function setDrillStatus(drillId, status) {
    const allowed = new Set(['assigned', 'in_progress', 'completed']);
    if (!allowed.has(status)) throw new Error('Invalid drill status.');
    const drills = getDrillAssignments();
    const idx = drills.findIndex((drill) => drill.id === drillId || drill.externalId === drillId);
    if (idx < 0) throw new Error('Drill not found.');
    drills[idx] = {
      ...drills[idx],
      status,
      completedAt: status === 'completed' ? nowIso() : null,
      syncedAt: null
    };
    persistDrillAssignments(drills);
    void syncDrillAssignmentToCloud(drills[idx]);
    createProgressEvent({
      eventType: 'drill_status',
      title: `Drill ${status.replace('_', ' ')}: ${drills[idx].title}`,
      detail: drills[idx].focus,
      payload: { drillId: drills[idx].id, status }
    });
    return drills[idx];
  }

  function buildDrillAssignmentsFromAssessment(assessment) {
    const drills = assessment.tailoredDrills || [];
    if (!drills.length) return [];
    const assignedAt = nowIso();
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const generated = drills.map((drill) => ({
      id: uid('drill'),
      externalId: uid('drill_ext'),
      userId: assessment.userId,
      assessmentId: assessment.remoteId || null,
      assessmentExternalId: assessment.externalId || assessment.id,
      focus: drill.focus || `${assessment.shotType} mechanics`,
      title: drill.title || 'Tailored drill',
      prescription: drill.prescription || '',
      cue: drill.cue || '',
      videoUrl: drill.videoUrl || '',
      channel: drill.channel || '',
      status: 'assigned',
      assignedAt,
      completedAt: null,
      dueDate,
      syncedAt: null
    }));
    persistDrillAssignments([...generated, ...getDrillAssignments()]);
    generated.forEach((drill) => {
      void syncDrillAssignmentToCloud(drill);
    });
    return generated;
  }

  function updateGoalsFromAssessment(assessment) {
    const goals = getUserGoals(assessment.userId).filter((goal) => goal.status !== 'completed');
    if (!goals.length) return;
    const updates = [];
    const metricLookup = {
      score: safeNumber(assessment.overallScore),
      confidence: safeNumber(assessment.avgConfidence),
      setup: safeNumber(assessment.setupScore, 100)
    };
    goals.forEach((goal) => {
      let current = metricLookup[goal.metric];
      if (current == null && goal.metric.startsWith('angle:')) {
        const key = goal.metric.replace('angle:', '');
        current = safeNumber(assessment.avgAngles?.[key], null);
      }
      if (current == null || Number.isNaN(current)) return;
      updates.push(updateGoalProgress(goal.id, current, {
        detail: `Updated from ${assessment.shotType} assessment`
      }));
    });
    return updates;
  }

  function getProgressTimeline(userId, limit = 20) {
    const id = userId || requireUser().id;
    return getProgressEvents()
      .filter((event) => event.userId === id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  function getRetentionSnapshot(userId) {
    const id = userId || requireUser().id;
    const assessments = getUserAssessments(id);
    const drills = getUserDrillAssignments(id);
    const goals = getUserGoals(id);
    const sessions = getUserCoachSessions(id);
    const completedDrills = drills.filter((drill) => drill.status === 'completed').length;
    const activeGoals = goals.filter((goal) => goal.status === 'active').length;
    const completedGoals = goals.filter((goal) => goal.status === 'completed').length;
    const lastAssessment = assessments[0]?.analyzedAt || null;
    const daysSinceLastAssessment = lastAssessment
      ? Math.floor((Date.now() - new Date(lastAssessment).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const nextSession = sessions.find((session) => new Date(session.when).getTime() > Date.now()) || null;
    const drillCompletionRate = drills.length ? Math.round((completedDrills / drills.length) * 100) : 0;

    return {
      totalDrills: drills.length,
      completedDrills,
      drillCompletionRate,
      activeGoals,
      completedGoals,
      daysSinceLastAssessment,
      nextSession,
      accountabilityState: daysSinceLastAssessment != null && daysSinceLastAssessment > 10 ? 'at-risk' : 'on-track'
    };
  }

  async function syncProgressEventToCloud(event) {
    const client = await getSupabaseClient();
    if (!client || !event?.userId) return;
    const { error } = await client.from('progress_events').upsert({
      external_id: event.externalId,
      user_id: event.userId,
      event_type: event.eventType,
      title: event.title,
      detail: event.detail,
      payload: event.payload || {},
      created_at: event.createdAt
    }, { onConflict: 'external_id' });
    if (error) return;
    const events = getProgressEvents();
    const idx = events.findIndex((item) => item.externalId === event.externalId);
    if (idx >= 0) {
      events[idx] = { ...events[idx], syncedAt: nowIso() };
      persistProgressEvents(events);
    }
  }

  async function syncGoalToCloud(goal) {
    const client = await getSupabaseClient();
    if (!client || !goal?.userId) return;
    const { data, error } = await client.from('player_goals').upsert({
      external_id: goal.externalId,
      user_id: goal.userId,
      title: goal.title,
      metric: goal.metric,
      baseline_value: goal.baseline,
      target_value: goal.target,
      current_value: goal.current,
      comparator: goal.comparator,
      status: goal.status,
      due_date: goal.dueDate,
      updated_at: nowIso()
    }, { onConflict: 'external_id' }).select('id, external_id').single();
    if (error) return;
    const goals = getGoals();
    const idx = goals.findIndex((item) => item.externalId === goal.externalId);
    if (idx >= 0) {
      goals[idx] = { ...goals[idx], remoteId: data.id, syncedAt: nowIso() };
      persistGoals(goals);
    }
  }

  async function syncDrillAssignmentToCloud(drill) {
    const client = await getSupabaseClient();
    if (!client || !drill?.userId) return;
    let assessmentId = drill.assessmentId || null;
    if (!assessmentId && drill.assessmentExternalId) {
      const linked = getAssessments().find((item) => item.externalId === drill.assessmentExternalId || item.id === drill.assessmentExternalId);
      assessmentId = linked?.remoteId || null;
    }
    const { data, error } = await client.from('drill_assignments').upsert({
      external_id: drill.externalId,
      user_id: drill.userId,
      assessment_id: assessmentId,
      focus: drill.focus,
      title: drill.title,
      prescription: drill.prescription,
      cue: drill.cue,
      status: drill.status,
      assigned_at: drill.assignedAt,
      completed_at: drill.completedAt,
      due_date: drill.dueDate || null
    }, { onConflict: 'external_id' }).select('id, external_id').single();
    if (error) return;
    const drills = getDrillAssignments();
    const idx = drills.findIndex((item) => item.externalId === drill.externalId);
    if (idx >= 0) {
      drills[idx] = { ...drills[idx], remoteId: data.id, syncedAt: nowIso() };
      persistDrillAssignments(drills);
    }
  }

  async function syncAssessmentToCloud(assessment) {
    const client = await getSupabaseClient();
    if (!client || !assessment?.userId) return;
    const { data, error } = await client.from('assessments').upsert({
      external_id: assessment.externalId,
      user_id: assessment.userId,
      shot_type: assessment.shotType,
      overall_score: assessment.overallScore,
      grade: assessment.grade,
      percentile: assessment.percentile,
      frames_analyzed: assessment.framesAnalyzed,
      avg_confidence: assessment.avgConfidence,
      avg_landmarks: assessment.avgLandmarks,
      avg_angles: assessment.avgAngles || {},
      metric_comparisons: assessment.metricComparisons || [],
      benchmark_summary: assessment.benchmarkSummary || null,
      tailored_drills: assessment.tailoredDrills || [],
      session_mode: assessment.sessionMode || null,
      session_goal: assessment.sessionGoal || null,
      setup_score: assessment.setupScore || null,
      video_path: assessment.videoPath || null,
      notes: assessment.notes || null,
      analyzed_at: assessment.analyzedAt
    }, { onConflict: 'external_id' }).select('id, external_id').single();
    if (error) return;
    const all = getAssessments();
    const idx = all.findIndex((item) => item.externalId === assessment.externalId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], remoteId: data.id, syncedAt: nowIso() };
      persistAssessments(all);
    }
  }

  async function syncCoachSessionToCloud(session) {
    const client = await getSupabaseClient();
    if (!client || !session?.userId) return;
    const { data, error } = await client.from('coach_sessions').upsert({
      external_id: session.externalId,
      user_id: session.userId,
      coach_id: session.coachId,
      coach_name: session.coachName,
      specialty: session.specialty,
      when_at: session.when,
      format: session.format,
      focus: session.focus,
      status: session.status,
      booked_at: session.bookedAt
    }, { onConflict: 'external_id' }).select('id, external_id').single();
    if (error) return;
    const all = getCoachSessions();
    const idx = all.findIndex((item) => item.externalId === session.externalId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], remoteId: data.id, syncedAt: nowIso() };
      persistCoachSessions(all);
    }
  }

  async function syncMessageToCloud(message) {
    const client = await getSupabaseClient();
    if (!client || !message?.fromUserId) return;
    const { data, error } = await client.from('inbox_messages').upsert({
      external_id: message.externalId,
      user_id: message.userId || message.fromUserId,
      from_user_id: message.fromUserId,
      to_user_id: message.toUserId || null,
      from_name: message.fromName || null,
      to_name: message.toName || null,
      subject: message.subject || 'Message',
      body: message.body || '',
      channel: message.channel || 'dashboard',
      created_at: message.createdAt || nowIso()
    }, { onConflict: 'external_id' }).select('id, external_id').single();
    if (error) return;
    const messages = getMessages();
    const idx = messages.findIndex((item) => item.externalId === message.externalId);
    if (idx >= 0) {
      messages[idx] = { ...messages[idx], remoteId: data.id, syncedAt: nowIso() };
      persistMessages(messages);
    }
  }

  function saveAssessment(payload) {
    const user = requireUser();
    const previousSameShot = getAssessments().filter((item) => item.userId === user.id && item.shotType === slugShot(payload.shotType));
    const previousBest = previousSameShot.length ? Math.max(...previousSameShot.map((item) => safeNumber(item.overallScore))) : 0;
    const assessment = {
      id: uid('assessment'),
      externalId: uid('assessment_ext'),
      userId: user.id,
      analyzedAt: nowIso(),
      overallScore: safeNumber(payload.overallScore),
      grade: payload.grade || 'N/A',
      percentile: safeNumber(payload.percentile),
      shotType: slugShot(payload.shotType),
      framesAnalyzed: safeNumber(payload.framesAnalyzed),
      focusFramesAnalyzed: safeNumber(payload.focusFramesAnalyzed),
      avgConfidence: safeNumber(payload.avgConfidence),
      avgLandmarks: safeNumber(payload.avgLandmarks),
      avgAngles: payload.avgAngles || {},
      avgDerivedMetrics: payload.avgDerivedMetrics || {},
      benchmarkSummary: payload.benchmarkSummary || '',
      metricComparisons: payload.metricComparisons || [],
      tailoredDrills: payload.tailoredDrills || [],
      tailoredTactics: payload.tailoredTactics || [],
      componentScores: payload.componentScores || {},
      performanceKpis: payload.performanceKpis || {},
      progressContext: payload.progressContext || {},
      milestone: payload.milestone || null,
      achievements: payload.achievements || [],
      scoringMeta: payload.scoringMeta || {},
      sessionMode: payload.sessionMode || 'stroke-tune-up',
      sessionGoal: payload.sessionGoal || '',
      setupScore: safeNumber(payload.setupScore, 100),
      videoPath: payload.videoPath || '',
      notes: payload.notes || '',
      playerProfile: payload.playerProfile || {},
      syncedAt: null
    };
    persistAssessments([assessment, ...getAssessments()]);
    write(KEYS.lastSession, assessment);
    buildDrillAssignmentsFromAssessment(assessment);
    createProgressEvent({
      eventType: 'assessment_saved',
      title: `${assessment.shotType} assessment saved`,
      detail: `Score ${assessment.overallScore} | ${assessment.grade}`,
      payload: {
        assessmentId: assessment.externalId,
        score: assessment.overallScore,
        shotType: assessment.shotType
      }
    });
    if (assessment.overallScore > previousBest) {
      createProgressEvent({
        eventType: 'milestone',
        title: `${assessment.shotType} personal best`,
        detail: `New best score ${assessment.overallScore}${assessment.milestone?.current ? ` | ${assessment.milestone.current}` : ''}`,
        payload: { assessmentId: assessment.externalId, shotType: assessment.shotType, score: assessment.overallScore }
      });
    }
    updateGoalsFromAssessment(assessment);
    void syncAssessmentToCloud(assessment);
    return assessment;
  }

  function getUserAssessments(userId) {
    const id = userId || requireUser().id;
    return getAssessments()
      .filter((assessment) => assessment.userId === id)
      .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
  }

  function getMilestoneSnapshot(userId) {
    const assessments = getUserAssessments(userId);
    if (!assessments.length) {
      return {
        currentBand: 'Foundation',
        nextBand: 'Groove Builder',
        gapToNext: 72,
        latestScore: 0,
        personalBest: 0
      };
    }

    const latest = assessments[0];
    const best = Math.max(...assessments.map((item) => safeNumber(item.overallScore)));
    const band = latest.milestone?.current || 'Foundation';
    const next = latest.milestone?.next || 'Peak Band';
    return {
      currentBand: band,
      nextBand: next,
      gapToNext: safeNumber(latest.milestone?.gapToNext, 0),
      latestScore: safeNumber(latest.overallScore),
      personalBest: best
    };
  }

  function getDashboardMetrics(userId) {
    const assessments = getUserAssessments(userId);
    const retention = getRetentionSnapshot(userId);
    const milestone = getMilestoneSnapshot(userId);
    if (!assessments.length) {
      return {
        totalAssessments: 0,
        avgScore: 0,
        bestScore: 0,
        improvement: 0,
        latestShot: 'n/a',
        avgConfidence: 0,
        latestAchievements: [],
        milestone,
        ...retention
      };
    }
    const scores = assessments.map((item) => safeNumber(item.overallScore));
    const recent = scores.slice(0, Math.min(3, scores.length));
    const baseline = scores.slice(-Math.min(3, scores.length));
    return {
      totalAssessments: assessments.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      bestScore: Math.max(...scores),
      improvement: Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) - (baseline.reduce((a, b) => a + b, 0) / baseline.length)),
      latestShot: assessments[0].shotType,
      avgConfidence: Math.round(assessments.reduce((sum, item) => sum + safeNumber(item.avgConfidence), 0) / assessments.length),
      latestAchievements: assessments[0].achievements || [],
      milestone,
      ...retention
    };
  }

  function getRecommendedFocusAreas(userId) {
    const latest = getUserAssessments(userId)[0];
    if (!latest) return [];
    return (latest.metricComparisons || [])
      .filter((item) => item.status === 'needs-work')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }

  function getCoachSummary() {
    const access = getAccessContext();
    const visibleUsers = access.canAccessManagerAnalytics
      ? getUsers().filter((user) => user.role === 'player')
      : getVisibleUsersForCurrentUser(access.user?.id).filter((user) => user.role === 'player');
    const assessments = getVisibleAssessmentsForCurrentUser().slice().sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
    const sessions = getVisibleCoachSessionsForCurrentUser().slice().sort((a, b) => new Date(a.when) - new Date(b.when));
    const byUser = visibleUsers.map((user) => {
      const userAssessments = assessments.filter((assessment) => assessment.userId === user.id);
      const latest = userAssessments[0] || null;
      const retention = getRetentionSnapshot(user.id);
      const topIssue = (latest?.metricComparisons || []).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;
      return {
        user,
        latest,
        retention,
        topIssue,
        goals: getUserGoals(user.id),
        drills: getUserDrillAssignments(user.id),
        nextSession: sessions.find((session) => session.userId === user.id && new Date(session.when).getTime() > Date.now()) || null
      };
    });

    const urgentAthletes = byUser.filter((entry) => {
      const issueRisk = Math.abs(entry.topIssue?.delta || 0) >= 18;
      const stale = entry.retention.daysSinceLastAssessment != null && entry.retention.daysSinceLastAssessment > 10;
      return issueRisk || stale;
    }).length;

    return {
      users: visibleUsers,
      assessments,
      sessions,
      athletes: byUser,
      urgentAthletes
    };
  }

  function getUserMessages(userId) {
    const user = userId ? getUsers().find((item) => item.id === userId) : requireUser();
    if (!user) return [];
    return getVisibleMessagesForCurrentUser()
      .filter((message) => message.userId === user.id || message.fromUserId === user.id || message.toUserId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function sendMessage(payload) {
    const currentUser = requireUser();
    const access = getAccessContext(currentUser.id);
    if (!access.canMessage) {
      throw new Error('Messaging is not enabled on this account.');
    }
    const targetUserId = payload.toUserId || null;
    const isDefaultCoach = DEFAULT_COACHES.some((coach) => coach.id === targetUserId);
    if (targetUserId && !isDefaultCoach && !canAccessUserRecord(targetUserId, access)) {
      throw new Error('This recipient is outside your allowed workspace.');
    }
    if (isDefaultCoach && access.role === 'player' && !access.canBookCoach) {
      throw new Error('Coach messaging unlocks on Performance and Tournament plans.');
    }
    const users = getUsers();
    const targetUser = users.find((user) => user.id === targetUserId) || null;
    const message = {
      id: uid('message'),
      externalId: uid('message_ext'),
      userId: currentUser.id,
      fromUserId: currentUser.id,
      toUserId: targetUserId,
      fromName: currentUser.fullName,
      toName: targetUser?.fullName || payload.toName || (payload.toCoach ? 'Coach Team' : 'SmartSwing Inbox'),
      subject: payload.subject || 'New message',
      body: payload.body || '',
      createdAt: nowIso(),
      channel: payload.channel || 'dashboard',
      syncedAt: null
    };
    persistMessages([message, ...getMessages()]);
    void syncMessageToCloud(message);
    return message;
  }

  function getManagerSummary() {
    const users = getUsers();
    const assessments = getAssessments();
    const sessions = getCoachSessions();
    const plans = users.reduce((acc, user) => {
      const planId = user.planId || 'free';
      acc[planId] = (acc[planId] || 0) + 1;
      return acc;
    }, {});
    const revenue = users.reduce((sum, user) => sum + safeNumber(getPlanDefinition(user.planId || 'free').monthlyPrice, 0), 0);
    const coaches = users.filter((user) => user.role === 'coach');
    const players = users.filter((user) => user.role === 'player');
    const avgScore = assessments.length
      ? Math.round(assessments.reduce((sum, item) => sum + safeNumber(item.overallScore, 0), 0) / assessments.length)
      : 0;
    return {
      users,
      coaches,
      players,
      assessments,
      sessions,
      messages: getMessages(),
      planMix: plans,
      estimatedMonthlyRevenue: revenue,
      avgScore,
      activeSessions: sessions.filter((session) => new Date(session.when).getTime() > Date.now()).length
    };
  }

  function bookCoachSession(payload) {
    const user = requireUser();
    const access = getAccessContext(user.id);
    if (!access.canBookCoach) {
      throw new Error('Coach booking unlocks on Performance and Tournament plans.');
    }
    const when = payload.when ? new Date(payload.when) : null;
    if (!when || Number.isNaN(when.getTime())) throw new Error('Choose a valid session time.');
    const session = {
      id: uid('session'),
      externalId: uid('coach_session_ext'),
      userId: user.id,
      coachId: payload.coachId || DEFAULT_COACHES[0].id,
      coachName: payload.coachName || DEFAULT_COACHES[0].name,
      specialty: payload.specialty || DEFAULT_COACHES[0].specialty,
      when: when.toISOString(),
      format: payload.format || 'Virtual',
      focus: payload.focus || 'Technique review',
      status: 'scheduled',
      bookedAt: nowIso(),
      syncedAt: null
    };
    persistCoachSessions([session, ...getCoachSessions()]);
    void syncCoachSessionToCloud(session);
    return session;
  }

  function getUserCoachSessions(userId) {
    const id = userId || requireUser().id;
    return getCoachSessions().filter((session) => session.userId === id).sort((a, b) => new Date(a.when) - new Date(b.when));
  }

  async function uploadSessionArtifacts(assessmentId, options) {
    const client = await getSupabaseClient();
    const user = getCurrentUser();
    if (!client || !user) return { uploaded: false };
    const assessment = getAssessments().find((item) => item.id === assessmentId || item.externalId === assessmentId);
    if (!assessment) return { uploaded: false };

    let videoPath = null;
    let reportPath = null;

    if (options?.videoFile && typeof File !== 'undefined' && options.videoFile instanceof File) {
      const safeName = String(options.videoFile.name || 'video.mp4').replace(/\s+/g, '-');
      videoPath = `${user.id}/${assessment.externalId}/video-${Date.now()}-${safeName}`;
      await client.storage.from('tennis-videos').upload(videoPath, options.videoFile, { upsert: true });
    }

    if (options?.reportHtml) {
      const blob = new Blob([String(options.reportHtml)], { type: 'text/html' });
      reportPath = `${user.id}/${assessment.externalId}/report-${Date.now()}.html`;
      await client.storage.from('analysis-reports').upload(reportPath, blob, { upsert: true });
    }

    if (videoPath) {
      await client.from('assessments').update({ video_path: videoPath }).eq('external_id', assessment.externalId);
    }

    let remoteAssessmentId = assessment.remoteId || null;
    if (reportPath && !remoteAssessmentId) {
      const { data: linkedAssessment } = await client
        .from('assessments')
        .select('id')
        .eq('external_id', assessment.externalId)
        .maybeSingle();
      remoteAssessmentId = linkedAssessment?.id || null;
    }

    if (reportPath && remoteAssessmentId) {
      await client.from('analysis_reports').insert({
        assessment_id: remoteAssessmentId,
        user_id: user.id,
        report_path: reportPath,
        report_format: 'html'
      });
    }

    if (videoPath || reportPath) {
      const all = getAssessments();
      const idx = all.findIndex((item) => item.id === assessment.id || item.externalId === assessment.externalId);
      if (idx >= 0) {
        all[idx] = {
          ...all[idx],
          videoPath: videoPath || all[idx].videoPath || '',
          reportPath: reportPath || all[idx].reportPath || '',
          syncedAt: nowIso()
        };
        persistAssessments(all);
      }
    }

    return { uploaded: !!(videoPath || reportPath), videoPath, reportPath };
  }

  async function saveContactMessage(payload) {
    const client = await getSupabaseClient();
    const user = getCurrentUser();
    if (!client || !user) return { synced: false };
    const { error } = await client.from('contact_messages').insert({
      user_id: user.id,
      name: payload.name,
      email: payload.email,
      topic: payload.topic,
      message: payload.message
    });
    return { synced: !error, error: error?.message || null };
  }

  async function syncNow() {
    const user = getCurrentUser();
    if (!user) return;
    await ensureRemoteProfile(user);
    await pullRemoteState(user.id);
    for (const assessment of getUserAssessments(user.id)) {
      if (!assessment.syncedAt) {
        // eslint-disable-next-line no-await-in-loop
        await syncAssessmentToCloud(assessment);
      }
    }
    for (const session of getUserCoachSessions(user.id)) {
      if (!session.syncedAt) {
        // eslint-disable-next-line no-await-in-loop
        await syncCoachSessionToCloud(session);
      }
    }
    for (const goal of getUserGoals(user.id)) {
      if (!goal.syncedAt) {
        // eslint-disable-next-line no-await-in-loop
        await syncGoalToCloud(goal);
      }
    }
    for (const drill of getUserDrillAssignments(user.id)) {
      if (!drill.syncedAt) {
        // eslint-disable-next-line no-await-in-loop
        await syncDrillAssignmentToCloud(drill);
      }
    }
    for (const event of getProgressTimeline(user.id, 200)) {
      if (!event.syncedAt) {
        // eslint-disable-next-line no-await-in-loop
        await syncProgressEventToCloud(event);
      }
    }
    for (const message of getVisibleMessagesForCurrentUser(user.id).filter((item) => item.fromUserId === user.id)) {
      if (!message.syncedAt) {
        // eslint-disable-next-line no-await-in-loop
        await syncMessageToCloud(message);
      }
    }
  }

  function seedDemoUser() {
    if (!allowLocalDataMode()) return;
    if (getUsers().length > 0) return;
    const demoUser = createProfile('Demo Player', 'demo@smartswing.ai', {
      password: 'demo123',
      userRole: 'player',
      ageRange: '18-25',
      gender: 'other',
      ustaLevel: '4.0',
      utrRating: '6.5',
      preferredHand: 'right',
      planId: 'pro',
      activePlanId: 'pro',
      subscriptionStatus: 'active'
    });
    persistUsers([demoUser]);
  }

  function ensureDefaultSession() {
    if (!allowLocalDataMode()) return;
    if (isSupabaseConfigured()) return;
    const hasOptedOut = localStorage.getItem(KEYS.autoSessionOptOut) === '1';
    const session = getCurrentSession();
    if (session?.userId && getUsers().some((user) => user.id === session.userId)) return;
    if (hasOptedOut) return;
    const demo = getUsers()[0];
    if (!demo) return;
    write(KEYS.session, { userId: demo.id, loggedInAt: nowIso(), mode: 'auto-demo' });
  }

  clearUnsafeLocalSession();
  seedDemoUser();
  ensureDefaultSession();

  window.SmartSwingStore = {
    DEFAULT_COACHES,
    PLAN_DEFINITIONS,
    PAYMENT_PROVIDER_SETTINGS,
    DRILL_LIBRARY,
    TACTIC_LIBRARY,
    KEYS,
    signUp,
    signIn,
    updateProfile,
    signInWithOAuthProvider,
    signInWithGoogle,
    signInWithFacebook,
    signInWithApple,
    signOut,
    setCheckoutIntent,
    getCheckoutIntent,
    clearCheckoutIntent,
    getCheckoutIntentDestination,
    getUsers,
    getAssessments,
    getMessages,
    getGoals,
    getDrillAssignments,
    getProgressEvents,
    getReportUsage,
    getCurrentUser,
    getCurrentSession,
    getPlanDefinition,
    normalizeBillingInterval,
    getPlanPrice,
    getCurrentPlan,
    getPaymentProviderSettings,
    getStripePlanConfig,
    getExternalCheckoutRoute,
    getPendingExternalCheckout,
    clearPendingExternalCheckout,
    beginExternalCheckout,
    updatePendingExternalCheckout,
    createStripeCheckout,
    createStripeBillingPortal,
    verifyStripeCheckoutSession,
    applyBillingActivation,
    isOnboardingRequired,
    getOnboardingRoute,
    saveOnboardingQuiz,
    getTrialEligibility,
    setCurrentPlan,
    startPlanTrial,
    getMonthlyUsage,
    canGenerateReport,
    consumeMonthlyReportCredit,
    canSaveReport,
    canPrintReport,
    canAccessLibrary,
    getDrillLibrary,
    getTacticLibrary,
    getTacticRecommendations,
    detectWeaknesses,
    matchDrillsToWeaknesses,
    matchTacticsToProfile,
    saveAssessment,
    getUserAssessments,
    getDashboardMetrics,
    getMilestoneSnapshot,
    getRetentionSnapshot,
    getRecommendedFocusAreas,
    getCoachSummary,
    getManagerSummary,
    getAccessContext,
    getVisibleUsersForCurrentUser,
    getVisibleAssessmentsForCurrentUser,
    getVisibleCoachSessionsForCurrentUser,
    getVisibleMessagesForCurrentUser,
    getMessagingTargets,
    compareAgainstBenchmark,
    buildTailoredDrills,
    setPlayerGoal,
    updateGoalProgress,
    getUserGoals,
    getUserDrillAssignments,
    setDrillStatus,
    getProgressTimeline,
    bookCoachSession,
    getUserCoachSessions,
    getUserMessages,
    sendMessage,
    uploadSessionArtifacts,
    saveContactMessage,
    getSupabaseClient,
    restoreSupabaseSession,
    getOAuthCallbackUrl,
    getPostAuthDestinationForUser,
    getAuthAvailability,
    getOAuthProviderAvailability,
    setSupabaseConfig,
    clearSupabaseConfig,
    syncNow,
    isSupabaseConfigured,
    syncNow,
    read,
    write
  };
})();
