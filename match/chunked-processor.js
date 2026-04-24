/**
 * SmartSwing AI — Match Analysis / Phase A — Chunked long-video processor.
 *
 * A 90-minute match at 30fps is 162,000 frames. Holding every pose in
 * memory blows past ~200MB; running the rally segmenter on all of them
 * at once also spikes CPU. The chunked processor streams frames through
 * the tracker incrementally, emitting rallies as they're discovered and
 * pruning stale state between chunks.
 *
 * Zero DOM / zero pose-library deps — same discipline as PRs 1-2 so the
 * test suite runs under Node. The analyzer wiring (PR 4) feeds real
 * BlazePose detections through this module.
 *
 * ## Design
 *
 * 1. **Chunk sizing.** Default 900 frames ≈ 30s at 30fps. Each chunk runs
 *    the tracker on every frame, then periodically feeds the subject
 *    player's accumulated poses to the segmenter to discover rallies.
 *
 * 2. **Boundary safety.** Rally peaks near the chunk edge could belong
 *    to swings that extend into the next chunk. We keep an `overlapFrames`
 *    buffer (default 60 = 2s): rallies whose peak falls inside this tail
 *    are *deferred* — the next chunk gets to see them too before they're
 *    emitted. Duplicate-peak detection prevents double-counting.
 *
 * 3. **Memory bounds.** After each chunk:
 *    - Tracks with no poses in the last `retainFrames` (default 300) are
 *      dropped from the tracker entirely (pruneExpired).
 *    - The subject track is truncated to the last `retainFrames` entries
 *      (we keep enough history for the next overlap window; earlier poses
 *      are already covered by the rallies we've emitted).
 *    - Non-subject tracks' pose lists are cleared (we know they're not the
 *      player we care about; only their bounding box for track continuity
 *      matters from here on).
 *
 * 4. **Progress + events.** Callbacks let the caller show a progress bar,
 *    render rallies as they land, and react to completion. Each rally is
 *    emitted exactly once, in order of peak frame.
 *
 * ## Public API
 *
 *   const { MatchProcessor } = window.SmartSwingMatchProcessor;
 *
 *   const processor = new MatchProcessor({
 *     tracker,              // PlayerTracker instance (from PR 1)
 *     chunkSize: 900,       // frames per chunk
 *     overlapFrames: 60,    // rolling buffer at chunk boundary
 *     retainFrames: 300,    // how many recent subject poses to keep
 *     handedness: 'right',
 *     subjectHint: { side: 'near' },  // how pickSubject decides
 *     segmenterOpts: { activationThreshold: 8, minRallyFrames: 12 }
 *   });
 *
 *   processor.on('rally',    (rally) => { ... });
 *   processor.on('progress', ({ framesProcessed, rallyCount }) => { ... });
 *   processor.on('complete', (summary) => { ... });
 *
 *   // For each detected pose array per frame:
 *   processor.ingest(frameIdx, detections);
 *
 *   // When the video ends:
 *   processor.finish();
 */

'use strict';

// Accept either the Node export shape or the browser global.
function _loadModule(nodeName, windowKey) {
  if (typeof require !== 'undefined') {
    try { return require(nodeName); } catch (_) {}
  }
  if (typeof window !== 'undefined' && window[windowKey]) {
    return window[windowKey];
  }
  return null;
}

const _trackerModule = _loadModule('./player-tracker.js', 'SmartSwingPlayerTracker');
const _segmenterModule = _loadModule('./rally-segmenter.js', 'SmartSwingRallySegmenter');

class MatchProcessor {
  constructor(options = {}) {
    if (!_trackerModule || !_segmenterModule) {
      throw new Error('MatchProcessor requires player-tracker.js + rally-segmenter.js to be loaded first.');
    }
    const { PlayerTracker } = _trackerModule;
    const { segmentRallies } = _segmenterModule;
    this._segmentRallies = segmentRallies;

    // Accept an injected tracker (for tests + resume scenarios) or create one.
    this.tracker = options.tracker || new PlayerTracker({
      maxAbsentFrames: options.trackerAbsentFrames || 90,
      maxMatchDistance: options.trackerMaxDistance || 300
    });

    this.chunkSize      = options.chunkSize      != null ? options.chunkSize      : 900;
    this.overlapFrames  = options.overlapFrames  != null ? options.overlapFrames  : 60;
    this.retainFrames   = options.retainFrames   != null ? options.retainFrames   : 300;
    this.handedness     = options.handedness || 'right';
    this.subjectHint    = options.subjectHint || { side: 'near' };
    this.segmenterOpts  = Object.assign(
      { handedness: this.handedness },
      options.segmenterOpts || {}
    );
    this.canvasHeight   = options.canvasHeight   || 720;

    this._framesInChunk = 0;
    this._totalFrames = 0;
    this._emittedPeaks = new Set(); // dedupe by peak frame index
    this._rallyCount = 0;
    this._handlers = { rally: [], progress: [], complete: [] };
  }

  /** Register an event handler. Event names: 'rally' | 'progress' | 'complete'. */
  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return this;
  }

  _emit(event, payload) {
    (this._handlers[event] || []).forEach(fn => {
      try { fn(payload); } catch (err) {
        // Never let a user handler break the processor.
        console.error('[MatchProcessor] handler for', event, 'threw:', err);
      }
    });
  }

  /**
   * Ingest one frame of detections. Drives the tracker forward and,
   * when the chunk fills up, runs rally segmentation on the subject
   * track's accumulated poses.
   */
  ingest(frameIdx, detections) {
    this.tracker.advance(frameIdx, detections || []);
    this._framesInChunk++;
    this._totalFrames++;

    if (this._framesInChunk >= this.chunkSize) {
      this._flushChunk(frameIdx, /*isFinal*/ false);
    }
  }

  /**
   * Flush the tail — call once after the last frame is ingested. Emits
   * any remaining rallies and the completion summary.
   */
  finish() {
    if (this._framesInChunk > 0) {
      // Use the last-seen frame index as the chunk boundary; finding it
      // requires inspecting tracks (tracker.advance updates lastFrame).
      let lastFrameIdx = 0;
      for (const t of Object.values(this.tracker.getTracks())) {
        if (t.lastFrame > lastFrameIdx) lastFrameIdx = t.lastFrame;
      }
      this._flushChunk(lastFrameIdx, /*isFinal*/ true);
    }
    this._emit('complete', {
      framesProcessed: this._totalFrames,
      rallyCount: this._rallyCount,
      tracks: this.tracker.getTracks()
    });
  }

  /**
   * Run rally segmentation on the current subject track. Emits new
   * rallies (those with peakFrame older than the overlap tail, or all
   * of them on the final chunk) and prunes retained state so memory
   * stays bounded.
   */
  _flushChunk(chunkEndFrame, isFinal) {
    // Label sides + pick the subject track on every flush. Sides can
    // shift slightly as more data arrives (flicker tracks get more data
    // and either qualify or don't); re-labelling ensures the subject
    // selection stays stable.
    this.tracker.labelSides({ canvasHeight: this.canvasHeight });
    const subject = this.tracker.pickSubject(this.subjectHint);

    if (subject && subject.track && Array.isArray(subject.track.poses) && subject.track.poses.length >= 3) {
      const rallies = this._segmentRallies(subject.track.poses, this.segmenterOpts);

      // Stable ordering so emission is deterministic.
      rallies.sort((a, b) => a.peakFrame - b.peakFrame);

      // Cutoff: on the final chunk emit everything; otherwise defer any
      // rally whose peak is inside the overlap tail (it may still extend
      // into the next chunk's data).
      const cutoff = isFinal
        ? Infinity
        : (chunkEndFrame - this.overlapFrames);

      for (const rally of rallies) {
        if (rally.peakFrame > cutoff) break; // rallies are sorted; rest are deferred
        if (this._emittedPeaks.has(rally.peakFrame)) continue;
        this._emittedPeaks.add(rally.peakFrame);
        this._rallyCount++;
        this._emit('rally', rally);
      }
    }

    // Memory bookkeeping — prune expired tracks + trim retained poses.
    this.tracker.pruneExpired();
    if (subject && subject.track && subject.track.poses.length > this.retainFrames) {
      subject.track.poses = subject.track.poses.slice(-this.retainFrames);
    }
    // Non-subject tracks don't need their pose history for continuity —
    // only the bbox for Hungarian matching. Clearing their `poses` arrays
    // prevents long matches from growing unbounded on every other person
    // who happens to step on court (umpires, ball-boys, coaches).
    for (const [tid, t] of Object.entries(this.tracker.getTracks())) {
      if (subject && tid === subject.trackId) continue;
      if (t.poses && t.poses.length > 4) t.poses = t.poses.slice(-4);
    }

    this._framesInChunk = 0;
    this._emit('progress', {
      framesProcessed: this._totalFrames,
      rallyCount: this._rallyCount
    });
  }
}

const api = {
  MatchProcessor,
  // Exposed for tests.
  _internals: { _loadModule }
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmartSwingMatchProcessor = api;
