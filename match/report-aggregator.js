/**
 * SmartSwing AI — Match Analysis / Phase A — Match report aggregator.
 *
 * Turns the raw output of a match-mode session — the rally events emitted
 * by MatchProcessor + the subject's full pose history — into the shape
 * consumed by match-report.html: timeline entries with timestamps, a
 * shot-type breakdown, and the per-rally pose windows needed for the
 * (paywalled) per-rally drill-down view.
 *
 * Zero DOM / zero pose-library deps. Pure JS so the aggregation logic is
 * Node-testable and the same function produces both the preview-tier
 * summary and the paid-tier drill-down payload — the rendering layer
 * decides what to show based on plan tier.
 *
 * ## Public API
 *
 *   const { aggregateMatch, buildTimeline, pickHighlights } =
 *     window.SmartSwingMatchReport;
 *
 *   const report = aggregateMatch({
 *     rallies,          // array of { peakFrame, startFrame?, endFrame?, shotType }
 *     subjectTrack,     // { poses: [{frameIdx, pose}] } — for drill-down windows
 *     fps: 30,          // for timestamp conversion
 *     handedness: 'right'
 *   });
 *
 *   // report:
 *   // {
 *   //   rallyCount: 27,
 *   //   shotBreakdown: { forehand: 12, backhand: 8, serve: 4, volley: 3 },
 *   //   shotBreakdownPct: { forehand: 0.44, ... },
 *   //   totalDurationFrames: 4350,
 *   //   totalDurationSeconds: 145,
 *   //   avgRallyDurationFrames: 48,
 *   //   avgRallyDurationSeconds: 1.6,
 *   //   longestRallyFrames: 120,
 *   //   longestRallyIdx: 17,
 *   //   firstFrame: 240,
 *   //   lastFrame: 9840,
 *   //   rallies: [{
 *   //     id: 'rally-1',
 *   //     peakFrame, startFrame, endFrame,
 *   //     peakTime, startTime, endTime,
 *   //     durationFrames, durationSeconds,
 *   //     shotType,
 *   //     poses: [{frameIdx, pose}]   // only when `includePoses: true`
 *   //   }]
 *   // }
 */

'use strict';

const DEFAULT_SHOT_TYPES = ['serve', 'forehand', 'backhand', 'volley', 'unknown'];

function _roundTo(n, decimals = 2) {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

function _clampWindow(rally, allPoses, windowPad) {
  // A rally event's peakFrame is the detected motion apex. The `poses` window
  // for drill-down covers `windowPad` frames either side, clamped to the
  // track's pose availability. If the rally already carries explicit start/
  // endFrame, those take precedence.
  if (!allPoses || allPoses.length === 0) return [];
  const start = rally.startFrame != null
    ? rally.startFrame
    : Math.max(0, rally.peakFrame - windowPad);
  const end = rally.endFrame != null
    ? rally.endFrame
    : (rally.peakFrame + windowPad);
  return allPoses.filter(p => p.frameIdx >= start && p.frameIdx <= end);
}

function _normaliseShotType(t) {
  if (!t) return 'unknown';
  const lower = String(t).toLowerCase();
  if (DEFAULT_SHOT_TYPES.indexOf(lower) >= 0) return lower;
  return 'unknown';
}

/**
 * Main aggregation entry point.
 *
 * @param {Object} input
 * @param {Array}  input.rallies       - rally events from MatchProcessor.
 * @param {Object} [input.subjectTrack] - the picked track; its poses[] fuels drill-down.
 * @param {number} [input.fps=30]
 * @param {number} [input.windowPad=20] - frames either side of peak when a rally lacks explicit bounds.
 * @param {boolean}[input.includePoses=false] - when true, embeds per-rally pose windows (drill-down payload).
 * @returns {Object} structured report
 */
function aggregateMatch(input = {}) {
  const rallies = Array.isArray(input.rallies) ? input.rallies.slice() : [];
  const fps = input.fps || 30;
  const windowPad = input.windowPad != null ? input.windowPad : 20;
  const includePoses = !!input.includePoses;
  const subjectPoses = input.subjectTrack && Array.isArray(input.subjectTrack.poses)
    ? input.subjectTrack.poses
    : [];

  // Sort by peakFrame so downstream consumers can trust timeline order.
  rallies.sort((a, b) => (a.peakFrame || 0) - (b.peakFrame || 0));

  const shotBreakdown = {};
  DEFAULT_SHOT_TYPES.forEach(s => { shotBreakdown[s] = 0; });

  let totalDurationFrames = 0;
  let longestRallyFrames = 0;
  let longestRallyIdx = -1;
  let firstFrame = null;
  let lastFrame = null;

  const processedRallies = rallies.map((rally, idx) => {
    const shot = _normaliseShotType(rally.shotType || rally.shot);
    shotBreakdown[shot] = (shotBreakdown[shot] || 0) + 1;

    const start = rally.startFrame != null
      ? rally.startFrame
      : Math.max(0, rally.peakFrame - windowPad);
    const end = rally.endFrame != null
      ? rally.endFrame
      : (rally.peakFrame + windowPad);
    const durationFrames = Math.max(1, end - start);

    totalDurationFrames += durationFrames;
    if (durationFrames > longestRallyFrames) {
      longestRallyFrames = durationFrames;
      longestRallyIdx = idx;
    }
    if (firstFrame == null || start < firstFrame) firstFrame = start;
    if (lastFrame == null  || end   > lastFrame)  lastFrame  = end;

    const entry = {
      id: 'rally-' + (idx + 1),
      peakFrame: rally.peakFrame,
      startFrame: start,
      endFrame: end,
      durationFrames,
      durationSeconds: _roundTo(durationFrames / fps, 2),
      peakTime:  _roundTo(rally.peakFrame / fps, 2),
      startTime: _roundTo(start / fps, 2),
      endTime:   _roundTo(end / fps, 2),
      shotType: shot,
      // Surface the raw classifier confidence if the segmenter provided one.
      shotConfidence: rally.shotConfidence != null ? rally.shotConfidence : null,
      peakActivation: rally.peakActivation != null ? rally.peakActivation : null
    };

    if (includePoses) {
      entry.poses = _clampWindow(rally, subjectPoses, windowPad);
    }

    return entry;
  });

  // Pct breakdown — rounded to whole percents, remainder balanced so the
  // values always sum to 100 exactly (prevents "44% + 30% + 26% = 99%" UI bugs).
  const shotBreakdownPct = {};
  const totalCount = processedRallies.length;
  if (totalCount > 0) {
    let remainder = 100;
    const entries = Object.entries(shotBreakdown).filter(([, c]) => c > 0);
    entries.forEach(([shot, count], i) => {
      if (i === entries.length - 1) {
        shotBreakdownPct[shot] = remainder;
      } else {
        const pct = Math.round((count / totalCount) * 100);
        shotBreakdownPct[shot] = pct;
        remainder -= pct;
      }
    });
    // Zero-count shots still appear in breakdown but not in pct.
  }

  return {
    rallyCount: processedRallies.length,
    shotBreakdown,
    shotBreakdownPct,
    totalDurationFrames,
    totalDurationSeconds: _roundTo(totalDurationFrames / fps, 2),
    avgRallyDurationFrames: totalCount ? Math.round(totalDurationFrames / totalCount) : 0,
    avgRallyDurationSeconds: totalCount ? _roundTo((totalDurationFrames / totalCount) / fps, 2) : 0,
    longestRallyFrames,
    longestRallyIdx,
    firstFrame: firstFrame != null ? firstFrame : 0,
    lastFrame:  lastFrame  != null ? lastFrame  : 0,
    spanFrames: (lastFrame != null && firstFrame != null) ? (lastFrame - firstFrame) : 0,
    spanSeconds: (lastFrame != null && firstFrame != null)
      ? _roundTo((lastFrame - firstFrame) / fps, 2)
      : 0,
    fps,
    handedness: input.handedness || 'right',
    rallies: processedRallies
  };
}

/**
 * Produce a compact timeline-strip payload for the UI: one entry per rally
 * with the minimum info needed to render the strip (id, label, position%,
 * duration%, shot type). Positions are relative to the match span so the
 * strip is a proportional sparkline regardless of total length.
 */
function buildTimeline(report) {
  if (!report || !Array.isArray(report.rallies) || report.rallies.length === 0) {
    return { entries: [], spanSeconds: 0 };
  }
  const span = Math.max(1, report.spanFrames || 1);
  const origin = report.firstFrame || 0;
  const entries = report.rallies.map((r, idx) => ({
    id: r.id,
    idx,
    label: r.shotType,
    shotType: r.shotType,
    startPct: _roundTo(((r.startFrame - origin) / span) * 100, 2),
    widthPct: _roundTo(((r.endFrame - r.startFrame) / span) * 100, 2),
    durationSeconds: r.durationSeconds,
    peakTime: r.peakTime
  }));
  return {
    entries,
    spanSeconds: report.spanSeconds,
    firstFrame: report.firstFrame,
    lastFrame:  report.lastFrame
  };
}

/**
 * Return the N most "interesting" rallies — currently the longest ones,
 * since rally length correlates with match quality moments (long rallies
 * are where technique shows up most). Used by the preview tier to show
 * Starter/Player users a compelling taste of what they'd unlock.
 */
function pickHighlights(report, n = 3) {
  if (!report || !Array.isArray(report.rallies)) return [];
  return report.rallies
    .slice()
    .sort((a, b) => b.durationFrames - a.durationFrames)
    .slice(0, Math.max(0, n));
}

// ── Exports ──────────────────────────────────────────────────────────

const api = {
  aggregateMatch,
  buildTimeline,
  pickHighlights,
  // Exposed for tests.
  _internals: { _roundTo, _clampWindow, _normaliseShotType, DEFAULT_SHOT_TYPES }
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmartSwingMatchReport = api;
