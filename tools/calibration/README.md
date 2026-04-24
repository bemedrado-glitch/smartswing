# Benchmark calibration (Phase 4 scoring accuracy)

This tool ingests labelled pro-swing observations and produces calibrated
`{ min, max, optimal }` benchmarks for use in `analyze.html`'s scoring tables:

- `PRO_BENCHMARKS`       — static angles at contact
- `VELOCITY_BENCHMARKS`  — peak angular velocity in deg/sec
- `ROM_BENCHMARKS`       — range of motion across the swing window

Phases 1–3 put the scoring *infrastructure* in place with biomechanics-literature
estimates as the targets. Phase 4 is where the targets get replaced with empirical
values derived from real pro swings.

## Quick start

The repo ships with 10 synthetic placeholder observations so the CLI runs out
of the box:

```bash
# From repo root
node tools/calibration/calibrate.js
```

Output:

- `tools/calibration/output/benchmarks.json` — full calibrated bands as JSON
- `tools/calibration/output/benchmarks.js.txt` — drop-in JS snippet you can
  paste into `analyze.html` to replace the hard-coded tables
- `tools/calibration/output/benchmarks.md` — human-readable markdown report

## Input schema

Each observation is one clip, already reduced to summary statistics. You do
*not* pass raw per-frame video frames — the reduction happens inside
`analyze.html` during the analysis pass and can be exported via the
`window._lastSmartSwingReport` object.

```json
{
  "clipId":   "sinner-serve-2026-rg-sf",
  "shotType": "serve",
  "level":    "pro",
  "source":   "Roland Garros 2026 SF broadcast",
  "notes":    "Side camera, 60fps, clean wide angle",

  "angles":     { "knee": 145, "hip": 175, "shoulder": 130, "elbow": 106, "trunk": 50, "wrist": 58 },
  "velocities": { "knee": 410, "hip": 520, "shoulder": 1200, "elbow": 1400, "trunk": 420, "wrist": 1800 },
  "roms":       { "knee": 55,  "hip": 50,  "shoulder": 130,  "elbow": 120,  "trunk": 46,  "wrist": 105 }
}
```

All three signal bags are optional — partial observations are fine. Clips
with only `angles` still contribute to the angle benchmark; ditto velocity
and ROM.

Valid enum values:

- `shotType`: `forehand` · `backhand` · `serve` · `volley` · `slice` · `drop-shot` · `lob`
- `level`: `starter` · `beginner` · `intermediate` · `advanced` · `competitive` · `pro`
- joint keys: `shoulder` · `elbow` · `hip` · `knee` · `trunk` · `wrist`

Files in `tools/calibration/data/` can contain either one observation or an
array of observations.

## Aggregation math

For every `(shotType × joint × signal)` triple with ≥ 3 valid observations:

1. Apply a 1.5× IQR outlier filter to drop mistimed clips
2. Sort the remainder
3. Emit:
   - `optimal = p50` (median)
   - `min = p15`
   - `max = p85`

The percentile choices match the `softWindow` / `goodWindow` / `fairWindow`
cutoffs that the scoring function in `analyze.html` already uses — a player
within the `p15–p85` band will score in the 80–100 range.

Joints with fewer than 3 valid samples after filtering produce a warning
and no benchmark band (the existing hard-coded value stays in effect).

## Workflow for a real calibration pass

1. **Capture 50+ clips per shot type** from broadcast footage, training labs,
   or your own pro-player sessions. Camera angle + framerate consistency
   matters — mixing 30fps and 120fps clips will skew the velocity benchmarks.

2. **Run each clip through `analyze.html`** with the subject profile set to
   `pro`. Export the frame-level data (there's a debug hook in the console:
   `window._lastSmartSwingReport`).

3. **Reduce to an observation** using the schema above. One JSON file per
   clip (or one big array file).

4. **Drop the files into `tools/calibration/data/`** and run:
   ```bash
   node tools/calibration/calibrate.js --level pro
   ```

5. **Diff the output** against the existing hard-coded benchmarks in
   `analyze.html`. The markdown report makes this easy — each row shows
   the sample count and how many outliers were dropped.

6. **Paste the JS snippet** into `analyze.html`, replacing the estimated
   benchmarks. Run `npm test` — the tests should still pass because they
   check structure, not specific numbers.

## Options

```
node tools/calibration/calibrate.js [options]

  --dir <path>      Data directory (default: ./data)
  --out <path>      Output directory (default: ./output)
  --level <name>    Target level (default: pro)
  --check           Validate inputs, print warnings, skip output
  --quiet           Suppress per-file progress logs
```

## Files

| Path | Purpose |
|------|---------|
| `calibrate.js` | CLI wrapper — I/O + formatting |
| `aggregate.js` | Pure aggregation core — tested separately |
| `data/` | Input observations (one or more JSON files) |
| `output/` | Generated JSON + JS snippet + markdown report |
| `data/sample-*.json` | 10 synthetic observations so the CLI runs out of the box |

## Phase 4 is not "done" until real clips replace the placeholders

The sample files in `data/` are labelled `source: synthetic-placeholder`.
Every one of them has a `"notes"` field reminding reviewers not to ship
with placeholder data. A real calibration sprint would capture ≥ 50 clips
per shot, discard the placeholders, and commit the result.
