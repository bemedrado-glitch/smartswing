(function () {
  const KEYS = {
    users: 'smartswing_users',
    session: 'smartswing_session',
    assessments: 'smartswing_assessments',
    coachSessions: 'smartswing_coach_sessions',
    goals: 'smartswing_goals',
    drillAssignments: 'smartswing_drill_assignments',
    progressEvents: 'smartswing_progress_events',
    lastSession: 'smartswing_last_session',
    supabaseConfig: 'smartswing_supabase_config'
  };

  const DEFAULT_COACHES = [
    { id: 'coach-1', name: 'Coach Serena Blake', specialty: 'Serve + first-strike patterns' },
    { id: 'coach-2', name: 'Coach Rafael Mendes', specialty: 'Forehand mechanics + footwork' },
    { id: 'coach-3', name: 'Coach Naomi Carter', specialty: 'Backhand timing + recovery' }
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

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function slugShot(value) {
    return String(value || 'forehand').toLowerCase().replace(/\s+/g, '-');
  }

  function getSupabaseConfig() {
    const fromWindow = window.SMARTSWING_SUPABASE_CONFIG || {};
    const fromStorage = read(KEYS.supabaseConfig, {}) || {};
    const url = String(fromWindow.url || fromStorage.url || '').trim();
    const anonKey = String(fromWindow.anonKey || fromStorage.anonKey || '').trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
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
    return supabaseClient;
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

  function getDrillAssignments() {
    return read(KEYS.drillAssignments, []);
  }

  function getProgressEvents() {
    return read(KEYS.progressEvents, []);
  }

  function getCurrentSession() {
    return read(KEYS.session, null);
  }

  function getCurrentUser() {
    const session = getCurrentSession();
    if (!session?.userId) return null;
    return getUsers().find((user) => user.id === session.userId) || null;
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

  function persistDrillAssignments(assignments) {
    write(KEYS.drillAssignments, assignments);
    return assignments;
  }

  function persistProgressEvents(events) {
    write(KEYS.progressEvents, events);
    return events;
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
      createdAt: nowIso()
    };
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
      preferred_hand: user.preferredHand || 'right'
    }, { onConflict: 'id' });
  }

  async function pullRemoteState(userId) {
    const client = await getSupabaseClient();
    if (!client || !userId) return;

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
        upsertLocalUser(local);
        write(KEYS.session, { userId: local.id, loggedInAt: nowIso() });
        await ensureRemoteProfile(local);
        await pullRemoteState(local.id);
        return local;
      }
    }

    const users = getUsers();
    if (users.some((user) => user.email === email)) {
      throw new Error('An account with this email already exists.');
    }
    const user = createProfile(fullName, email, { ...fields, password });
    persistUsers([...users, user]);
    write(KEYS.session, { userId: user.id, loggedInAt: nowIso() });
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
        const local = {
          id: data.user.id,
          fullName: profile?.full_name || data.user.user_metadata?.full_name || data.user.email || 'Player',
          email: profile?.email || data.user.email || normalizedEmail,
          role: profile?.role || data.user.user_metadata?.role || 'player',
          ageRange: profile?.age_range || '',
          gender: profile?.gender || '',
          ustaLevel: profile?.usta_level || '',
          utrRating: profile?.utr_rating || '',
          preferredHand: profile?.preferred_hand || 'right',
          createdAt: profile?.created_at || nowIso()
        };
        upsertLocalUser(local);
        write(KEYS.session, { userId: local.id, loggedInAt: nowIso() });
        await ensureRemoteProfile(local);
        await pullRemoteState(local.id);
        return local;
      }
    }

    const user = getUsers().find((item) => item.email === normalizedEmail && item.password === normalizedPassword);
    if (!user) throw new Error('Invalid email or password.');
    write(KEYS.session, { userId: user.id, loggedInAt: nowIso() });
    return user;
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured()) {
      throw new Error('Google OAuth requires Supabase configuration.');
    }
    const client = await getSupabaseClient();
    if (!client) throw new Error('Supabase client unavailable.');
    const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}dashboard.html`;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) throw new Error(error.message || 'Google sign-in failed.');
  }

  function signOut() {
    localStorage.removeItem(KEYS.session);
    getSupabaseClient().then((client) => client?.auth.signOut()).catch(() => {});
  }

  function requireUser() {
    const user = getCurrentUser();
    if (!user) throw new Error('Please sign in first.');
    return user;
  }

  function compareAgainstBenchmark(avgAngles, benchmarks) {
    return Object.entries(avgAngles || {}).map(([name, value]) => {
      const benchmark = benchmarks?.[name];
      const current = safeNumber(value, null);
      if (!benchmark || current == null) return null;
      const delta = Math.round(current - benchmark.optimal);
      return {
        metric: name,
        current,
        target: benchmark.optimal,
        delta,
        status: Math.abs(delta) <= 5 ? 'excellent' : Math.abs(delta) <= 10 ? 'good' : 'needs-work'
      };
    }).filter(Boolean);
  }

  function buildTailoredDrills(assessment) {
    const shotType = assessment.shotType || 'forehand';
    const level = String(assessment.level || assessment.playerLevel || 'intermediate').toLowerCase();
    const levelProfile = {
      beginner: { sets: 2, reps: 8 },
      intermediate: { sets: 3, reps: 10 },
      advanced: { sets: 4, reps: 12 },
      pro: { sets: 4, reps: 14 }
    }[level] || { sets: 3, reps: 10 };
    const top = [...(assessment.metricComparisons || [])].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
    if (!top.length) {
      return [{
        title: `${shotType} repeatability block`,
        focus: 'Consistency',
        prescription: `${levelProfile.sets} sets of ${levelProfile.reps * 2} shadow swings, then ${levelProfile.reps * 2} live-ball reps.`,
        cue: 'Keep posture and contact point identical rep to rep.'
      }];
    }
    return top.map((issue) => ({
      title: `${issue.metric.charAt(0).toUpperCase() + issue.metric.slice(1)} precision drill`,
      focus: `${shotType} mechanics`,
      prescription: `${levelProfile.sets} x ${levelProfile.reps} controlled reps + ${levelProfile.reps + 2} live-ball reps with immediate review.`,
      cue: issue.delta > 0 ? 'Reduce over-extension and tighten sequence timing.' : 'Increase range to hit target angle window.'
    }));
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

  function saveAssessment(payload) {
    const user = requireUser();
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
      avgConfidence: safeNumber(payload.avgConfidence),
      avgLandmarks: safeNumber(payload.avgLandmarks),
      avgAngles: payload.avgAngles || {},
      benchmarkSummary: payload.benchmarkSummary || '',
      metricComparisons: payload.metricComparisons || [],
      tailoredDrills: payload.tailoredDrills || [],
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

  function getDashboardMetrics(userId) {
    const assessments = getUserAssessments(userId);
    const retention = getRetentionSnapshot(userId);
    if (!assessments.length) {
      return {
        totalAssessments: 0,
        avgScore: 0,
        bestScore: 0,
        improvement: 0,
        latestShot: 'n/a',
        avgConfidence: 0,
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
    const users = getUsers().filter((user) => user.role !== 'coach');
    const assessments = getAssessments().slice().sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
    const sessions = getCoachSessions().slice().sort((a, b) => new Date(a.when) - new Date(b.when));
    const byUser = users.map((user) => {
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
      users,
      assessments,
      sessions,
      athletes: byUser,
      urgentAthletes
    };
  }

  function bookCoachSession(payload) {
    const user = requireUser();
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
  }

  function seedDemoUser() {
    if (getUsers().length > 0) return;
    const demoUser = createProfile('Demo Player', 'demo@smartswing.ai', {
      password: 'demo123',
      userRole: 'player',
      ageRange: '18-25',
      gender: 'other',
      ustaLevel: '4.0',
      utrRating: '6.5',
      preferredHand: 'right'
    });
    persistUsers([demoUser]);
  }

  seedDemoUser();

  window.SmartSwingStore = {
    DEFAULT_COACHES,
    KEYS,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    getUsers,
    getAssessments,
    getGoals,
    getDrillAssignments,
    getProgressEvents,
    getCurrentUser,
    getCurrentSession,
    saveAssessment,
    getUserAssessments,
    getDashboardMetrics,
    getRetentionSnapshot,
    getRecommendedFocusAreas,
    getCoachSummary,
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
    uploadSessionArtifacts,
    saveContactMessage,
    setSupabaseConfig,
    clearSupabaseConfig,
    isSupabaseConfigured,
    syncNow,
    read,
    write
  };
})();
