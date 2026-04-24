/**
 * SmartSwing AI — Match Analysis / Phase A follow-up — Per-rally scorer.
 *
 * The match-report drill-down (paid tier) now shows a biomechanics score
 * per rally alongside shot type + duration. Runs a lightweight version of
 * analyze.html's angle-deviation scorer against each rally's pose window:
 *
 *   1. Compute the three canonical angles (shoulder, elbow, trunk) from
 *      each frame in the rally window.
 *   2. Average over the window.
 *   3. Score each angle against the shot-specific benchmark band.
 *   4. Return a 0-100 rally grade + per-angle breakdown.
 *
 * Intentional simplifications vs. the full analyzer:
 *   - No velocity / ROM blending. A rally window is ~40 frames — not
 *     enough for robust velocity measurement, and the deep kinetic-chain
 *     breakdown belongs on the single-swing page. Per-rally score is a
 *     "quality at a glance" grade, not a full assessment.
 *   - No profile-level adjustment. Match reports show the subject's
 *     performance as-measured; the player's level context lives on the
 *     report summary, not per-rally.
 *
 * Pure-JS, Node-testable, zero pose-library deps.
 */

'use strict';

// Canonical BlazePose / MoveNet keypoint name → index (MoveNet ordering).
// Matches the tracker + segmenter conventions already used upstream.
const KP = {
  LEFT_SHOULDER:  5, RIGHT_SHOULDER:  6,
  LEFT_ELBOW:     7, RIGHT_ELBOW:     8,
  LEFT_WRIST:     9, RIGHT_WRIST:    10,
  LEFT_HIP:      11, RIGHT_HIP:      12,
  LEFT_KNEE:     13, RIGHT_KNEE:     14
};

// Simplified benchmarks — enough to produce a meaningful "how clean was
// this swing" number. Sourced by extracting the shipping PRO_BENCHMARKS
// entries from analyze.html for the three most informative angles.
const BENCHMARKS = {
  forehand: {
    shoulder: { min: 70, max: 135, optimal: 105 },
    elbow:    { min: 90, max: 160, optimal: 135 },
    trunk:    { min: 25, max:  55, optimal:  40 }
  },
  backhand: {
    shoulder: { min: 80, max: 140, optimal: 110 },
    elbow:    { min: 95, max: 165, optimal: 140 },
    trunk:    { min: 30, max:  60, optimal:  45 }
  },
  serve: {
    shoulder: { min: 130, max: 175, optimal: 165 },
    elbow:    { min: 110, max: 170, optimal: 150 },
    trunk:    { min:  10, max:  45, optimal:  25 }
  },
  volley: {
    shoulder: { min: 60, max: 120, optimal: 90 },
    elbow:    { min: 80, max: 140, optimal: 115 },
    trunk:    { min: 15, max:  40, optimal:  28 }
  },
  unknown: {
    shoulder: { min: 70, max: 140, optimal: 105 },
    elbow:    { min: 90, max: 160, optimal: 135 },
    trunk:    { min: 20, max:  55, optimal:  38 }
  }
};

// ── Geometry helpers ─────────────────────────────────────────────────

function _angleBetween(a, b, c) {
  // Angle at vertex b formed by ba and bc, in degrees (0..180).
  if (!a || !b || !c) return null;
  var radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  var angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

function _getKp(kps, idx) {
  if (!Array.isArray(kps) || !kps[idx]) return null;
  var kp = kps[idx];
  // Confidence gate — match analyze.html's 0.3 threshold.
  if ((kp.score != null && kp.score < 0.3) || (kp.confidence != null && kp.confidence < 0.3)) return null;
  return { x: kp.x, y: kp.y };
}

function _lineTilt(a, b) {
  if (!a || !b) return null;
  var angle = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI));
  if (angle > 90) angle = 180 - angle;
  return angle;
}

// Pick the dominant side based on which wrist is higher (serve) or which
// elbow is more extended. For our purposes "right side" is good enough —
// handedness is a rally-wide concept the caller already knows.
function _sideKpSuffix(handedness) {
  return String(handedness || 'right').toLowerCase() === 'left' ? 'LEFT' : 'RIGHT';
}

/**
 * Compute the three canonical angles from a single pose's keypoints.
 * Returns { shoulder, elbow, trunk } with null for any angle where
 * required keypoints are below confidence threshold.
 */
function computeFrameAngles(pose, handedness) {
  if (!pose || !Array.isArray(pose.keypoints)) return { shoulder: null, elbow: null, trunk: null };
  var kps = pose.keypoints;
  var side = _sideKpSuffix(handedness);
  var shoulder = _getKp(kps, KP[side + '_SHOULDER']);
  var elbow    = _getKp(kps, KP[side + '_ELBOW']);
  var wrist    = _getKp(kps, KP[side + '_WRIST']);
  var hip      = _getKp(kps, KP[side + '_HIP']);
  var oppShoulder = _getKp(kps, KP[(side === 'LEFT' ? 'RIGHT' : 'LEFT') + '_SHOULDER']);
  var oppHip      = _getKp(kps, KP[(side === 'LEFT' ? 'RIGHT' : 'LEFT') + '_HIP']);

  // Shoulder angle: hip → shoulder → elbow. Measures shoulder extension/
  // rotation through the swing — the hallmark of load + drive.
  var shoulderAngle = _angleBetween(hip, shoulder, elbow);

  // Elbow angle: shoulder → elbow → wrist. Bigger = more arm extension at
  // contact (generally good for forehand/serve), smaller = more compact
  // (good for backhand).
  var elbowAngle = _angleBetween(shoulder, elbow, wrist);

  // Trunk tilt: angle of the shoulder-line relative to hip-line, mapped
  // into 0..90 so the "flat" baseline reads as ~0 and aggressive load
  // reads higher. Proxy for torso rotation.
  var shoulderLineTilt = _lineTilt(shoulder, oppShoulder);
  var hipLineTilt      = _lineTilt(hip, oppHip);
  var trunkTilt = (shoulderLineTilt != null && hipLineTilt != null)
    ? Math.abs(shoulderLineTilt - hipLineTilt)
    : shoulderLineTilt;

  return {
    shoulder: shoulderAngle != null ? Math.round(shoulderAngle) : null,
    elbow:    elbowAngle    != null ? Math.round(elbowAngle)    : null,
    trunk:    trunkTilt     != null ? Math.round(trunkTilt)     : null
  };
}

// Average non-null values in an array. Returns null for empty.
function _avg(values) {
  var list = (values || []).filter(function (v) { return v != null && Number.isFinite(v); });
  if (!list.length) return null;
  return list.reduce(function (a, b) { return a + b; }, 0) / list.length;
}

/**
 * Deviation window scorer mirroring analyze.html:_windowedScore.
 * Used identically so rally scores stay consistent with single-swing scores.
 */
function _windowedScore(current, benchmark) {
  if (current == null || !benchmark) return null;
  var range = Math.max(1, benchmark.max - benchmark.min);
  var target = benchmark.optimal;
  var deviation = Math.abs(current - target);
  var softWindow = Math.max(4, range * 0.28);
  var goodWindow = Math.max(8, range * 0.55);
  var fairWindow = Math.max(12, range * 0.95);
  var score;
  if (deviation <= softWindow)      score = 100 - ((deviation / softWindow) * 8);
  else if (deviation <= goodWindow) score = 92 - (((deviation - softWindow) / Math.max(1, goodWindow - softWindow)) * 14);
  else if (deviation <= fairWindow) score = 78 - (((deviation - goodWindow) / Math.max(1, fairWindow - goodWindow)) * 18);
  else                              score = 60 - Math.min(42, ((deviation - fairWindow) / Math.max(1, fairWindow)) * 28);
  return Math.max(18, Math.min(100, Math.round(score)));
}

/**
 * Score a single rally. Returns:
 * {
 *   overallScore, grade, subscores: { shoulder, elbow, trunk },
 *   avgAngles: { shoulder, elbow, trunk },
 *   shotType, frameCount, confident: boolean
 * }
 *
 * `confident` is false when fewer than `minConfidentFrames` frames yielded
 * valid angles — the UI uses this to show a "—" score and a "data thin"
 * note rather than rendering a misleading number.
 */
function scoreRally(rally, options) {
  var opts = options || {};
  var handedness = opts.handedness || 'right';
  var minConfidentFrames = opts.minConfidentFrames != null ? opts.minConfidentFrames : 6;
  var rawShot = rally && rally.shotType ? String(rally.shotType).toLowerCase() : 'unknown';
  // Normalise to 'unknown' if the shot type has no matching benchmark set —
  // the UI can then distinguish "scored against a known template" from
  // "scored against the fallback band".
  var shot = BENCHMARKS[rawShot] ? rawShot : 'unknown';
  var bench = BENCHMARKS[shot];
  var poses = rally && Array.isArray(rally.poses) ? rally.poses : [];

  var perFrame = poses.map(function (entry) {
    // rally.poses entries from the aggregator have shape { frameIdx, pose }.
    // But older handoff payloads may pass raw pose objects — support both.
    var pose = entry && entry.pose ? entry.pose : entry;
    return computeFrameAngles(pose, handedness);
  });

  var avg = {
    shoulder: _avg(perFrame.map(function (a) { return a.shoulder; })),
    elbow:    _avg(perFrame.map(function (a) { return a.elbow; })),
    trunk:    _avg(perFrame.map(function (a) { return a.trunk; }))
  };

  var confidentFrames = perFrame.filter(function (a) {
    return a.shoulder != null && a.elbow != null;
  }).length;
  var confident = confidentFrames >= minConfidentFrames;

  var subscores = {
    shoulder: _windowedScore(avg.shoulder, bench.shoulder),
    elbow:    _windowedScore(avg.elbow,    bench.elbow),
    trunk:    _windowedScore(avg.trunk,    bench.trunk)
  };

  // Weights: shoulder 45%, elbow 35%, trunk 20%. Shoulder is the biggest
  // kinetic-chain signal, elbow governs contact geometry, trunk adds
  // coarse torso engagement. Keeps shape consistent with single-swing.
  var weights = { shoulder: 0.45, elbow: 0.35, trunk: 0.20 };
  var totalWeight = 0, weighted = 0;
  Object.keys(weights).forEach(function (k) {
    if (subscores[k] != null) {
      weighted += subscores[k] * weights[k];
      totalWeight += weights[k];
    }
  });
  var overall = totalWeight > 0 ? Math.round(weighted / totalWeight) : null;

  return {
    shotType: shot,
    frameCount: poses.length,
    confidentFrames: confidentFrames,
    confident: confident,
    avgAngles: {
      shoulder: avg.shoulder != null ? Math.round(avg.shoulder) : null,
      elbow:    avg.elbow    != null ? Math.round(avg.elbow)    : null,
      trunk:    avg.trunk    != null ? Math.round(avg.trunk)    : null
    },
    subscores: subscores,
    overallScore: confident ? overall : null,
    grade: confident ? _grade(overall) : null
  };
}

function _grade(score) {
  if (score == null) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Convenience: score every rally in a report payload.
 * Mutates each rally entry to carry a `score` field.
 */
function scoreAllRallies(report, options) {
  if (!report || !Array.isArray(report.rallies)) return report;
  report.rallies.forEach(function (rally) {
    var result = scoreRally(rally, options);
    rally.score = result.overallScore;
    rally.grade = result.grade;
    rally.scoreBreakdown = result;
  });
  return report;
}

// ── Exports ──────────────────────────────────────────────────────────

var api = {
  scoreRally: scoreRally,
  scoreAllRallies: scoreAllRallies,
  computeFrameAngles: computeFrameAngles,
  BENCHMARKS: BENCHMARKS,
  _internals: { _windowedScore: _windowedScore, _angleBetween: _angleBetween, _avg: _avg }
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmartSwingRallyScorer = api;
