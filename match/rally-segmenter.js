/**
 * SmartSwing AI — Match Analysis / Phase A — Rally segmentation + shot
 * classification.
 *
 * A match is mostly nothing: warmups, bouncing the ball, walking to the
 * baseline, wiping sweat. The swings we want to score are ~5% of the
 * frames. This module takes a subject player's pose timeline (from
 * player-tracker.js) and returns the list of *rally windows* where the
 * racket arm was genuinely active, plus a best-guess shot classification
 * for each.
 *
 * Zero DOM / zero pose-library deps — testable under Node. Phase A wires
 * this between the tracker and the existing scoring pipeline:
 *
 *   raw frames → multi-pose detector → PlayerTracker → RallySegmenter
 *                                                             ↓
 *                                              per-rally shot summaries
 *
 * ## Public API
 *
 *   const { segmentRallies, classifyShot } = window.SmartSwingRallySegmenter;
 *
 *   const rallies = segmentRallies(track.poses, {
 *     activationThreshold: 8,
 *     minRallyFrames: 12,
 *     mergeGap: 15,
 *     handedness: 'right'
 *   });
 *   // rallies: [{ startFrame, endFrame, peakFrame, peakActivation,
 *   //             frames: [...], shotType: 'forehand' }]
 *
 *   const shotType = classifyShot(frames, { handedness: 'right' });
 *   // 'forehand' | 'backhand' | 'serve' | 'volley' | 'unknown'
 *
 * ## Design
 *
 * 1. **Activation signal** — per-frame score proxying "how hard is the
 *    racket arm swinging right now?" Computed from the wrist's velocity
 *    relative to the shoulder + wrist height. High activation = swing
 *    likely in progress.
 *
 * 2. **Peak detection** — walk the activation series, find local peaks
 *    above `activationThreshold`. Each peak is a candidate contact frame.
 *
 * 3. **Windowing** — expand each peak into a window that captures the
 *    takeback + follow-through (± `windowRadius` frames around the peak).
 *
 * 4. **Merging** — windows closer than `mergeGap` frames merge into one
 *    rally (real rallies have multiple shots within 0.5s of each other;
 *    we want each as a distinct entry, but back-to-back false positives
 *    within 500ms should collapse).
 *
 * 5. **Shot classification** — at the peak frame, look at relative joint
 *    positions + trunk tilt to decide forehand/backhand/serve/volley.
 *    This is a geometric rule-based classifier — fast, transparent, and
 *    correct enough for rally-level segmentation. Future ML classifier
 *    can swap in without changing the module boundary.
 */

'use strict';

// ── Helpers ───────────────────────────────────────────────────────────

function _kp(pose, name) {
  if (!pose || !pose.keypoints) return null;
  // Support both array-of-objects with `name` + keyed-object forms.
  if (Array.isArray(pose.keypoints)) {
    return pose.keypoints.find(k => k && k.name === name) || null;
  }
  return pose.keypoints[name] || null;
}

function _dist(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function _sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function _mean(arr) { return arr.length ? _sum(arr) / arr.length : 0; }

// ── Activation signal ─────────────────────────────────────────────────

/**
 * Per-frame activation score. Combines:
 *   - wrist speed (dominant arm): swinging > walking
 *   - wrist above shoulder line: typical at contact for a real shot
 *   - trunk lean: idle standing has zero lean
 *
 * Returns an array of `{ frameIdx, activation }` aligned 1:1 with the
 * input pose list. First frame always has activation 0 (no previous
 * wrist to compare against).
 */
function computeActivation(poses, options = {}) {
  const handed = options.handedness === 'left' ? 'left' : 'right';
  const wristName = handed === 'right' ? 'right_wrist' : 'left_wrist';
  const shoulderName = handed === 'right' ? 'right_shoulder' : 'left_shoulder';
  const hipName = handed === 'right' ? 'right_hip' : 'left_hip';

  // Activation is a MOTION signal — everything it tracks is a delta between
  // consecutive frames. Idle (but visible) players score near zero; only
  // actual swinging raises the number. Previous versions mixed static
  // features (wrist-shoulder distance) which gave a ~25 floor even for
  // stationary poses and caused the threshold math to misfire.
  const series = [];
  let prevPose = null;

  for (let i = 0; i < poses.length; i++) {
    const entry = poses[i];
    const pose = entry.pose || entry;
    const frameIdx = entry.frameIdx != null ? entry.frameIdx : i;
    const wrist = _kp(pose, wristName);
    const shoulder = _kp(pose, shoulderName);
    const hip = _kp(pose, hipName);

    let activation = 0;
    if (prevPose) {
      const prevWrist = _kp(prevPose, wristName);
      const prevShoulder = _kp(prevPose, shoulderName);
      const prevHip = _kp(prevPose, hipName);

      // Main signal — wrist velocity (pixels per frame).
      if (wrist && prevWrist) activation += _dist(wrist, prevWrist);

      // Arm-extension change — captures the racket pulling away from the
      // body during takeback / follow-through. Scales the delta, not the
      // absolute distance, so idle poses contribute 0.
      if (wrist && shoulder && prevWrist && prevShoulder) {
        const extNow  = _dist(wrist, shoulder);
        const extPrev = _dist(prevWrist, prevShoulder);
        activation += Math.abs(extNow - extPrev) * 0.5;
      }

      // Trunk-lean change — torso rotation during a loaded swing.
      if (shoulder && hip && prevShoulder && prevHip) {
        const tiltNow  = shoulder.x - hip.x;
        const tiltPrev = prevShoulder.x - prevHip.x;
        activation += Math.abs(tiltNow - tiltPrev) * 0.4;
      }
    }

    series.push({ frameIdx, activation });
    prevPose = pose;
  }
  return series;
}

// ── Rally segmentation ───────────────────────────────────────────────

/**
 * Identify "rally windows" — continuous frame ranges where the subject
 * player is swinging. Each window is one shot. Multiple windows per match
 * are expected; this module makes no attempt to group windows into rallies
 * (that would need ball-tracking or audio, which Phase A deliberately
 * scopes out).
 *
 * Options:
 *   activationThreshold — min peak activation to count as a shot (default 8)
 *   minRallyFrames      — min window length (default 12 frames ≈ 0.4s at 30fps)
 *   windowRadius        — frames on each side of the peak (default 15)
 *   mergeGap            — windows closer than this merge into one (default 15)
 *   handedness          — 'right' | 'left'; picks which arm's wrist to watch
 */
function segmentRallies(poses, options = {}) {
  if (!Array.isArray(poses) || poses.length < 3) return [];

  const activationThreshold = options.activationThreshold != null ? options.activationThreshold : 8;
  const minRallyFrames = options.minRallyFrames != null ? options.minRallyFrames : 12;
  const windowRadius = options.windowRadius != null ? options.windowRadius : 15;
  const mergeGap = options.mergeGap != null ? options.mergeGap : 15;
  const handedness = options.handedness || 'right';

  const series = computeActivation(poses, { handedness });
  if (series.length < 3) return [];

  // Find local peaks above threshold (activation strictly greater than
  // both neighbours is a peak; flat plateaus take the midpoint).
  const peaks = [];
  for (let i = 1; i < series.length - 1; i++) {
    const a = series[i].activation;
    if (a < activationThreshold) continue;
    if (a >= series[i - 1].activation && a >= series[i + 1].activation) {
      peaks.push({ idx: i, frameIdx: series[i].frameIdx, activation: a });
    }
  }
  if (peaks.length === 0) return [];

  // Expand peaks into windows.
  let windows = peaks.map(p => ({
    startIdx: Math.max(0, p.idx - windowRadius),
    endIdx: Math.min(series.length - 1, p.idx + windowRadius),
    peakIdx: p.idx,
    peakFrame: p.frameIdx,
    peakActivation: Math.round(p.activation * 100) / 100
  }));

  // Merge overlapping / very-close windows.
  windows.sort((a, b) => a.startIdx - b.startIdx);
  const merged = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && (w.startIdx - last.endIdx) <= mergeGap) {
      last.endIdx = Math.max(last.endIdx, w.endIdx);
      if (w.peakActivation > last.peakActivation) {
        last.peakIdx = w.peakIdx;
        last.peakFrame = w.peakFrame;
        last.peakActivation = w.peakActivation;
      }
    } else {
      merged.push({ ...w });
    }
  }

  // Drop windows too short to represent a real shot.
  const validWindows = merged.filter(w => (w.endIdx - w.startIdx + 1) >= minRallyFrames);

  // Realise each window into a rally object with its frame slice + shot
  // classification. The shot classifier reads the peak frame's geometry.
  return validWindows.map(w => {
    const frames = poses.slice(w.startIdx, w.endIdx + 1);
    const peakEntry = poses[w.peakIdx];
    const peakPose = (peakEntry && peakEntry.pose) || peakEntry;
    const shotType = classifyShot([peakPose], { handedness });
    return {
      startFrame: series[w.startIdx].frameIdx,
      endFrame: series[w.endIdx].frameIdx,
      peakFrame: w.peakFrame,
      peakActivation: w.peakActivation,
      frames,
      shotType
    };
  });
}

// ── Shot classification ──────────────────────────────────────────────

/**
 * Decide forehand / backhand / serve / volley / unknown from a pose.
 * Rule-based — not perfect but fast, deterministic, and good enough for
 * rally labelling. If `poses` is an array, we use the middle pose (near
 * contact) as the reference.
 *
 * Heuristics:
 *   - Wrist above top of head → serve (overhead motion)
 *   - Wrist on dominant side + wrist below shoulder → forehand (baseline)
 *   - Wrist on non-dominant side + trunk twisted → backhand
 *   - Wrist at or above shoulder but below head + body facing net → volley
 */
function classifyShot(poses, options = {}) {
  if (!poses || !poses.length) return 'unknown';
  const handed = options.handedness === 'left' ? 'left' : 'right';
  const pose = Array.isArray(poses) ? poses[Math.floor(poses.length / 2)] : poses;
  if (!pose) return 'unknown';

  const wrist = _kp(pose, handed === 'right' ? 'right_wrist' : 'left_wrist');
  const shoulder = _kp(pose, handed === 'right' ? 'right_shoulder' : 'left_shoulder');
  const oppShoulder = _kp(pose, handed === 'right' ? 'left_shoulder' : 'right_shoulder');
  const nose = _kp(pose, 'nose');
  const hip = _kp(pose, handed === 'right' ? 'right_hip' : 'left_hip');

  if (!wrist || !shoulder) return 'unknown';

  // 1. Serve: wrist substantially above the nose (overhead extension).
  if (nose && wrist.y < nose.y - 20) {
    return 'serve';
  }

  // 2. Volley: wrist between shoulder and nose, body relatively upright.
  //    (Volley = punch block; torso minimally rotated, wrist near face height.)
  if (nose && shoulder && wrist.y < shoulder.y && wrist.y > nose.y - 5) {
    const torsoTilt = oppShoulder ? Math.abs(shoulder.y - oppShoulder.y) : 0;
    if (torsoTilt < 20) return 'volley';
  }

  // 3. Forehand vs backhand — look at wrist horizontal position relative to
  //    the trunk center. Right-handed forehand: wrist sits on the right of
  //    both shoulders at contact. Backhand: wrist on the LEFT (crosses over).
  if (oppShoulder) {
    const torsoCenterX = (shoulder.x + oppShoulder.x) / 2;
    const wristSide = wrist.x - torsoCenterX;
    // Threshold: ~15 pixels of offset required. Within ±15 we call it
    // ambiguous (probably a ready position, not a swing peak).
    if (handed === 'right') {
      if (wristSide > 15) return 'forehand';
      if (wristSide < -15) return 'backhand';
    } else {
      if (wristSide < -15) return 'forehand';
      if (wristSide > 15) return 'backhand';
    }
  }

  // 4. Fallback: low wrist + hip visible → assume groundstroke, bias to FH.
  if (hip && wrist.y > hip.y - 30) return 'forehand';

  return 'unknown';
}

// ── Exports ──────────────────────────────────────────────────────────

const api = {
  segmentRallies,
  classifyShot,
  computeActivation,
  // Exposed for tests.
  _internals: { _kp, _dist, _sum, _mean }
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmartSwingRallySegmenter = api;
