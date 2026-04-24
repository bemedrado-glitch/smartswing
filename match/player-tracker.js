/**
 * SmartSwing AI — Match Analysis / Phase A — Multi-player tracker.
 *
 * Turns a stream of per-frame pose detections into stable player tracks.
 * Solves the "which detection in frame N corresponds to which player in
 * frame N+1?" problem using a minimum-cost assignment against recent
 * bounding-box centroids. Also manages track lifecycles (create on first
 * detection, drop on extended absence).
 *
 * This module is pure JS with no DOM or pose-library dependencies so it's
 * testable under Node. Phase A wires BlazePose MultiPose into the analyzer
 * and feeds its output into `PlayerTracker.advance()` — this file is the
 * piece that turns "6 unlabelled poses per frame" into "Player A + Player B
 * each across time."
 *
 * ## Input pose shape
 *   { bbox: { x, y, w, h }, keypoints: [...], score: 0..1 }
 *
 * The tracker only reads `bbox` and `score`. Keypoints pass through on the
 * returned tracks so downstream scoring code can do whatever it already
 * does with a single-pose stream.
 *
 * ## Public API
 *
 *   const tracker = new PlayerTracker({ maxAbsentFrames: 90 });
 *
 *   // Each frame:
 *   const assignments = tracker.advance(frameIdx, detectedPoses);
 *   // assignments = [ { trackId, pose, wasNew } ... ]
 *
 *   // After processing:
 *   const tracks = tracker.getTracks();
 *   // tracks = { trackA: { firstFrame, lastFrame, poses: [...], side }, ... }
 *
 *   // Helper: label tracks "near" / "far" by camera distance.
 *   tracker.labelSides({ canvasHeight });
 *
 *   // Helper: pick the subject by user hint.
 *   const subject = tracker.pickSubject({ side: 'near' });
 *
 * ## Design choices
 *
 * - Hungarian (Kuhn-Munkres) solves assignment optimally. On ≤6 poses per
 *   frame the O(n³) cost is irrelevant — a greedy nearest-neighbour would
 *   also work, but Hungarian is dramatically better when players briefly
 *   cross paths (changeovers, doubles patterns) because it considers all
 *   assignments jointly rather than one at a time.
 *
 * - Tracks die after `maxAbsentFrames` consecutive frames without an
 *   assignment. 90 frames at 30fps = 3 seconds — long enough to survive
 *   brief occlusions (umpire crossing, ball-boy), short enough that a
 *   player walking off court doesn't pollute the track list forever.
 *
 * - New tracks are born from unassigned detections — there's no limit on
 *   simultaneous tracks. Downstream filters can pick N highest-activity
 *   tracks as "actual players" and discard refs / coaches.
 */

'use strict';

// ── Pure math helpers ─────────────────────────────────────────────────

function _bboxCenter(bbox) {
  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
}

function _centerDistance(a, b) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Hungarian algorithm for rectangular cost matrices. Finds the minimum-cost
 * assignment of rows (existing tracks) to columns (new detections). Rows
 * left unassigned = tracks with no match this frame; columns unassigned =
 * new detections that will spawn new tracks.
 *
 * Implementation: Kuhn-Munkres in O(n³) over `max(rows, cols)`. Plenty fast
 * for realistic inputs (≤10 on either side). Costs must be finite; use a
 * large sentinel (e.g., 1e9) for "impossible" pairings.
 *
 * Returns `{ row: colAssignment, col: rowAssignment }` where -1 = unassigned.
 */
function hungarianAssign(costMatrix) {
  const nRows = costMatrix.length;
  const nCols = nRows ? costMatrix[0].length : 0;
  if (nRows === 0 || nCols === 0) {
    return { row: new Array(nRows).fill(-1), col: new Array(nCols).fill(-1) };
  }

  const n = Math.max(nRows, nCols);
  const BIG = 1e9;
  // Square-pad the matrix with BIG so we can use the classical algorithm.
  const C = [];
  for (let i = 0; i < n; i++) {
    C.push([]);
    for (let j = 0; j < n; j++) {
      C[i].push(i < nRows && j < nCols ? costMatrix[i][j] : BIG);
    }
  }

  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Decode: ans[row] = col
  const rowToCol = new Array(nRows).fill(-1);
  const colToRow = new Array(nCols).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j];
    if (i === 0) continue;
    // Mapping is for the padded matrix; only real rows/cols matter.
    if (i - 1 < nRows && j - 1 < nCols) {
      // Skip "impossible" assignments produced by the padding.
      if (costMatrix[i - 1][j - 1] < BIG) {
        rowToCol[i - 1] = j - 1;
        colToRow[j - 1] = i - 1;
      }
    }
  }
  return { row: rowToCol, col: colToRow };
}

// ── Tracker ───────────────────────────────────────────────────────────

class PlayerTracker {
  constructor(options = {}) {
    this.maxAbsentFrames = options.maxAbsentFrames != null ? options.maxAbsentFrames : 90;
    // Cost ceiling — two poses more than this far apart (pixels, roughly)
    // never match. Prevents a detection on one side of the court from
    // claiming a track on the other side when one disappears.
    this.maxMatchDistance = options.maxMatchDistance != null ? options.maxMatchDistance : 300;
    this._nextId = 1;
    this._tracks = {};   // trackId → { firstFrame, lastFrame, lastBox, poses, side }
  }

  /** Ingest one frame of detections; returns per-detection assignments. */
  advance(frameIdx, detections = []) {
    if (!Array.isArray(detections)) detections = [];

    const trackIds = Object.keys(this._tracks).filter(id => {
      const t = this._tracks[id];
      return (frameIdx - t.lastFrame) <= this.maxAbsentFrames;
    });

    // Build cost matrix: rows = existing tracks, cols = new detections.
    // Cost = centroid distance (pixels); detections beyond maxMatchDistance
    // are priced at the sentinel value so Hungarian won't pair them.
    const costs = trackIds.map(tid => {
      const lastBox = this._tracks[tid].lastBox;
      return detections.map(det => {
        const d = _centerDistance(lastBox, det.bbox);
        return d > this.maxMatchDistance ? 1e9 : d;
      });
    });

    const { row: trackToDet } = hungarianAssign(costs);

    const assignments = [];

    // Apply existing-track assignments.
    const assignedDets = new Set();
    trackIds.forEach((tid, rowIdx) => {
      const detIdx = trackToDet[rowIdx];
      if (detIdx < 0) return;
      const pose = detections[detIdx];
      assignedDets.add(detIdx);
      const t = this._tracks[tid];
      t.lastBox = pose.bbox;
      t.lastFrame = frameIdx;
      t.poses.push({ frameIdx, pose });
      assignments.push({ trackId: tid, pose, wasNew: false });
    });

    // Unassigned detections → new tracks.
    detections.forEach((pose, idx) => {
      if (assignedDets.has(idx)) return;
      const tid = 'track-' + this._nextId++;
      this._tracks[tid] = {
        firstFrame: frameIdx,
        lastFrame: frameIdx,
        lastBox: pose.bbox,
        poses: [{ frameIdx, pose }]
      };
      assignments.push({ trackId: tid, pose, wasNew: true });
    });

    // Expire tracks that have been absent too long.
    for (const id of Object.keys(this._tracks)) {
      if ((frameIdx - this._tracks[id].lastFrame) > this.maxAbsentFrames) {
        this._tracks[id].expired = true;
      }
    }

    return assignments;
  }

  /** Drop expired tracks from internal state (call periodically if memory matters). */
  pruneExpired() {
    for (const id of Object.keys(this._tracks)) {
      if (this._tracks[id].expired) delete this._tracks[id];
    }
  }

  /** Return all tracks (including expired ones, which carry `.expired: true`). */
  getTracks() {
    return this._tracks;
  }

  /**
   * Label every track 'near' or 'far' based on the average bbox Y across
   * its history. Players closer to the camera have higher Y values (bbox
   * bottom edge is lower on screen). Ties get broken by last Y seen.
   *
   * Only labels tracks with at least `minPoses` observations — avoids
   * labelling flicker detections (umpire walking behind baseline) as the
   * main player.
   */
  labelSides({ canvasHeight, minPoses = 10 } = {}) {
    const entries = Object.entries(this._tracks)
      .filter(([, t]) => t.poses.length >= minPoses);
    if (entries.length === 0) return;

    const withAvgY = entries.map(([id, t]) => {
      const sum = t.poses.reduce((acc, p) => acc + _bboxCenter(p.pose.bbox).y, 0);
      return { id, track: t, avgY: sum / t.poses.length };
    });

    // Sort by avgY descending: highest (closer to bottom of screen) is "near".
    withAvgY.sort((a, b) => b.avgY - a.avgY);
    withAvgY.forEach((entry, idx) => {
      entry.track.side = idx === 0 ? 'near' : (idx === 1 ? 'far' : 'other');
    });
  }

  /**
   * Pick the "subject" track — the player we'll analyse. Preference order:
   *   1. Explicit trackId via opts.trackId
   *   2. Side hint ('near' or 'far') — requires labelSides() to have run
   *   3. Highest-activity track (most poses observed)
   *
   * Returns { trackId, track } or null if no tracks.
   */
  pickSubject({ trackId, side, minPoses = 10 } = {}) {
    if (trackId && this._tracks[trackId]) {
      return { trackId, track: this._tracks[trackId] };
    }
    const entries = Object.entries(this._tracks)
      .filter(([, t]) => t.poses.length >= minPoses);
    if (entries.length === 0) return null;

    if (side) {
      const match = entries.find(([, t]) => t.side === side);
      if (match) return { trackId: match[0], track: match[1] };
    }

    // Fallback: highest pose count.
    entries.sort((a, b) => b[1].poses.length - a[1].poses.length);
    return { trackId: entries[0][0], track: entries[0][1] };
  }
}

// ── Exports (Node + browser) ─────────────────────────────────────────

const api = {
  PlayerTracker,
  // Exposed for tests.
  _internals: { hungarianAssign, _bboxCenter, _centerDistance }
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmartSwingPlayerTracker = api;
