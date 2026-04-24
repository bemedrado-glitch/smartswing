/**
 * SmartSwing AI — Clip export utility (Phase 4 completion).
 *
 * Transforms an analyze.html session summary into a calibration-ready JSON
 * observation that matches the schema documented in
 * tools/calibration/README.md.
 *
 * This module is the "capture" half of the Phase 4 loop:
 *
 *   analyze.html session → clip-export.js → JSON file
 *   JSON file (manually curated) → tools/calibration/data/
 *   tools/calibration/calibrate.js → benchmarks.js.txt
 *   benchmarks.js.txt (pasted in) → analyze.html
 *
 * Keeping the transform logic in a separate file lets the Node test suite
 * validate it without spinning up a browser. The DOM-dependent download
 * trigger is a thin wrapper at the bottom, guarded so it's a no-op in
 * Node when `document` is absent.
 *
 * Public API (attached to window when loaded in a browser):
 *
 *   SmartSwingClipExport.buildObservation(summary, opts)
 *     → { ok: true, observation: {...} } | { ok: false, errors: [...] }
 *
 *   SmartSwingClipExport.downloadObservation(observation, opts)
 *     → triggers a JSON file download in the browser
 *
 *   SmartSwingClipExport.exportSession(session, opts)
 *     → convenience: build + download in one call
 */

(function (root) {
  'use strict';

  var VALID_SHOTS = ['forehand', 'backhand', 'serve', 'volley', 'slice', 'drop-shot', 'lob'];
  var VALID_LEVELS = ['starter', 'beginner', 'intermediate', 'advanced', 'competitive', 'pro'];
  var VALID_JOINTS = ['shoulder', 'elbow', 'hip', 'knee', 'trunk', 'wrist'];

  /**
   * Generate a stable clip id from a session summary. Uses the session
   * timestamp + shot type + a short hash of the numeric fingerprint so
   * re-running the same session produces the same id (useful for diffing).
   */
  function makeClipId(summary) {
    var shot = (summary && summary.shotType) || 'unknown';
    var ts   = summary && summary.timestamp ? new Date(summary.timestamp) : new Date();
    // YYYY-MM-DD HH:MM → "2026-04-24-0012"
    var stamp = ts.toISOString().replace(/[:TZ.-]/g, '').slice(0, 12);
    var score = (summary && summary.score != null) ? String(summary.score) : '';
    return 'capture-' + shot + '-' + stamp + (score ? '-' + score : '');
  }

  /**
   * Map the shipped player-level buckets used in analyze.html's wizard
   * (starter / beginner / intermediate / advanced / atp-pro) to the
   * enum expected by tools/calibration/ (drops the "atp-" prefix).
   */
  function normaliseLevel(level) {
    if (!level) return '';
    var k = String(level).toLowerCase().trim();
    if (k === 'atp-pro' || k === 'atppro' || k === 'pro') return 'pro';
    if (k === 'competitive') return 'competitive';
    if (k === 'advanced') return 'advanced';
    if (k === 'intermediate') return 'intermediate';
    if (k === 'beginner') return 'beginner';
    if (k === 'starter' || k === 'new') return 'starter';
    return '';
  }

  /**
   * Build a calibration observation from an analyze.html session summary.
   * `summary` is the shape produced by buildSingleShotSummary — it carries:
   *   - shotType, score, grade, timestamp
   *   - avgAngles      { knee: 145, shoulder: 132, ... }
   *   - metricComparisons [ { metric, velocity, rom, ... } ]
   *   - profile.level, profile.age, profile.gender
   *   - sequenceTiming (optional) — shot-level chain-break record
   *
   * `opts`:
   *   level?      — override the level detected from the profile
   *   source?     — e.g. "coach-annotated" | "self-calibration" | video URL
   *   notes?      — free-form. Appears in the output for reviewers.
   *   forceId?    — override the auto-generated clipId
   */
  function buildObservation(summary, opts) {
    opts = opts || {};
    var errors = [];

    if (!summary || typeof summary !== 'object') {
      return { ok: false, errors: ['summary must be an object'] };
    }

    var shotType = summary.shotType;
    if (!VALID_SHOTS.indexOf || VALID_SHOTS.indexOf(shotType) < 0) {
      errors.push('shotType must be one of: ' + VALID_SHOTS.join(', '));
    }

    var level = normaliseLevel(opts.level || (summary.profile && summary.profile.level));
    if (!level) {
      errors.push('level is required — pass via opts.level or include in summary.profile');
    } else if (VALID_LEVELS.indexOf(level) < 0) {
      errors.push('level must be one of: ' + VALID_LEVELS.join(', ') + ' (got: ' + level + ')');
    }

    if (errors.length) return { ok: false, errors: errors };

    // Angles come straight from avgAngles — rounded, integer degrees.
    var angles = {};
    var src = summary.avgAngles || {};
    VALID_JOINTS.forEach(function (joint) {
      var val = src[joint];
      if (typeof val === 'number' && isFinite(val)) angles[joint] = Math.round(val);
    });

    // Velocities + ROMs come from metricComparisons entries. Each comparison
    // already carries `.velocity` and `.rom` after Phases 1-2.
    var velocities = {};
    var roms = {};
    (summary.metricComparisons || []).forEach(function (c) {
      if (!c || !c.metric || VALID_JOINTS.indexOf(c.metric) < 0) return;
      if (typeof c.velocity === 'number' && isFinite(c.velocity)) velocities[c.metric] = c.velocity;
      if (typeof c.rom === 'number'      && isFinite(c.rom))      roms[c.metric]       = c.rom;
    });

    var observation = {
      clipId: opts.forceId || makeClipId(summary),
      shotType: shotType,
      level: level,
      source: opts.source || 'in-app-export',
      capturedAt: new Date().toISOString(),
      profile: {
        // These are informational — the aggregator only reads level.
        level: level,
        age: (summary.profile && summary.profile.age) || null,
        gender: (summary.profile && summary.profile.gender) || null
      }
    };
    if (opts.notes) observation.notes = opts.notes;
    if (Object.keys(angles).length)     observation.angles     = angles;
    if (Object.keys(velocities).length) observation.velocities = velocities;
    if (Object.keys(roms).length)       observation.roms       = roms;

    // If we have a sequence-timing record, attach it so downstream tools
    // (or future Phase 4 benchmark work on sequence offsets) can consume it.
    if (summary.sequenceTiming && summary.sequenceTiming.order) {
      observation.sequence = {
        score: summary.sequenceTiming.score,
        order: summary.sequenceTiming.order.map(function (o) {
          return { key: o.key, ts: Math.round(o.ts) };
        }),
        breaks: (summary.sequenceTiming.breaks || []).slice()
      };
    }

    // Final guard — we need at least one signal bag before the observation
    // is worth exporting. A clip with zero angles AND zero velocities AND
    // zero ROMs is almost certainly a failed analysis.
    if (!observation.angles && !observation.velocities && !observation.roms) {
      return { ok: false, errors: ['no measurable signals found in summary.avgAngles or metricComparisons'] };
    }

    return { ok: true, observation: observation };
  }

  /**
   * Trigger a JSON file download. No-op in Node (`document` undefined),
   * which lets the pure builder run under the test suite.
   */
  function downloadObservation(observation, opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return false;
    var filename = opts.filename || (observation.clipId + '.json');
    var blob = new Blob([JSON.stringify(observation, null, 2) + '\n'],
      { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    return true;
  }

  /**
   * Convenience: build then download. Returns the build result so callers
   * can inspect errors if any. Session here is the full report session
   * object (shape: { summaries: [{...}, ...], ... }). We operate on the
   * first summary by default; opts.shotIndex picks a different one.
   */
  function exportSession(session, opts) {
    opts = opts || {};
    if (!session) return { ok: false, errors: ['session is required'] };
    var summary;
    if (session.summaries && session.summaries.length) {
      summary = session.summaries[opts.shotIndex || 0];
    } else if (session.summary) {
      summary = session.summary;
    } else if (session.shotType || session.avgAngles) {
      summary = session;
    } else {
      return { ok: false, errors: ['session has no recognizable summary'] };
    }
    var built = buildObservation(summary, opts);
    if (!built.ok) return built;
    var downloaded = downloadObservation(built.observation, {
      filename: built.observation.clipId + '.json'
    });
    return { ok: true, observation: built.observation, downloaded: downloaded };
  }

  var api = {
    buildObservation: buildObservation,
    downloadObservation: downloadObservation,
    exportSession: exportSession,
    // Exposed for tests.
    _internals: { makeClipId: makeClipId, normaliseLevel: normaliseLevel }
  };

  // Attach to window for in-browser use.
  if (typeof root !== 'undefined' && root) root.SmartSwingClipExport = api;
  // Node / CommonJS export for the test suite.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
