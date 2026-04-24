/**
 * SmartSwing AI — Phase 4 benchmark calibration: aggregation core.
 *
 * Takes a list of labelled-clip observations and produces benchmark
 * `{ min, max, optimal }` triples per (shot × joint × signal) for use
 * in analyze.html's PRO_BENCHMARKS / VELOCITY_BENCHMARKS / ROM_BENCHMARKS.
 *
 * Why not just "optimal = mean": means are pulled by outliers and produce
 * benchmarks that don't match any real swing. We use the median for
 * `optimal` and the 15th/85th percentiles for `min`/`max` — this captures
 * "the band where 70% of clean pro swings land" and is what the scoring
 * windows in analyze.html were designed to accept.
 *
 * Public API:
 *   - aggregateObservations(observations, options)
 *     → { benchmarks: {...}, stats: {...}, byLevel: {...} }
 *   - validateObservation(clip)
 *     → { ok: true } | { ok: false, errors: [...] }
 *
 * Pure module, no I/O. The CLI wrapper (calibrate.js) handles file reads
 * and writes; this file is the testable core.
 */

'use strict';

// ── Valid shapes ────────────────────────────────────────────────────────

const VALID_SHOTS  = ['forehand', 'backhand', 'serve', 'volley', 'slice', 'drop-shot', 'lob'];
const VALID_LEVELS = ['starter', 'beginner', 'intermediate', 'advanced', 'competitive', 'pro'];
const VALID_JOINTS = ['shoulder', 'elbow', 'hip', 'knee', 'trunk', 'wrist'];
const VALID_SIGNALS = ['angle', 'velocity', 'rom'];

/**
 * Validate a single labelled-clip observation. Returns { ok, errors }.
 * An observation is the already-reduced summary of one clip, not the
 * raw per-frame data — that reduction happens inside analyze.html and
 * is exported via the clip-capture helper documented in README.md.
 *
 * Expected shape:
 *   {
 *     clipId: 'sinner-serve-2026-03-rg-sf',
 *     shotType: 'serve',
 *     level: 'pro',
 *     angles:     { knee: 145, shoulder: 132, ... },   // degrees at contact
 *     velocities: { knee: 418, shoulder: 1240, ... },  // peak deg/sec
 *     roms:       { knee: 58,  shoulder: 128, ... }    // swing-window range
 *   }
 */
function validateObservation(clip) {
  const errors = [];
  if (!clip || typeof clip !== 'object') {
    return { ok: false, errors: ['clip must be an object'] };
  }
  if (!clip.clipId || typeof clip.clipId !== 'string') {
    errors.push('clipId (string) is required for deduplication');
  }
  if (!VALID_SHOTS.includes(clip.shotType)) {
    errors.push(`shotType must be one of: ${VALID_SHOTS.join(', ')}`);
  }
  if (!VALID_LEVELS.includes(clip.level)) {
    errors.push(`level must be one of: ${VALID_LEVELS.join(', ')}`);
  }
  for (const signal of VALID_SIGNALS) {
    const bag = signal === 'angle' ? clip.angles
      : signal === 'velocity' ? clip.velocities
      : clip.roms;
    if (bag == null) continue; // each signal is optional — not all clips have all 3
    if (typeof bag !== 'object') {
      errors.push(`${signal}s must be an object of { jointName: number }`);
      continue;
    }
    for (const [joint, value] of Object.entries(bag)) {
      if (!VALID_JOINTS.includes(joint)) {
        errors.push(`${signal}s.${joint} is not a recognised joint`);
      }
      if (!Number.isFinite(value)) {
        errors.push(`${signal}s.${joint} must be a finite number (got ${value})`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ── Statistics helpers ──────────────────────────────────────────────────

/**
 * Percentile via linear interpolation. Matches Excel/NumPy `linear` method.
 * Returns null for empty / single-value arrays where the requested percentile
 * is undefined.
 */
function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedValues[lo];
  const frac = rank - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

function median(values) {
  return percentile([...values].sort((a, b) => a - b), 50);
}

/**
 * IQR-based outlier filter. Drops any sample that falls more than 1.5× IQR
 * outside [Q1, Q3]. Same rule a coach would apply: "throw out the mistimed
 * serve that had the racket stuck on the toss." Returns `values` unchanged
 * if we have fewer than 5 samples — the filter's noisy on tiny populations.
 */
function filterIQROutliers(values) {
  if (values.length < 5) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const low  = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return sorted.filter(v => v >= low && v <= high);
}

/**
 * Reduce an array of observations to a single `{ min, max, optimal }` band
 * suitable for direct use in analyze.html's benchmark tables.
 *
 *   optimal = median of the filtered population
 *   min     = 15th percentile (captures ~70% bell-curve lower edge)
 *   max     = 85th percentile
 *
 * All three get `Math.round()` because downstream comparison uses integer
 * degree / deg-per-second values.
 */
function buildBand(values) {
  const filtered = filterIQROutliers(values);
  if (filtered.length < 3) return null; // refuse to emit a band on too-thin data
  const sorted = [...filtered].sort((a, b) => a - b);
  return {
    min:     Math.round(percentile(sorted, 15)),
    max:     Math.round(percentile(sorted, 85)),
    optimal: Math.round(percentile(sorted, 50)),
    n:       filtered.length,
    dropped: values.length - filtered.length
  };
}

// ── Main aggregator ────────────────────────────────────────────────────

/**
 * Group observations by (shot, joint, signal), compute bands, return the
 * result in both a nested-by-shot shape (matches analyze.html's existing
 * benchmark tables) and a flat-row shape for CSV export / inspection.
 *
 * Options:
 *   targetLevel: 'pro' (default) — only include clips of this level in the
 *                band. Phases 1–3 benchmarks are calibrated to pro swings;
 *                lower-level bands can be derived from PROFILE_SCORE_CURVE.
 *   minSamplesPerJoint: 3 (default) — refuse to emit a benchmark for any
 *                joint with fewer than N valid samples.
 */
function aggregateObservations(observations, options = {}) {
  const targetLevel = options.targetLevel || 'pro';
  const minSamples  = options.minSamplesPerJoint || 3;
  const warnings = [];

  // Filter + validate.
  const valid = [];
  const byLevel = {};
  for (const obs of observations || []) {
    const check = validateObservation(obs);
    if (!check.ok) {
      warnings.push(`${obs?.clipId || '<unknown>'}: ${check.errors.join('; ')}`);
      continue;
    }
    byLevel[obs.level] = (byLevel[obs.level] || 0) + 1;
    if (obs.level === targetLevel) valid.push(obs);
  }

  // Bucket by shot → signal → joint → list of values.
  const buckets = {};
  for (const obs of valid) {
    const shot = obs.shotType;
    if (!buckets[shot]) buckets[shot] = { angles: {}, velocities: {}, roms: {} };
    for (const [signal, bag] of [
      ['angles',     obs.angles     || {}],
      ['velocities', obs.velocities || {}],
      ['roms',       obs.roms       || {}]
    ]) {
      for (const [joint, value] of Object.entries(bag)) {
        if (!buckets[shot][signal][joint]) buckets[shot][signal][joint] = [];
        buckets[shot][signal][joint].push(value);
      }
    }
  }

  // Build bands per shot / signal / joint.
  const benchmarks = {};
  const stats = { shots: {}, totalInput: (observations || []).length, validAtLevel: valid.length };
  const rows = []; // flat export shape

  for (const [shot, byShot] of Object.entries(buckets)) {
    benchmarks[shot] = { angles: {}, velocities: {}, roms: {} };
    stats.shots[shot] = { angles: {}, velocities: {}, roms: {} };
    for (const signal of ['angles', 'velocities', 'roms']) {
      for (const [joint, values] of Object.entries(byShot[signal])) {
        if (values.length < minSamples) {
          warnings.push(`${shot}.${signal}.${joint}: only ${values.length} samples (need ${minSamples}), skipping`);
          continue;
        }
        const band = buildBand(values);
        if (!band) continue;
        benchmarks[shot][signal][joint] = { min: band.min, max: band.max, optimal: band.optimal };
        stats.shots[shot][signal][joint] = { n: band.n, dropped: band.dropped };
        rows.push({
          shot,
          signal,
          joint,
          min: band.min,
          max: band.max,
          optimal: band.optimal,
          samples: band.n,
          droppedAsOutliers: band.dropped
        });
      }
    }
  }

  return { benchmarks, stats, byLevel, rows, warnings };
}

module.exports = {
  aggregateObservations,
  validateObservation,
  // Exposed for tests — not part of the stable public API.
  _internals: { percentile, median, filterIQROutliers, buildBand }
};
