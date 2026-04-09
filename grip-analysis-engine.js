// ============================================================================
// GRIP ANALYSIS ENGINE
// SmartSwing AI — Tennis grip inference from pose kinematics
// ============================================================================
//
// WHAT THIS DOES
//   Infers the likely grip a player is using (Continental, Eastern, Semi-Western,
//   Western, Eastern Backhand, Two-Handed Backhand) from the body-only pose
//   signals captured at the contact frame of a swing.
//
// WHY THIS APPROACH
//   MediaPipe / MoveNet give us pose keypoints but NOT finger landmarks, so we
//   cannot see the knuckle-on-bevel placement a human coach uses. However, the
//   grip a player uses forces a specific, measurable cluster of kinematics at
//   contact: wrist extension, contact height, swing-plane angle, elbow flexion,
//   and forearm orientation. These are well documented in the biomechanics
//   literature (Elliott/Reid/Crespo) and separate the common tennis grips with
//   good reliability without any labeled training data.
//
//   The classifier is intentionally RULE-BASED and transparent. Every decision
//   can be explained to a coach or a player. It can be upgraded to a learned
//   model later once we collect labeled swings.
//
// INPUT
//   frames     — array of { keypoints, timestamp } in chronological order
//   shotType   — 'forehand' | 'backhand' | 'serve' | 'volley' | 'slice' | ...
//   handedness — 'right' | 'left'  (optional; auto-detected if omitted)
//
// OUTPUT
//   {
//     detected_grip: 'semi-western',
//     confidence: 0.74,
//     distribution: { continental: 0.05, ... },
//     indicators: { wrist_extension_deg: 32, contact_height_ratio: 0.95, ... },
//     shot_match: { appropriate: true, severity: 'none', expected: [...] },
//     recommendations: [ { action, title, why, how_steps } ],
//     drill_ids: [ ... ],
//     contact_frame_index: 42,
//     notes: 'string explanation'
//   }
// ============================================================================

(function (global) {
  'use strict';

  // MoveNet / MediaPipe-17 keypoint indices (same convention as biomech engine)
  var KP = {
    LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
    LEFT_ELBOW: 7,    RIGHT_ELBOW: 8,
    LEFT_WRIST: 9,    RIGHT_WRIST: 10,
    LEFT_HIP: 11,     RIGHT_HIP: 12,
    LEFT_KNEE: 13,    RIGHT_KNEE: 14,
    LEFT_ANKLE: 15,   RIGHT_ANKLE: 16
  };

  var MIN_CONFIDENCE = 0.3;

  // ----- tiny vector helpers -----
  function kp(keypoints, idx) {
    var k = keypoints && keypoints[idx];
    if (!k) return null;
    var c = (k.score != null) ? k.score : (k.confidence != null ? k.confidence : 0);
    return c >= MIN_CONFIDENCE ? k : null;
  }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function mag(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function cross2(a, b) { return a.x * b.y - a.y * b.x; }
  function toDeg(rad) { return rad * 180 / Math.PI; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Unsigned angle at vertex B in A-B-C (degrees).
  function angle3(A, B, C) {
    var u = sub(A, B);
    var v = sub(C, B);
    var mu = mag(u), mv = mag(v);
    if (mu === 0 || mv === 0) return null;
    var cosA = clamp(dot(u, v) / (mu * mv), -1, 1);
    return toDeg(Math.acos(cosA));
  }

  // Signed angle from vector u to vector v (-180..180 degrees).
  function signedAngle(u, v) {
    return toDeg(Math.atan2(cross2(u, v), dot(u, v)));
  }

  // ----- side detection -----
  function detectHandedness(keypoints) {
    var rs = keypoints[KP.RIGHT_SHOULDER], re = keypoints[KP.RIGHT_ELBOW], rw = keypoints[KP.RIGHT_WRIST];
    var ls = keypoints[KP.LEFT_SHOULDER],  le = keypoints[KP.LEFT_ELBOW],  lw = keypoints[KP.LEFT_WRIST];
    var rScore = ((rs && rs.score) || 0) + ((re && re.score) || 0) + ((rw && rw.score) || 0);
    var lScore = ((ls && ls.score) || 0) + ((le && le.score) || 0) + ((lw && lw.score) || 0);
    return rScore >= lScore ? 'right' : 'left';
  }

  // ----- contact frame detection -----
  // Contact frame is approximated by the frame with peak wrist speed (between
  // adjacent frames). This matches the advanced biomechanics engine's definition.
  function findContactFrame(frames, side) {
    if (!frames || frames.length < 3) return -1;
    var wristIdx = side === 'right' ? KP.RIGHT_WRIST : KP.LEFT_WRIST;
    var maxSpeed = -1, maxIdx = -1;
    for (var i = 1; i < frames.length; i++) {
      var a = frames[i - 1].keypoints && frames[i - 1].keypoints[wristIdx];
      var b = frames[i].keypoints && frames[i].keypoints[wristIdx];
      if (!a || !b) continue;
      var dx = b.x - a.x, dy = b.y - a.y;
      var dt = (frames[i].timestamp - frames[i - 1].timestamp) || (1 / 30);
      var speed = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 1e-6);
      if (speed > maxSpeed) { maxSpeed = speed; maxIdx = i; }
    }
    return maxIdx;
  }

  // ============================================================================
  // INDICATOR CALCULATIONS
  //
  // All computed at the contact frame (with small windows around it for
  // trajectory-based signals). Units are documented inline.
  // ============================================================================

  // 1. Wrist extension angle (degrees).
  //    Body-only approximation: the angle between the forearm vector
  //    (elbow→wrist) and the hand-direction proxy (wrist velocity direction
  //    averaged over ±2 frames around contact). A neutral wrist → small angle;
  //    a laid-back / heavily extended wrist → large angle. Typical ranges:
  //      Continental ~0–15°, Eastern ~15–25°, Semi-W ~25–40°, Western ~40–60°.
  function wristExtensionAtContact(frames, contactIdx, side) {
    var elbowIdx = side === 'right' ? KP.RIGHT_ELBOW : KP.LEFT_ELBOW;
    var wristIdx = side === 'right' ? KP.RIGHT_WRIST : KP.LEFT_WRIST;
    var cur = frames[contactIdx].keypoints;
    var elbow = kp(cur, elbowIdx);
    var wrist = kp(cur, wristIdx);
    if (!elbow || !wrist) return null;

    // forearm vector (elbow → wrist)
    var forearm = sub(wrist, elbow);

    // wrist-velocity direction averaged ±2 frames around contact
    var from = Math.max(0, contactIdx - 2);
    var to = Math.min(frames.length - 1, contactIdx + 2);
    var accumX = 0, accumY = 0, n = 0;
    for (var i = from + 1; i <= to; i++) {
      var wp = frames[i - 1].keypoints && frames[i - 1].keypoints[wristIdx];
      var wc = frames[i].keypoints && frames[i].keypoints[wristIdx];
      if (!wp || !wc) continue;
      accumX += (wc.x - wp.x); accumY += (wc.y - wp.y); n++;
    }
    if (n === 0) return null;
    var handDir = { x: accumX / n, y: accumY / n };
    if (mag(handDir) < 1e-3 || mag(forearm) < 1e-3) return null;

    // Angle between forearm and hand velocity direction.
    // A perfectly aligned forearm+hand gives 0°; a laid-back / extended wrist
    // gives a larger angle. We return the magnitude of that deviation.
    var ang = Math.abs(signedAngle(forearm, handDir));
    if (ang > 90) ang = 180 - ang; // fold so 0..90
    return ang;
  }

  // 2. Contact height ratio.
  //    (hip_y - wrist_y) / (hip_y - shoulder_y)  — positive upward since y grows
  //    downward in image coords. 0 = wrist at hip level, 1 = wrist at shoulder,
  //    >1 = above shoulder. Continental tends low, Western tends high.
  function contactHeightRatio(frames, contactIdx, side) {
    var shoulderIdx = side === 'right' ? KP.RIGHT_SHOULDER : KP.LEFT_SHOULDER;
    var hipIdx      = side === 'right' ? KP.RIGHT_HIP      : KP.LEFT_HIP;
    var wristIdx    = side === 'right' ? KP.RIGHT_WRIST    : KP.LEFT_WRIST;
    var cur = frames[contactIdx].keypoints;
    var sh = kp(cur, shoulderIdx), hip = kp(cur, hipIdx), wr = kp(cur, wristIdx);
    if (!sh || !hip || !wr) return null;
    var torso = hip.y - sh.y; // positive in image coords
    if (torso < 1e-3) return null;
    return (hip.y - wr.y) / torso;
  }

  // 3. Swing-plane angle (degrees above horizontal).
  //    Slope of wrist trajectory over the 6 frames BEFORE contact. Continental
  //    is nearly flat (~5–15°), Western is very steep (~40–55°).
  function swingPlaneAngle(frames, contactIdx, side) {
    var wristIdx = side === 'right' ? KP.RIGHT_WRIST : KP.LEFT_WRIST;
    var from = Math.max(0, contactIdx - 6);
    if (contactIdx - from < 2) return null;
    var first = frames[from].keypoints && frames[from].keypoints[wristIdx];
    var last  = frames[contactIdx].keypoints && frames[contactIdx].keypoints[wristIdx];
    if (!first || !last) return null;
    var dx = last.x - first.x;
    var dy = first.y - last.y; // flip so upward is positive
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return null;
    var ang = toDeg(Math.atan2(dy, Math.abs(dx))); // always in -90..90
    return ang; // positive = low-to-high swing, negative = high-to-low
  }

  // 4. Elbow angle at contact (degrees, 0..180). Already computable 3-point.
  function elbowAngleAtContact(frames, contactIdx, side) {
    var shoulderIdx = side === 'right' ? KP.RIGHT_SHOULDER : KP.LEFT_SHOULDER;
    var elbowIdx    = side === 'right' ? KP.RIGHT_ELBOW    : KP.LEFT_ELBOW;
    var wristIdx    = side === 'right' ? KP.RIGHT_WRIST    : KP.LEFT_WRIST;
    var cur = frames[contactIdx].keypoints;
    var sh = kp(cur, shoulderIdx), el = kp(cur, elbowIdx), wr = kp(cur, wristIdx);
    if (!sh || !el || !wr) return null;
    return angle3(sh, el, wr);
  }

  // 5. Forearm pronation proxy (0..1).
  //    The body-only proxy for forearm pronation: how horizontal the forearm
  //    is relative to the trunk line at contact, normalized for handedness.
  //    Western grips bias the forearm to more pronation (flatter, more
  //    horizontal relative to trunk). Continental stays vertical.
  function forearmPronationProxy(frames, contactIdx, side) {
    var shoulderIdx = side === 'right' ? KP.RIGHT_SHOULDER : KP.LEFT_SHOULDER;
    var elbowIdx    = side === 'right' ? KP.RIGHT_ELBOW    : KP.LEFT_ELBOW;
    var wristIdx    = side === 'right' ? KP.RIGHT_WRIST    : KP.LEFT_WRIST;
    var hipIdxL = KP.LEFT_HIP, hipIdxR = KP.RIGHT_HIP;
    var cur = frames[contactIdx].keypoints;
    var sh = kp(cur, shoulderIdx), el = kp(cur, elbowIdx), wr = kp(cur, wristIdx);
    var hipL = kp(cur, hipIdxL), hipR = kp(cur, hipIdxR);
    if (!sh || !el || !wr || !hipL || !hipR) return null;
    var forearm = sub(wr, el);
    var trunk = sub({ x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 }, sh);
    var mf = mag(forearm), mt = mag(trunk);
    if (mf < 1e-3 || mt < 1e-3) return null;
    // angle between forearm and trunk (0 = parallel, 90 = perpendicular)
    var cosA = clamp(dot(forearm, trunk) / (mf * mt), -1, 1);
    var deg = toDeg(Math.acos(cosA));
    // Perpendicular forearm = flat / pronated hit → 1.0
    // Parallel forearm = low, neutral → 0.0
    return clamp(deg / 90, 0, 1);
  }

  // ============================================================================
  // GRIP CLASSIFIER
  //
  // For each candidate grip we store the expected center + tolerance for each
  // indicator, compute a Gaussian-like score, multiply across indicators, and
  // normalize into a probability distribution. This is essentially a diagonal-
  // covariance Gaussian classifier with hand-set centers — transparent, easy to
  // tune, and upgradeable to a trained version later.
  //
  // Centers below are drawn from published tennis biomechanics references and
  // coaching literature. They are deliberately conservative ranges; we'd rather
  // output "medium confidence" than a confidently wrong answer.
  // ============================================================================

  // Format: [center, tolerance_sigma]. Missing entries mean "this indicator
  // doesn't discriminate this grip" and it's skipped.
  var FOREHAND_GRIPS = {
    'continental':  { wrist_ext: [10, 8],  height: [0.45, 0.20], swing: [10, 10], elbow: [165, 12], pron: [0.20, 0.20] },
    'eastern':      { wrist_ext: [20, 8],  height: [0.75, 0.15], swing: [20, 10], elbow: [158, 12], pron: [0.40, 0.20] },
    'semi-western': { wrist_ext: [33, 10], height: [0.95, 0.15], swing: [32, 10], elbow: [148, 12], pron: [0.60, 0.20] },
    'western':      { wrist_ext: [50, 12], height: [1.15, 0.20], swing: [48, 12], elbow: [140, 12], pron: [0.80, 0.20] }
  };

  var BACKHAND_GRIPS = {
    'continental':        { wrist_ext: [12, 8],  height: [0.55, 0.20], swing: [12, 10], elbow: [165, 12], pron: [0.25, 0.20] },
    'eastern-backhand':   { wrist_ext: [22, 10], height: [0.85, 0.18], swing: [22, 10], elbow: [155, 14], pron: [0.45, 0.20] },
    'two-handed-backhand':{ wrist_ext: [18, 10], height: [0.85, 0.20], swing: [24, 12], elbow: [150, 15], pron: [0.50, 0.25] }
  };

  var SERVE_GRIPS = {
    'continental':        { wrist_ext: [15, 10], height: [1.35, 0.30], swing: [30, 20], elbow: [155, 15], pron: [0.30, 0.25] },
    'eastern':            { wrist_ext: [25, 12], height: [1.30, 0.30], swing: [28, 20], elbow: [155, 15], pron: [0.45, 0.25] },
    'semi-western':       { wrist_ext: [35, 14], height: [1.25, 0.30], swing: [26, 20], elbow: [150, 15], pron: [0.60, 0.25] }
  };

  // Gaussian-ish score: value 1 at center, decaying with distance/sigma.
  function gScore(val, center, sigma) {
    if (val == null) return null;
    var z = (val - center) / (sigma || 1);
    return Math.exp(-(z * z) / 2);
  }

  function gripScore(indicators, centers) {
    var acc = 1;
    var count = 0;
    var map = [
      ['wrist_ext', indicators.wrist_extension_deg],
      ['height',    indicators.contact_height_ratio],
      ['swing',     indicators.swing_plane_angle_deg],
      ['elbow',     indicators.elbow_angle_at_contact_deg],
      ['pron',      indicators.forearm_pronation_proxy]
    ];
    for (var i = 0; i < map.length; i++) {
      var key = map[i][0]; var val = map[i][1];
      var spec = centers[key];
      if (!spec || val == null) continue;
      var s = gScore(val, spec[0], spec[1]);
      acc *= Math.max(0.01, s); // floor so zero in one indicator doesn't kill everything
      count++;
    }
    return count >= 2 ? acc : 0;
  }

  function normalizeDistribution(scores) {
    var total = 0;
    for (var k in scores) { if (scores.hasOwnProperty(k)) total += scores[k]; }
    if (total < 1e-6) return null;
    var out = {};
    for (var kk in scores) { if (scores.hasOwnProperty(kk)) out[kk] = scores[kk] / total; }
    return out;
  }

  // ============================================================================
  // SHOT × GRIP APPROPRIATENESS (coaching rules)
  // ============================================================================
  var SHOT_APPROPRIATE = {
    'forehand':   { expected: ['eastern', 'semi-western', 'western'], mismatch: { 'continental': 'medium' } },
    'serve':      { expected: ['continental'], mismatch: { 'eastern': 'high', 'semi-western': 'critical', 'western': 'critical' } },
    'volley':     { expected: ['continental'], mismatch: { 'eastern': 'medium', 'semi-western': 'high', 'western': 'high' } },
    'slice':      { expected: ['continental'], mismatch: { 'eastern': 'medium', 'semi-western': 'high', 'western': 'high' } },
    'drop-shot':  { expected: ['continental'], mismatch: { 'eastern': 'medium', 'semi-western': 'high', 'western': 'high' } },
    'lob':        { expected: ['eastern', 'semi-western', 'western', 'continental'], mismatch: {} },
    'return':     { expected: ['eastern', 'semi-western', 'western', 'continental'], mismatch: {} },
    'backhand':   { expected: ['continental', 'eastern-backhand', 'two-handed-backhand'], mismatch: { 'eastern': 'medium', 'semi-western': 'medium', 'western': 'high' } }
  };

  // ============================================================================
  // RECOMMENDATION BUILDER
  // ============================================================================
  function buildRecommendations(detected, shotType, indicators, level) {
    var recs = [];
    var rule = SHOT_APPROPRIATE[shotType] || SHOT_APPROPRIATE['forehand'];
    var severity = rule.mismatch[detected] || (rule.expected.indexOf(detected) >= 0 ? 'none' : 'low');

    // Critical mismatches
    if (shotType === 'serve' && detected !== 'continental') {
      recs.push({
        action: 'change',
        title: 'Switch to a Continental grip for your serve',
        why: "A non-Continental grip on the serve locks out forearm pronation — you lose both power and the ability to generate slice/kick. Every pro serves Continental for this reason.",
        how_steps: [
          'Hold the racquet like a hammer, with the V between thumb and index finger on bevel 2 (just to the right of the top bevel for right-handers).',
          'Shadow-serve 20 reps focusing on the "pronation snap" at contact — the racquet face should rotate naturally from edge-on to flat.',
          'Start your first on-court session with soft serves only, checking after each one that your grip hasn\'t crept back toward Eastern or Semi-Western.'
        ]
      });
    } else if ((shotType === 'volley' || shotType === 'slice' || shotType === 'drop-shot') && detected !== 'continental') {
      recs.push({
        action: 'change',
        title: 'Use a Continental grip for volleys and slices',
        why: 'Continental is the only grip that lets you punch forehand AND backhand volleys without switching, and it opens the racquet face naturally for underspin.',
        how_steps: [
          'Before each volley drill, check your grip: V between thumb/index on bevel 2.',
          'Do 30 reps of the "punch volley" drill: short backswing, firm wrist, contact in front of body.',
          'Practice switching between FH and BH volleys without changing grip — this is only possible with Continental.'
        ]
      });
    } else if (shotType === 'forehand' && detected === 'continental') {
      recs.push({
        action: 'change',
        title: 'Move to an Eastern or Semi-Western forehand grip',
        why: 'A Continental forehand caps your topspin ceiling — you can drive the ball but you cannot impart the RPM that modern forehands rely on to land deep and dip at the baseline.',
        how_steps: [
          level === 'beginner'
            ? 'Start with Eastern: place your palm flat on the strings then slide down to the handle — that is bevel 3.'
            : 'Go to Semi-Western: palm on bevel 4 (one notch beyond Eastern, toward the court side).',
          'Shadow-swing 20 reps emphasizing a low-to-high path brushing up the back of the ball.',
          'On court, start with mini-tennis to groove the new contact point before hitting from the baseline.'
        ]
      });
    } else if (shotType === 'forehand' && detected === 'western' && level === 'beginner') {
      recs.push({
        action: 'consider',
        title: 'Western is a demanding grip — consider Semi-Western',
        why: "Western gives huge topspin but makes low balls very hard to handle. Unless you play exclusively on high-bounce clay, Semi-Western is the better all-surface choice.",
        how_steps: [
          'Rotate your palm one bevel back (counter-clockwise for right-handers) — that\'s Semi-Western.',
          'Hit 50 feeds focusing on contact at waist-to-shoulder height.',
          'Check wrist extension — it should feel laid back but less extreme than before.'
        ]
      });
    }

    // Success/maintain callouts when the grip matches
    if (recs.length === 0 && rule.expected.indexOf(detected) >= 0) {
      var pretty = detected.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      recs.push({
        action: 'maintain',
        title: pretty + ' — great match for your ' + shotType,
        why: "Your grip at contact matches what modern coaching prescribes for this shot. The kinematic signature is clean — keep grooving it.",
        how_steps: null
      });
    }

    return { recommendations: recs, severity: severity };
  }

  function drillIdsFor(detected, shotType, severity) {
    var drills = [];
    if (shotType === 'serve' && detected !== 'continental') {
      drills.push('grip-bevel-check-continental', 'shadow-serve-pronation-snap');
    } else if ((shotType === 'volley' || shotType === 'slice') && detected !== 'continental') {
      drills.push('grip-bevel-check-continental', 'punch-volley-no-switch');
    } else if (shotType === 'forehand' && detected === 'continental') {
      drills.push('grip-bevel-check-eastern', 'low-to-high-shadow-swing');
    } else if (shotType === 'forehand' && (detected === 'semi-western' || detected === 'eastern' || detected === 'western')) {
      drills.push('topspin-brush-drill', 'contact-point-groove');
    }
    return drills;
  }

  // ============================================================================
  // PUBLIC ENTRY POINT
  // ============================================================================
  function analyzeGrip(frames, shotType, handedness, options) {
    options = options || {};
    var level = options.level || 'intermediate';
    shotType = (shotType || 'forehand').toLowerCase();

    if (!frames || frames.length < 5) {
      return { detected_grip: null, confidence: 0, reason: 'insufficient-frames' };
    }

    // Sniff handedness if not provided
    if (!handedness) {
      var refFrame = frames[Math.floor(frames.length / 2)];
      handedness = detectHandedness(refFrame.keypoints || []);
    }

    // Find contact frame (peak wrist speed)
    var contactIdx = findContactFrame(frames, handedness);
    if (contactIdx < 0) {
      return { detected_grip: null, confidence: 0, reason: 'no-contact-frame' };
    }

    // Indicators
    var indicators = {
      wrist_extension_deg:        wristExtensionAtContact(frames, contactIdx, handedness),
      contact_height_ratio:       contactHeightRatio(frames, contactIdx, handedness),
      swing_plane_angle_deg:      swingPlaneAngle(frames, contactIdx, handedness),
      elbow_angle_at_contact_deg: elbowAngleAtContact(frames, contactIdx, handedness),
      forearm_pronation_proxy:    forearmPronationProxy(frames, contactIdx, handedness)
    };

    // Round for readable storage
    var roundedIndicators = {};
    for (var kkk in indicators) {
      if (indicators[kkk] == null) { roundedIndicators[kkk] = null; continue; }
      roundedIndicators[kkk] = Math.round(indicators[kkk] * 100) / 100;
    }

    // Pick candidate grip set based on shot type
    var grips;
    if (shotType === 'backhand') grips = BACKHAND_GRIPS;
    else if (shotType === 'serve') grips = SERVE_GRIPS;
    else grips = FOREHAND_GRIPS;

    // Score every candidate
    var rawScores = {};
    for (var gname in grips) {
      if (!grips.hasOwnProperty(gname)) continue;
      rawScores[gname] = gripScore(indicators, grips[gname]);
    }

    var dist = normalizeDistribution(rawScores);
    if (!dist) {
      return { detected_grip: null, confidence: 0, reason: 'insufficient-indicators', indicators: roundedIndicators, contact_frame_index: contactIdx };
    }

    // Pick winner
    var winner = null, winnerP = 0;
    for (var g in dist) {
      if (!dist.hasOwnProperty(g)) continue;
      if (dist[g] > winnerP) { winner = g; winnerP = dist[g]; }
    }
    var rounded = {};
    for (var rk in dist) { if (dist.hasOwnProperty(rk)) rounded[rk] = Math.round(dist[rk] * 1000) / 1000; }

    // Shot-match + recommendations
    var rule = SHOT_APPROPRIATE[shotType] || SHOT_APPROPRIATE['forehand'];
    var built = buildRecommendations(winner, shotType, indicators, level);
    var drills = drillIdsFor(winner, shotType, built.severity);

    return {
      detected_grip: winner,
      confidence: Math.round(winnerP * 1000) / 1000,
      distribution: rounded,
      indicators: roundedIndicators,
      shot_match: {
        appropriate: rule.expected.indexOf(winner) >= 0,
        severity: built.severity,
        expected: rule.expected.slice()
      },
      recommendations: built.recommendations,
      drill_ids: drills,
      contact_frame_index: contactIdx,
      handedness: handedness,
      notes: 'Rule-based kinematic classifier on 5 body-only indicators at contact frame.'
    };
  }

  var api = {
    analyzeGrip: analyzeGrip,
    // Exposed for unit tests / debugging
    _internals: {
      findContactFrame: findContactFrame,
      wristExtensionAtContact: wristExtensionAtContact,
      contactHeightRatio: contactHeightRatio,
      swingPlaneAngle: swingPlaneAngle,
      elbowAngleAtContact: elbowAngleAtContact,
      forearmPronationProxy: forearmPronationProxy,
      SHOT_APPROPRIATE: SHOT_APPROPRIATE
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.GripAnalysisEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
