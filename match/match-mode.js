/**
 * SmartSwing AI — Match Analysis / Phase A — Match-mode controller.
 *
 * Sits between the pose detector (MoveNet MULTIPOSE / BlazePose MultiPose)
 * and the existing single-pose analyzer in analyze.html. Its jobs:
 *
 *   1. Drive a `MatchProcessor` forward frame-by-frame.
 *   2. Expose clickable bbox overlays for the user to "pick" a player.
 *   3. Once a subject is picked, translate the multi-pose detection stream
 *      into the single-pose shape the existing scorer already knows about.
 *   4. On video restart or subject change, wipe state and (per product
 *      decision) re-run from frame 0.
 *
 * Zero DOM / zero pose-library deps — the controller only talks in plain
 * objects + frame indices so analyze.html can wire it to its canvas any
 * way it likes, and this module stays Node-testable.
 *
 * ## Lifecycle
 *
 *   const ctrl = new MatchModeController({
 *     processor,                 // a MatchProcessor instance
 *     canvasWidth: 1280,
 *     canvasHeight: 720,
 *     minSubjectPoses: 5,
 *     onSubjectPicked: (t) => ...,
 *     onRally: (r) => ...
 *   });
 *
 *   // Each frame of detection:
 *   ctrl.ingestFrame(frameIdx, detections);
 *
 *   // For rendering:
 *   const overlays = ctrl.getOverlays();
 *   // [{ trackId, bbox: {x,y,w,h}, isSubject, label, lastFrame }]
 *
 *   // On canvas click:
 *   const picked = ctrl.pickAt(clickX, clickY);
 *   if (picked) {  // hit a track }
 *
 *   // In the single-pose scoring path:
 *   const pose = ctrl.getSubjectPose(frameIdx);
 *   // null when no subject yet, or when the subject had no detection this frame.
 *
 *   // Video restart / explicit reset:
 *   ctrl.reset();
 */

'use strict';

function _hitTestBox(bbox, x, y, pad = 0) {
  if (!bbox) return false;
  const left   = bbox.x - pad;
  const top    = bbox.y - pad;
  const right  = bbox.x + bbox.w + pad;
  const bottom = bbox.y + bbox.h + pad;
  return x >= left && x <= right && y >= top && y <= bottom;
}

function _boxArea(bbox) {
  if (!bbox) return 0;
  return Math.max(0, bbox.w) * Math.max(0, bbox.h);
}

class MatchModeController {
  constructor(options = {}) {
    if (!options.processor) {
      throw new Error('MatchModeController requires a `processor` (MatchProcessor instance).');
    }
    this.processor       = options.processor;
    this.canvasWidth     = options.canvasWidth  || 1280;
    this.canvasHeight    = options.canvasHeight || 720;
    this.minSubjectPoses = options.minSubjectPoses != null ? options.minSubjectPoses : 5;
    this.hitPadding      = options.hitPadding != null ? options.hitPadding : 12;

    this._subjectTrackId = null;
    this._currentFrame = -1;
    this._handlers = {
      subjectPicked: [],
      subjectCleared: [],
      rally: [],
      reset: []
    };

    // Bridge processor events through to our handlers so callers only wire
    // one surface. Rallies that arrive before a subject is picked are still
    // forwarded (the UI can show an "interesting activity here" hint).
    if (typeof this.processor.on === 'function') {
      this.processor.on('rally', (rally) => this._emit('rally', rally));
    }

    if (options.onSubjectPicked)  this.on('subjectPicked',  options.onSubjectPicked);
    if (options.onSubjectCleared) this.on('subjectCleared', options.onSubjectCleared);
    if (options.onRally)          this.on('rally',          options.onRally);
    if (options.onReset)          this.on('reset',          options.onReset);
  }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return this;
  }

  _emit(event, payload) {
    (this._handlers[event] || []).forEach((fn) => {
      try { fn(payload); } catch (err) {
        console.error('[MatchModeController] handler for', event, 'threw:', err);
      }
    });
  }

  /** Drive one frame of detections forward. */
  ingestFrame(frameIdx, detections) {
    this._currentFrame = frameIdx;
    this.processor.ingest(frameIdx, detections || []);
  }

  /** Forward the tail flush to the processor (call once when video ends). */
  finish() {
    this.processor.finish();
  }

  /**
   * Return current clickable overlays, one per track that has a recent
   * detection. Subject track (if any) is flagged so the UI can style it.
   * Overlays are sorted largest-bbox-first so the click hit-test naturally
   * favours foreground players.
   */
  getOverlays({ maxAbsentFrames = 30 } = {}) {
    const tracker = this.processor.tracker;
    if (!tracker || typeof tracker.getTracks !== 'function') return [];

    const tracks = tracker.getTracks();
    const out = [];
    for (const [trackId, t] of Object.entries(tracks)) {
      if (!t || t.expired) continue;
      if (!t.lastBox) continue;
      if ((this._currentFrame - t.lastFrame) > maxAbsentFrames) continue;

      const poseCount = Array.isArray(t.poses) ? t.poses.length : 0;
      out.push({
        trackId,
        bbox: { x: t.lastBox.x, y: t.lastBox.y, w: t.lastBox.w, h: t.lastBox.h },
        isSubject: trackId === this._subjectTrackId,
        side: t.side || null,
        poseCount,
        lastFrame: t.lastFrame,
        label: this._labelForTrack(trackId, t)
      });
    }
    out.sort((a, b) => _boxArea(b.bbox) - _boxArea(a.bbox));
    return out;
  }

  _labelForTrack(trackId, track) {
    if (trackId === this._subjectTrackId) return 'Analyzing';
    if (track && track.side === 'near') return 'Near player';
    if (track && track.side === 'far')  return 'Far player';
    return 'Tap to analyze';
  }

  /**
   * Hit-test the canvas click against current overlays; if one matches,
   * pin it as the subject. Returns the picked overlay, or null.
   *
   * Iterates the overlays in foreground-first order (largest box) so a
   * foreground player occluding a background one gets picked correctly.
   */
  pickAt(x, y) {
    const overlays = this.getOverlays();
    for (const o of overlays) {
      if (_hitTestBox(o.bbox, x, y, this.hitPadding)) {
        this.setSubject(o.trackId);
        return o;
      }
    }
    return null;
  }

  /**
   * Explicitly set the subject track. Used when code (rather than a click)
   * picks the subject — e.g. `subjectHint: { side: 'near' }` auto-picks
   * after N frames.
   */
  setSubject(trackId) {
    const tracker = this.processor.tracker;
    const tracks = tracker ? tracker.getTracks() : {};
    if (!tracks[trackId]) return false;
    if (trackId === this._subjectTrackId) return true;
    this._subjectTrackId = trackId;
    this._emit('subjectPicked', { trackId, track: tracks[trackId] });
    return true;
  }

  /** Clear the subject without resetting processor state. */
  clearSubject() {
    if (this._subjectTrackId == null) return;
    const prev = this._subjectTrackId;
    this._subjectTrackId = null;
    this._emit('subjectCleared', { trackId: prev });
  }

  getSubjectTrackId() {
    return this._subjectTrackId;
  }

  /**
   * If enough frames have elapsed without a user click, fall back to the
   * processor's subject hint (e.g. 'near player'). Returns true if a
   * subject was auto-picked this call.
   */
  autoPickIfReady({ afterFrames = 150 } = {}) {
    if (this._subjectTrackId) return false;
    if (this._currentFrame < afterFrames) return false;
    const tracker = this.processor.tracker;
    if (!tracker) return false;
    if (typeof tracker.labelSides === 'function') {
      tracker.labelSides({ canvasHeight: this.canvasHeight });
    }
    const hint = this.processor.subjectHint || { side: 'near' };
    const subj = tracker.pickSubject ? tracker.pickSubject(hint) : null;
    if (subj && subj.trackId) {
      return this.setSubject(subj.trackId);
    }
    return false;
  }

  /**
   * Returns the most recent pose object for the subject track, shaped the
   * same as the detector's per-frame pose output ({ bbox, keypoints, score }).
   * Returns null if no subject is picked or the subject has no recent pose.
   *
   * `frameIdx` lets the caller request "the pose for exactly frame N" when
   * available (useful for deterministic replays); if the subject was absent
   * that frame and `requireExact` is false (default), the most recent
   * earlier pose is returned.
   */
  getSubjectPose(frameIdx = null, { requireExact = false } = {}) {
    if (!this._subjectTrackId) return null;
    const tracker = this.processor.tracker;
    const track = tracker && tracker.getTracks()[this._subjectTrackId];
    if (!track || !track.poses || track.poses.length === 0) return null;

    if (frameIdx == null) {
      return track.poses[track.poses.length - 1].pose;
    }
    // Poses are pushed in frame order; walk backwards from the tail.
    for (let i = track.poses.length - 1; i >= 0; i--) {
      const entry = track.poses[i];
      if (entry.frameIdx === frameIdx) return entry.pose;
      if (entry.frameIdx < frameIdx) {
        return requireExact ? null : entry.pose;
      }
    }
    return null;
  }

  /**
   * Decide whether the analyzer has enough subject data to produce a
   * meaningful report. Used by the UI to gate the "Generate report"
   * button under match mode.
   */
  hasEnoughSubjectData() {
    if (!this._subjectTrackId) return false;
    const tracker = this.processor.tracker;
    const track = tracker && tracker.getTracks()[this._subjectTrackId];
    if (!track || !Array.isArray(track.poses)) return false;
    return track.poses.length >= this.minSubjectPoses;
  }

  /**
   * Full reset — wipes the processor's tracker state and clears the
   * subject, ready to re-run the video from frame 0.
   *
   * The caller (analyze.html) is responsible for calling this *before*
   * seeking the video back to 0; match-mode-on toggle, video switch, and
   * manual "restart analysis" all route here.
   */
  reset() {
    const tracker = this.processor.tracker;
    if (tracker && tracker._tracks) {
      tracker._tracks = {};
      if (typeof tracker._nextId === 'number') tracker._nextId = 1;
    }
    if (this.processor._framesInChunk != null) this.processor._framesInChunk = 0;
    if (this.processor._totalFrames   != null) this.processor._totalFrames   = 0;
    if (this.processor._rallyCount    != null) this.processor._rallyCount    = 0;
    if (this.processor._emittedPeaks  && typeof this.processor._emittedPeaks.clear === 'function') {
      this.processor._emittedPeaks.clear();
    }
    this._currentFrame = -1;
    const hadSubject = this._subjectTrackId;
    this._subjectTrackId = null;
    this._emit('reset', { hadSubject });
    if (hadSubject) this._emit('subjectCleared', { trackId: hadSubject });
  }
}

// ── Exports (Node + browser) ─────────────────────────────────────────

const api = {
  MatchModeController,
  // Exposed for tests.
  _internals: { _hitTestBox, _boxArea }
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmartSwingMatchMode = api;
