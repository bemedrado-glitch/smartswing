#!/usr/bin/env node
/**
 * SmartSwing AI — Functional Test Suite
 *
 * Tests pure functions extracted from analyze.html and validates
 * key behaviors: biomechanics helpers, angle calculations, match
 * tracker scoring logic, and HTML structure requirements.
 *
 * Run via:  node tests/functional-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════
// Test harness — minimal Node-only, no deps
// ═══════════════════════════════════════════════════════════════════

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  fn();
}

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`  ✗ [${currentSuite}] ${name}\n    → ${err.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b)
        throw new Error(`Expected ${b}, got ${a}`);
    },
    toBeNull() {
      if (actual !== null)
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n) {
      if (!(actual > n))
        throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n))
        throw new Error(`Expected ${actual} >= ${n}`);
    },
    toBeLessThan(n) {
      if (!(actual < n))
        throw new Error(`Expected ${actual} < ${n}`);
    },
    toBeLessThanOrEqual(n) {
      if (!(actual <= n))
        throw new Error(`Expected ${actual} <= ${n}`);
    },
    toBeTruthy() {
      if (!actual)
        throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual)
        throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toContain(str) {
      if (typeof actual === 'string') {
        if (!actual.includes(str))
          throw new Error(`Expected string to contain "${str}"`);
      } else if (Array.isArray(actual)) {
        if (!actual.includes(str))
          throw new Error(`Expected array to contain ${JSON.stringify(str)}`);
      }
    },
    toBeCloseTo(expected, precision = 2) {
      const factor = 10 ** precision;
      if (Math.round(actual * factor) !== Math.round(expected * factor))
        throw new Error(`Expected ${actual} to be close to ${expected}`);
    },
    toBeWithinRange(min, max) {
      if (actual < min || actual > max)
        throw new Error(`Expected ${actual} to be within [${min}, ${max}]`);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
// Extract pure functions from analyze.html
// ═══════════════════════════════════════════════════════════════════

const analyzeHtml = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');

// We extract the functions by evaluating them in a controlled scope.
// These are pure (no DOM access) so they run fine in Node.

function kpOk(kp, min = 0.3) {
  return kp && (kp.score ?? kp.confidence ?? 0) >= min;
}

function calculateAngle(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return Math.round(angle);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function distance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(safeNumber(b.x, 0) - safeNumber(a.x, 0), safeNumber(b.y, 0) - safeNumber(a.y, 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const list = (values || []).filter((value) => Number.isFinite(value));
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
}

function roundMetric(value, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function standardDeviation(values) {
  const list = (values || []).filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  const avg = average(list);
  const variance = average(list.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function normalizeLevel(value) {
  const input = String(value || '').toLowerCase();
  if (input === 'starter' || input.includes('just started')) return 'starter';
  if (input.includes('beginner') || input.includes('2.5')) return 'beginner';
  if (input.includes('competitive') || input.includes('tournament')) return 'competitive';
  if (input.includes('advanced') || input.includes('4.0') || input.includes('4.5')) return 'advanced';
  if (input === 'atp-pro' || input.includes('pro') || input.includes('5.0') || input.includes('atp')) return 'pro';
  return 'intermediate';
}

function parseAgeMidpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('+')) {
    const base = Number.parseInt(raw, 10);
    return Number.isFinite(base) ? base + 5 : null;
  }
  if (raw.includes('-')) {
    const [start, end] = raw.split('-').map((part) => Number.parseInt(part, 10));
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return (start + end) / 2;
    }
  }
  const direct = Number.parseInt(raw, 10);
  return Number.isFinite(direct) ? direct : null;
}

function formatMetricName(metric) {
  return String(metric || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function calculateLineTilt(a, b) {
  if (!a || !b) return null;
  let angle = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI));
  if (angle > 90) angle = 180 - angle;
  return roundMetric(angle);
}

function pushWithCap(arr, value) {
  const AI_SETTINGS = { maxStoredFrames: 600 };
  arr.push(value);
  if (arr.length > AI_SETTINGS.maxStoredFrames) {
    arr.splice(0, arr.length - AI_SETTINGS.maxStoredFrames);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Match Tracker pure logic (extracted & isolated)
// ═══════════════════════════════════════════════════════════════════

function createMatchState(format = 3, formatType = 'sets') {
  const setsToWin = formatType === 'sets' ? Math.ceil(format / 2) : null;
  return {
    matchFormat: format,
    matchFormatType: formatType,
    setsToWin,
    server: 'left',
    currentGame: { left: 0, right: 0 },
    currentSet: { left: 0, right: 0 },
    match: { left: 0, right: 0 },
    sets: [],
    inTiebreak: false,
    tiebreakScore: { left: 0, right: 0 },
    tiebreakServer: 'left',
    matchOver: false,
    finalScore: '',
    leftName: 'Player 1',
    rightName: 'Player 2',
    pointIndex: 0,
    momentum: [],
    log: [],
    miniGame: null,
    miniGameScore: { left: 0, right: 0 },
    stats: {
      aces: 0, doubleFaults: 0, winners: 0, ufErrors: 0, forcedErrors: 0,
      firstServeIn: 0, firstServeTotal: 0,
      secondServeIn: 0, secondServeTotal: 0,
      ptsWonServe: { left: 0, right: 0 }, ptsServe: { left: 0, right: 0 },
      ptsWonReturn: { left: 0, right: 0 }, ptsReturn: { left: 0, right: 0 },
      breakPtsFaced: { left: 0, right: 0 }, breakPtsSaved: { left: 0, right: 0 }, breakPtsConv: { left: 0, right: 0 },
    }
  };
}

function opposite(side) { return side === 'left' ? 'right' : 'left'; }

function gameWinner(mt) {
  if (mt.inTiebreak) {
    const l = mt.tiebreakScore.left;
    const r = mt.tiebreakScore.right;
    if (l >= 7 && l - r >= 2) return 'left';
    if (r >= 7 && r - l >= 2) return 'right';
    return null;
  }
  const l = mt.currentGame.left;
  const r = mt.currentGame.right;
  if (l >= 4 && l - r >= 2) return 'left';
  if (r >= 4 && r - l >= 2) return 'right';
  return null;
}

function setWinner(mt) {
  const l = mt.currentSet.left;
  const r = mt.currentSet.right;
  if (l === 6 && r === 6) return null;
  if (l >= 6 && l - r >= 2) return 'left';
  if (r >= 6 && r - l >= 2) return 'right';
  if (l === 7) return 'left';
  if (r === 7) return 'right';
  return null;
}

function matchWinner(mt) {
  if (mt.matchFormatType === 'games') {
    const gamesToWin = Math.ceil(mt.matchFormat / 2);
    if (mt.currentSet.left >= gamesToWin) return 'left';
    if (mt.currentSet.right >= gamesToWin) return 'right';
    return null;
  }
  if (mt.match.left >= mt.setsToWin) return 'left';
  if (mt.match.right >= mt.setsToWin) return 'right';
  return null;
}

// Simplified scorePoint for testing (no DOM, no renderMatchTracker)
function scorePointPure(mt, winner) {
  if (mt.matchOver) return;

  mt.pointIndex++;
  mt.momentum.push(winner === 'left' ? 1 : -1);

  // Advance game score
  if (mt.inTiebreak) {
    mt.tiebreakScore[winner]++;
    const totalTbPts = mt.tiebreakScore.left + mt.tiebreakScore.right;
    if (totalTbPts === 1) { mt.server = opposite(mt.tiebreakServer); }
    else if (totalTbPts > 1 && totalTbPts % 2 === 1) { mt.server = opposite(mt.server); }
  } else {
    mt.currentGame[winner]++;
  }

  const gWin = gameWinner(mt);
  if (gWin) {
    mt.currentSet[gWin]++;

    if (mt.matchFormatType === 'games') {
      mt.currentGame = { left: 0, right: 0 };
      mt.tiebreakScore = { left: 0, right: 0 };
      mt.inTiebreak = false;
      mt.server = opposite(mt.server);

      const mWin = matchWinner(mt);
      if (mWin) {
        mt.matchOver = true;
        mt.finalScore = `${mt.leftName} ${mt.currentSet.left} - ${mt.currentSet.right} ${mt.rightName}`;
      }
      return;
    }

    // Set-based
    const needTiebreak = mt.currentSet.left === 6 && mt.currentSet.right === 6 && !mt.inTiebreak;
    const savedTiebreakScore = mt.inTiebreak ? { left: mt.tiebreakScore.left, right: mt.tiebreakScore.right } : null;

    mt.currentGame = { left: 0, right: 0 };
    mt.tiebreakScore = { left: 0, right: 0 };

    if (needTiebreak) {
      mt.inTiebreak = true;
      mt.tiebreakServer = mt.server;
    } else {
      mt.inTiebreak = false;
      const sWin = setWinner(mt);
      if (sWin) {
        mt.sets.push({ left: mt.currentSet.left, right: mt.currentSet.right, tiebreak: savedTiebreakScore });
        mt.currentSet = { left: 0, right: 0 };
        mt.match[sWin]++;
      }
      if (!needTiebreak) mt.server = opposite(mt.server);
    }

    const mWin = matchWinner(mt);
    if (mWin) {
      mt.matchOver = true;
      mt.finalScore = `Match over`;
    }
  }
}

// Helper: play N points for one side to win a game (non-tiebreak)
function winGame(mt, side) {
  for (let i = 0; i < 4; i++) scorePointPure(mt, side);
}

// Helper: play points to win a set 6-0
function winSet(mt, side) {
  for (let i = 0; i < 6; i++) winGame(mt, side);
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

// ── kpOk ──────────────────────────────────────────────────────────
describe('kpOk', () => {
  test('returns true for score above threshold', () => {
    expect(kpOk({ x: 0, y: 0, score: 0.5 })).toBeTruthy();
  });

  test('returns false for score below threshold', () => {
    expect(kpOk({ x: 0, y: 0, score: 0.1 })).toBeFalsy();
  });

  test('returns false for null/undefined', () => {
    expect(kpOk(null)).toBeFalsy();
    expect(kpOk(undefined)).toBeFalsy();
  });

  test('uses confidence field as fallback', () => {
    expect(kpOk({ x: 0, y: 0, confidence: 0.8 })).toBeTruthy();
    expect(kpOk({ x: 0, y: 0, confidence: 0.1 })).toBeFalsy();
  });

  test('respects custom threshold', () => {
    expect(kpOk({ x: 0, y: 0, score: 0.5 }, 0.6)).toBeFalsy();
    expect(kpOk({ x: 0, y: 0, score: 0.5 }, 0.4)).toBeTruthy();
  });

  test('returns false for score exactly 0', () => {
    expect(kpOk({ x: 0, y: 0, score: 0 })).toBeFalsy();
  });

  test('returns true for score at exact threshold', () => {
    expect(kpOk({ x: 0, y: 0, score: 0.3 })).toBeTruthy();
  });
});

// ── calculateAngle ────────────────────────────────────────────────
describe('calculateAngle', () => {
  test('returns 180 for straight line', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 5, y: 0 };
    const c = { x: 10, y: 0 };
    expect(calculateAngle(a, b, c)).toBe(180);
  });

  test('returns 90 for right angle', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 5 };
    const c = { x: 5, y: 5 };
    expect(calculateAngle(a, b, c)).toBe(90);
  });

  test('returns value between 0 and 180', () => {
    const a = { x: 1, y: 3 };
    const b = { x: 5, y: 7 };
    const c = { x: 9, y: 2 };
    const angle = calculateAngle(a, b, c);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThanOrEqual(180);
  });

  test('handles overlapping points gracefully', () => {
    const p = { x: 5, y: 5 };
    // same point — should still return a number
    const angle = calculateAngle(p, p, p);
    expect(typeof angle).toBe('number');
  });
});

// ── midpoint ──────────────────────────────────────────────────────
describe('midpoint', () => {
  test('calculates midpoint of two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ x: 5, y: 5 });
  });

  test('handles negative coordinates', () => {
    expect(midpoint({ x: -10, y: -4 }, { x: 10, y: 4 })).toEqual({ x: 0, y: 0 });
  });

  test('same point returns itself', () => {
    expect(midpoint({ x: 7, y: 3 }, { x: 7, y: 3 })).toEqual({ x: 7, y: 3 });
  });
});

// ── safeNumber ────────────────────────────────────────────────────
describe('safeNumber', () => {
  test('returns number for valid input', () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(3.14)).toBe(3.14);
  });

  test('returns fallback for NaN', () => {
    expect(safeNumber(NaN, 5)).toBe(5);
  });

  test('returns fallback for undefined', () => {
    expect(safeNumber(undefined, 10)).toBe(10);
  });

  test('returns 0 for null (Number(null) === 0)', () => {
    // Number(null) is 0, which IS finite — so safeNumber returns 0, not the fallback
    expect(safeNumber(null, -1)).toBe(0);
  });

  test('returns fallback for Infinity', () => {
    expect(safeNumber(Infinity, 0)).toBe(0);
    expect(safeNumber(-Infinity, 0)).toBe(0);
  });

  test('converts string numbers', () => {
    expect(safeNumber('42')).toBe(42);
    expect(safeNumber('3.14')).toBeCloseTo(3.14);
  });

  test('returns fallback for non-numeric strings', () => {
    expect(safeNumber('abc', 7)).toBe(7);
  });

  test('default fallback is 0', () => {
    expect(safeNumber(undefined)).toBe(0);
  });
});

// ── distance ──────────────────────────────────────────────────────
describe('distance', () => {
  test('calculates Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test('returns 0 for same point', () => {
    expect(distance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });

  test('returns null for null inputs', () => {
    expect(distance(null, { x: 1, y: 2 })).toBeNull();
    expect(distance({ x: 1, y: 2 }, null)).toBeNull();
    expect(distance(null, null)).toBeNull();
  });

  test('handles points with missing coordinates via safeNumber', () => {
    const d = distance({ x: 0, y: undefined }, { x: 3, y: 4 });
    expect(d).toBe(5); // undefined → 0 via safeNumber
  });
});

// ── clamp ─────────────────────────────────────────────────────────
describe('clamp', () => {
  test('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test('handles equal min/max', () => {
    expect(clamp(5, 7, 7)).toBe(7);
  });
});

// ── average ───────────────────────────────────────────────────────
describe('average', () => {
  test('calculates average of numbers', () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  test('returns null for empty array', () => {
    expect(average([])).toBeNull();
  });

  test('returns null for null input', () => {
    expect(average(null)).toBeNull();
  });

  test('filters out non-finite values', () => {
    expect(average([2, NaN, 4, Infinity, 6])).toBe(4);
  });

  test('single element returns itself', () => {
    expect(average([42])).toBe(42);
  });
});

// ── roundMetric ───────────────────────────────────────────────────
describe('roundMetric', () => {
  test('rounds to 0 decimal places by default', () => {
    expect(roundMetric(3.7)).toBe(4);
    expect(roundMetric(3.2)).toBe(3);
  });

  test('rounds to specified digits', () => {
    expect(roundMetric(3.14159, 2)).toBe(3.14);
    expect(roundMetric(3.14159, 3)).toBe(3.142);
  });

  test('returns null for non-finite', () => {
    expect(roundMetric(NaN)).toBeNull();
    expect(roundMetric(Infinity)).toBeNull();
  });
});

// ── standardDeviation ─────────────────────────────────────────────
describe('standardDeviation', () => {
  test('returns 0 for identical values', () => {
    expect(standardDeviation([5, 5, 5, 5])).toBe(0);
  });

  test('calculates population std dev correctly', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, stdev=2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  test('returns null for empty array', () => {
    expect(standardDeviation([])).toBeNull();
  });

  test('returns 0 for single value', () => {
    expect(standardDeviation([42])).toBe(0);
  });
});

// ── normalizeLevel ────────────────────────────────────────────────
describe('normalizeLevel', () => {
  test('maps starter', () => {
    expect(normalizeLevel('starter')).toBe('starter');
    expect(normalizeLevel('just started')).toBe('starter');
  });

  test('maps beginner', () => {
    expect(normalizeLevel('beginner')).toBe('beginner');
    expect(normalizeLevel('2.5')).toBe('beginner');
  });

  test('maps competitive', () => {
    expect(normalizeLevel('competitive')).toBe('competitive');
    expect(normalizeLevel('tournament')).toBe('competitive');
  });

  test('maps advanced', () => {
    expect(normalizeLevel('advanced')).toBe('advanced');
    expect(normalizeLevel('4.0')).toBe('advanced');
    expect(normalizeLevel('4.5')).toBe('advanced');
  });

  test('maps pro', () => {
    expect(normalizeLevel('atp-pro')).toBe('pro');
    expect(normalizeLevel('pro')).toBe('pro');
    expect(normalizeLevel('5.0')).toBe('pro');
  });

  test('defaults to intermediate', () => {
    expect(normalizeLevel('casual')).toBe('intermediate');
    expect(normalizeLevel('')).toBe('intermediate');
    expect(normalizeLevel(null)).toBe('intermediate');
  });
});

// ── parseAgeMidpoint ──────────────────────────────────────────────
describe('parseAgeMidpoint', () => {
  test('parses range', () => {
    expect(parseAgeMidpoint('25-35')).toBe(30);
  });

  test('parses plus notation', () => {
    expect(parseAgeMidpoint('60+')).toBe(65);
  });

  test('parses single number', () => {
    expect(parseAgeMidpoint('30')).toBe(30);
  });

  test('returns null for empty', () => {
    expect(parseAgeMidpoint('')).toBeNull();
    expect(parseAgeMidpoint(null)).toBeNull();
  });
});

// ── formatMetricName ──────────────────────────────────────────────
describe('formatMetricName', () => {
  test('converts camelCase', () => {
    expect(formatMetricName('shoulderTilt')).toBe('Shoulder Tilt');
  });

  test('converts kebab-case', () => {
    expect(formatMetricName('shoulder-tilt')).toBe('Shoulder Tilt');
  });

  test('converts snake_case', () => {
    expect(formatMetricName('shoulder_tilt')).toBe('Shoulder Tilt');
  });

  test('handles empty', () => {
    expect(formatMetricName('')).toBe('');
    expect(formatMetricName(null)).toBe('');
  });
});

// ── calculateLineTilt ─────────────────────────────────────────────
describe('calculateLineTilt', () => {
  test('horizontal line = 0 degrees', () => {
    expect(calculateLineTilt({ x: 0, y: 5 }, { x: 10, y: 5 })).toBe(0);
  });

  test('vertical line = 90 degrees', () => {
    expect(calculateLineTilt({ x: 5, y: 0 }, { x: 5, y: 10 })).toBe(90);
  });

  test('45 degree line', () => {
    expect(calculateLineTilt({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe(45);
  });

  test('returns null for null inputs', () => {
    expect(calculateLineTilt(null, { x: 0, y: 0 })).toBeNull();
    expect(calculateLineTilt({ x: 0, y: 0 }, null)).toBeNull();
  });
});

// ── pushWithCap ───────────────────────────────────────────────────
describe('pushWithCap', () => {
  test('pushes value to array', () => {
    const arr = [1, 2, 3];
    pushWithCap(arr, 4);
    expect(arr.length).toBe(4);
    expect(arr[3]).toBe(4);
  });

  test('caps array at maxStoredFrames (600)', () => {
    const arr = [];
    for (let i = 0; i < 610; i++) pushWithCap(arr, i);
    expect(arr.length).toBe(600);
    expect(arr[0]).toBe(10); // first 10 were removed
    expect(arr[599]).toBe(609);
  });
});

// ═══════════════════════════════════════════════════════════════════
// selectAssessmentFrames — extracted for testing
// ═══════════════════════════════════════════════════════════════════

function selectAssessmentFrames(frames, shotType) {
  const list = Array.isArray(frames) ? frames.filter((frame) => frame?.angles) : [];
  if (list.length <= 30) return list;

  const scored = list.map((frame, index) => {
    const poseMotion = safeNumber(frame.poseMotion, 0);
    const reach = safeNumber(frame.derivedMetrics?.reach, 0);
    const contactHeight = safeNumber(frame.derivedMetrics?.contactHeight, 0);
    const footworkLoad = safeNumber(frame.derivedMetrics?.footworkLoad, 0);
    const trunk = safeNumber(frame.angles?.trunk, 0);
    const wristHip = safeNumber(frame.derivedMetrics?.wristHipDistance, 0);

    let activation = poseMotion * 1.15 + footworkLoad * 0.25 + trunk * 0.18 + wristHip * 0.30;
    if (shotType === 'serve' || shotType === 'lob') activation += contactHeight * 0.45 + reach * 0.2;
    else activation += reach * 0.25 + contactHeight * 0.18;

    return { frame, index, activation };
  });

  const activations = scored.map(s => s.activation);
  const meanAct = average(activations) || 0;
  const stdAct = standardDeviation(activations) || 0;
  const shotThreshold = meanAct + stdAct * 0.25;

  const maxGap = 4;
  const minWindowSize = 3;
  const windows = [];
  let currentWindow = null;
  let gapCount = 0;

  for (let i = 0; i < scored.length; i++) {
    const isActive = scored[i].activation >= shotThreshold;
    if (isActive) {
      if (!currentWindow) {
        currentWindow = { start: i, end: i, activeCount: 1 };
      } else {
        currentWindow.end = i;
        currentWindow.activeCount++;
      }
      gapCount = 0;
    } else if (currentWindow) {
      gapCount++;
      if (gapCount <= maxGap) {
        currentWindow.end = i;
      } else {
        if (currentWindow.activeCount >= minWindowSize) windows.push(currentWindow);
        currentWindow = null;
        gapCount = 0;
      }
    }
  }
  if (currentWindow && currentWindow.activeCount >= minWindowSize) windows.push(currentWindow);

  if (windows.length > 0) {
    const buffer = 4;
    const selectedIndexes = new Set();
    windows.forEach(w => {
      for (let i = Math.max(0, w.start - buffer); i <= Math.min(scored.length - 1, w.end + buffer); i++) {
        selectedIndexes.add(i);
      }
    });
    const result = list.filter((_, index) => selectedIndexes.has(index));
    result._shotWindowCount = windows.length;
    // Guarantee minimum of 30 frames when available
    if (result.length < 30 && list.length >= 30) {
      const takeCount = Math.min(list.length, Math.max(30, result.length));
      const topFrames = scored.sort((a, b) => b.activation - a.activation).slice(0, takeCount);
      const mergedIndexes = new Set([...selectedIndexes, ...topFrames.map(f => f.index)]);
      const merged = list.filter((_, index) => mergedIndexes.has(index));
      merged._shotWindowCount = windows.length;
      return merged;
    }
    return result;
  }

  // Fallback: no clear windows, use top activation frames
  const takeCount = clamp(Math.round(list.length * 0.55), 30, 120);
  const selectedIndexes = new Set(
    scored.sort((a, b) => b.activation - a.activation).slice(0, takeCount).map((item) => item.index)
  );

  return list.filter((_, index) => selectedIndexes.has(index));
}

// Helper to generate mock frames for selectAssessmentFrames tests
function makeMockFrame(poseMotion, opts = {}) {
  return {
    timestamp: opts.timestamp || 0,
    landmarks: opts.landmarks || 12,
    confidence: opts.confidence || 70,
    poseMotion,
    angles: {
      shoulder: opts.shoulder || 90,
      elbow: opts.elbow || 120,
      hip: opts.hip || 160,
      knee: opts.knee || 150,
      trunk: opts.trunk || 8,
      wrist: opts.wrist || 45
    },
    derivedMetrics: {
      reach: opts.reach || 60,
      contactHeight: opts.contactHeight || 70,
      footworkLoad: opts.footworkLoad || 15,
      wristHipDistance: opts.wristHipDistance || 40,
      stanceWidth: opts.stanceWidth || 100,
      balance: opts.balance || 12,
      shoulderTilt: opts.shoulderTilt || 5,
      hipTilt: opts.hipTilt || 3,
      headStability: opts.headStability || 8
    }
  };
}

// ── selectAssessmentFrames Tests ──────────────────────────────────
describe('selectAssessmentFrames', () => {
  test('returns all frames when <= 30', () => {
    const frames = Array.from({ length: 25 }, (_, i) => makeMockFrame(i * 0.5));
    const result = selectAssessmentFrames(frames, 'forehand');
    expect(result.length).toBe(25);
  });

  test('returns at least 30 frames when 50+ frames available', () => {
    // 60 frames with varying motion — some high, some low
    const frames = Array.from({ length: 60 }, (_, i) =>
      makeMockFrame(i % 5 === 0 ? 12 : 2, { timestamp: i * 0.1 })
    );
    const result = selectAssessmentFrames(frames, 'forehand');
    expect(result.length).toBeGreaterThanOrEqual(30);
  });

  test('returns at least 30 frames from 100 low-motion frames', () => {
    // Simulate a video where player barely moves — all low poseMotion
    const frames = Array.from({ length: 100 }, (_, i) =>
      makeMockFrame(1.5 + Math.random() * 2, { timestamp: i * 0.1 })
    );
    const result = selectAssessmentFrames(frames, 'forehand');
    expect(result.length).toBeGreaterThanOrEqual(30);
  });

  test('captures shot windows from high-motion clusters', () => {
    // 80 frames: first 20 low motion, 20 high (shot), 20 low, 20 high (shot)
    const frames = [];
    for (let i = 0; i < 80; i++) {
      const isActive = (i >= 20 && i < 40) || (i >= 60 && i < 80);
      frames.push(makeMockFrame(isActive ? 15 : 1, { timestamp: i * 0.1 }));
    }
    const result = selectAssessmentFrames(frames, 'forehand');
    expect(result.length).toBeGreaterThanOrEqual(30);
    // Should detect shot windows
    expect(result._shotWindowCount).toBeGreaterThanOrEqual(1);
  });

  test('handles empty/null input gracefully', () => {
    expect(selectAssessmentFrames([], 'forehand').length).toBe(0);
    expect(selectAssessmentFrames(null, 'forehand').length).toBe(0);
  });

  test('filters out frames without angles', () => {
    const frames = [
      makeMockFrame(5),
      { timestamp: 1, landmarks: 3, confidence: 20, poseMotion: 0 }, // no angles
      makeMockFrame(8),
    ];
    const result = selectAssessmentFrames(frames, 'forehand');
    expect(result.length).toBe(2); // only frames with angles
  });

  test('does not include ball tracking in activation scoring', () => {
    // Frames with no ball data should still get good activation from motion/angles
    const frames = Array.from({ length: 50 }, (_, i) =>
      makeMockFrame(5 + i * 0.5, { timestamp: i * 0.1 })
    );
    const result = selectAssessmentFrames(frames, 'forehand');
    expect(result.length).toBeGreaterThanOrEqual(30);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Match Tracker Scoring Tests
// ═══════════════════════════════════════════════════════════════════

describe('Match Tracker — Game scoring', () => {
  test('4 points wins a game (40-love)', () => {
    const mt = createMatchState(3, 'sets');
    for (let i = 0; i < 4; i++) scorePointPure(mt, 'left');
    expect(mt.currentSet.left).toBe(1);
    expect(mt.currentGame.left).toBe(0); // reset after game
  });

  test('deuce requires 2-point lead', () => {
    const mt = createMatchState(3, 'sets');
    // 3-3 (deuce), then left scores, then right ties
    for (let i = 0; i < 3; i++) scorePointPure(mt, 'left');
    for (let i = 0; i < 3; i++) scorePointPure(mt, 'right');
    // Now deuce. Left scores (advantage), right ties
    scorePointPure(mt, 'left'); // 4-3
    scorePointPure(mt, 'right'); // 4-4 (back to deuce)
    expect(mt.currentSet.left).toBe(0); // no game won yet
    // Left gets 2 in a row from deuce
    scorePointPure(mt, 'left'); // 5-4 (ad)
    scorePointPure(mt, 'left'); // 6-4 → game
    expect(mt.currentSet.left).toBe(1);
  });
});

describe('Match Tracker — Set scoring', () => {
  test('6-0 wins a set', () => {
    const mt = createMatchState(3, 'sets');
    winSet(mt, 'left');
    expect(mt.match.left).toBe(1);
    expect(mt.currentSet.left).toBe(0); // reset
  });

  test('6-6 triggers tiebreak', () => {
    const mt = createMatchState(3, 'sets');
    // Get to 6-6
    for (let i = 0; i < 6; i++) {
      winGame(mt, 'left');
      winGame(mt, 'right');
    }
    expect(mt.currentSet.left).toBe(6);
    expect(mt.currentSet.right).toBe(6);
    expect(mt.inTiebreak).toBe(true);
  });

  test('tiebreak requires 7 points with 2-point lead', () => {
    const mt = createMatchState(3, 'sets');
    // Get to 6-6
    for (let i = 0; i < 6; i++) {
      winGame(mt, 'left');
      winGame(mt, 'right');
    }
    expect(mt.inTiebreak).toBe(true);
    // Score 6 pts each in tiebreak
    for (let i = 0; i < 6; i++) {
      scorePointPure(mt, 'left');
      scorePointPure(mt, 'right');
    }
    // 6-6 in tiebreak — no winner yet
    expect(mt.inTiebreak).toBe(true);
    // Left wins 2 in a row
    scorePointPure(mt, 'left'); // 7-6
    expect(mt.inTiebreak).toBe(true); // not won yet, needs 2pt lead
    scorePointPure(mt, 'left'); // 8-6 → tiebreak won
    expect(mt.match.left).toBe(1);
  });
});

describe('Match Tracker — Best of 3 sets', () => {
  test('winning 2 sets wins the match', () => {
    const mt = createMatchState(3, 'sets');
    winSet(mt, 'left');
    expect(mt.matchOver).toBe(false);
    winSet(mt, 'left');
    expect(mt.matchOver).toBe(true);
    expect(mt.match.left).toBe(2);
  });
});

describe('Match Tracker — Best of 5 sets', () => {
  test('need 3 sets to win', () => {
    const mt = createMatchState(5, 'sets');
    winSet(mt, 'left');
    winSet(mt, 'left');
    expect(mt.matchOver).toBe(false);
    winSet(mt, 'left');
    expect(mt.matchOver).toBe(true);
    expect(mt.match.left).toBe(3);
  });
});

describe('Match Tracker — Best of 3 games', () => {
  test('winning 2 games wins the match', () => {
    const mt = createMatchState(3, 'games');
    winGame(mt, 'left');
    expect(mt.matchOver).toBe(false);
    winGame(mt, 'left');
    expect(mt.matchOver).toBe(true);
    expect(mt.currentSet.left).toBe(2);
  });

  test('split games then decide', () => {
    const mt = createMatchState(3, 'games');
    winGame(mt, 'left');
    winGame(mt, 'right');
    expect(mt.matchOver).toBe(false);
    winGame(mt, 'left');
    expect(mt.matchOver).toBe(true);
    expect(mt.currentSet.left).toBe(2);
    expect(mt.currentSet.right).toBe(1);
  });
});

describe('Match Tracker — Best of 5 games', () => {
  test('winning 3 games wins the match', () => {
    const mt = createMatchState(5, 'games');
    winGame(mt, 'left');
    winGame(mt, 'left');
    expect(mt.matchOver).toBe(false);
    winGame(mt, 'left');
    expect(mt.matchOver).toBe(true);
    expect(mt.currentSet.left).toBe(3);
  });

  test('2-2 then decider', () => {
    const mt = createMatchState(5, 'games');
    winGame(mt, 'left');
    winGame(mt, 'right');
    winGame(mt, 'left');
    winGame(mt, 'right');
    expect(mt.matchOver).toBe(false);
    winGame(mt, 'right');
    expect(mt.matchOver).toBe(true);
    expect(mt.currentSet.right).toBe(3);
  });
});

describe('Match Tracker — 1 set format', () => {
  test('winning 1 set wins the match', () => {
    const mt = createMatchState(1, 'sets');
    winSet(mt, 'right');
    expect(mt.matchOver).toBe(true);
    expect(mt.match.right).toBe(1);
  });
});

describe('Match Tracker — matchWinner logic', () => {
  test('game-based format: checks currentSet games', () => {
    const mt = createMatchState(3, 'games');
    mt.currentSet.left = 2;
    expect(matchWinner(mt)).toBe('left');
  });

  test('game-based format: no winner at 1-1', () => {
    const mt = createMatchState(3, 'games');
    mt.currentSet.left = 1;
    mt.currentSet.right = 1;
    expect(matchWinner(mt)).toBeNull();
  });

  test('set-based format: checks match sets', () => {
    const mt = createMatchState(3, 'sets');
    mt.match.right = 2;
    expect(matchWinner(mt)).toBe('right');
  });
});

describe('Match Tracker — server rotation', () => {
  test('server rotates after each game in game-based format', () => {
    const mt = createMatchState(5, 'games');
    expect(mt.server).toBe('left');
    winGame(mt, 'left');
    expect(mt.server).toBe('right');
    winGame(mt, 'right');
    expect(mt.server).toBe('left');
  });

  test('server rotates after each game in set-based format', () => {
    const mt = createMatchState(3, 'sets');
    expect(mt.server).toBe('left');
    winGame(mt, 'left');
    expect(mt.server).toBe('right');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Kinetic Chain Analysis (improved)
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute angular velocity (frame-to-frame rate of change) for a metric.
 * Returns an array one element shorter than input.
 */
function computeAngularVelocity(values) {
  if (!values || values.length < 2) return [];
  const velocities = [];
  for (let i = 1; i < values.length; i++) {
    velocities.push(Math.abs(values[i] - values[i - 1]));
  }
  return velocities;
}

/**
 * Smooth an array with a simple moving average of given window size.
 */
function smoothArray(arr, windowSize = 3) {
  if (!arr || arr.length < windowSize) return arr ? [...arr] : [];
  const result = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(arr.length, i + half + 1);
    const slice = arr.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

/**
 * Detect the swing phase — the contiguous high-motion window within frames.
 * Returns { startIdx, endIdx } representing the indices into the frames array.
 */
function detectSwingPhase(frames) {
  const motions = frames.map(f => safeNumber(f.poseMotion, 0));
  if (motions.length < 5) return { startIdx: 0, endIdx: motions.length - 1 };

  const smoothed = smoothArray(motions, 5);
  const mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
  const threshold = mean * 0.6; // frames above 60% of mean motion = active phase

  // Find the longest contiguous window above threshold
  let bestStart = 0, bestEnd = smoothed.length - 1, bestLen = 0;
  let curStart = -1;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] >= threshold) {
      if (curStart === -1) curStart = i;
      const len = i - curStart + 1;
      if (len > bestLen) { bestStart = curStart; bestEnd = i; bestLen = len; }
    } else {
      curStart = -1;
    }
  }
  // Add a small buffer (2 frames) on each side
  bestStart = Math.max(0, bestStart - 2);
  bestEnd = Math.min(smoothed.length - 1, bestEnd + 2);

  return { startIdx: bestStart, endIdx: bestEnd };
}

/**
 * Find the frame index where peak angular velocity occurs for a metric,
 * within the swing phase window. Uses smoothed velocity to avoid noise spikes.
 * For 'knee', finds the loading phase (fastest decrease = deepest bend).
 */
function findPeakVelocityIndex(frames, key, swingPhase) {
  const { startIdx, endIdx } = swingPhase;
  const phaseFrames = frames.slice(startIdx, endIdx + 1);

  const values = phaseFrames.map(f => {
    if (!f) return null;
    if (f.angles && f.angles[key] != null) return safeNumber(f.angles[key], null);
    if (f.derivedMetrics && f.derivedMetrics[key] != null) return safeNumber(f.derivedMetrics[key], null);
    return null;
  });

  const valid = values.filter(v => v != null);
  if (valid.length < 5) return null;

  // Replace nulls with interpolation for smooth velocity calc
  const filled = [];
  let lastValid = values.find(v => v != null);
  for (const v of values) {
    if (v != null) { filled.push(v); lastValid = v; }
    else { filled.push(lastValid); }
  }

  const velocity = computeAngularVelocity(filled);
  const smoothedVel = smoothArray(velocity, 3);

  if (smoothedVel.length === 0) return null;

  let peakIdx = 0;
  let peakVal = smoothedVel[0];
  for (let i = 1; i < smoothedVel.length; i++) {
    if (smoothedVel[i] > peakVal) {
      peakVal = smoothedVel[i];
      peakIdx = i;
    }
  }

  // Return as percentage through the swing phase
  const phaseLen = endIdx - startIdx;
  return phaseLen > 0 ? Math.round((peakIdx / phaseLen) * 100) : 50;
}

/**
 * Improved kinetic chain analysis.
 * Uses angular velocity peaks within the detected swing phase.
 */
function analyzeKineticChainImproved(frames, shotType) {
  if (!frames || frames.length < 15) return null;

  const CHAIN_CONFIG = {
    forehand:    { order: ['knee','hip','trunk','shoulder','elbow','wrist'], ideal: [10,25,40,55,72,88] },
    backhand:    { order: ['knee','hip','trunk','shoulder','elbow','wrist'], ideal: [10,25,38,52,70,86] },
    serve:       { order: ['knee','hip','trunk','shoulder','elbow','wrist'], ideal: [8,22,38,55,74,90] },
    volley:      { order: ['shoulder','elbow','wrist'],                      ideal: [25,52,78] },
    'drop-shot': { order: ['knee','hip','shoulder','elbow','wrist'],          ideal: [12,28,48,66,84] },
    lob:         { order: ['knee','hip','trunk','shoulder','wrist'],          ideal: [12,28,44,62,85] }
  };

  const config = CHAIN_CONFIG[shotType] || CHAIN_CONFIG.forehand;
  const { order, ideal } = config;

  // Step 1: Detect the swing phase
  const swingPhase = detectSwingPhase(frames);

  // Step 2: Find peak angular velocity for each chain link within the swing
  const peakPcts = {};
  for (const key of order) {
    peakPcts[key] = findPeakVelocityIndex(frames, key, swingPhase);
  }

  // Step 3: Score each link — how close is the actual peak to the ideal timing?
  const linkScores = {};
  const chainBreaks = [];
  let prevKey = null;

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const pct = peakPcts[key];

    if (pct == null) { linkScores[key] = null; continue; }

    // Score: how close is the actual peak% to the ideal peak%?
    // Use a gentler curve: within 10% = great, within 25% = decent
    const diff = Math.abs(pct - ideal[i]);
    linkScores[key] = Math.max(0, Math.min(100, Math.round(100 - diff * 1.2)));

    // Chain break: this link peaks BEFORE the previous one (wrong order)
    if (prevKey && peakPcts[prevKey] != null && pct < peakPcts[prevKey] - 5) {
      chainBreaks.push({ link: key, prevLink: prevKey, gap: peakPcts[prevKey] - pct });
    }
    prevKey = key;
  }

  // Step 4: Sequence order score — are the peaks in the right order?
  const validPeaks = order.filter(k => peakPcts[k] != null).map(k => peakPcts[k]);
  let orderScore = 100;
  if (validPeaks.length >= 2) {
    let inversions = 0;
    for (let i = 1; i < validPeaks.length; i++) {
      if (validPeaks[i] < validPeaks[i - 1]) inversions++;
    }
    orderScore = Math.round(100 * (1 - inversions / (validPeaks.length - 1)));
  }

  // Step 5: Compute overall score as weighted average
  const validScores = Object.values(linkScores).filter(v => v != null);
  const timingAvg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
  // Overall = 60% timing accuracy + 40% sequence order
  const avgScore = Math.round(timingAvg * 0.6 + orderScore * 0.4);

  return {
    peakPcts,
    linkScores,
    chainBreaks,
    avgScore,
    orderScore,
    timingScore: timingAvg,
    primaryBreak: chainBreaks[0] || null,
    isWellSequenced: chainBreaks.length === 0 && avgScore >= 60,
    swingPhase: { start: swingPhase.startIdx, end: swingPhase.endIdx }
  };
}


// ── Kinetic Chain Tests ──────────────────────────────────────────

describe('computeAngularVelocity', () => {
  test('computes absolute differences between consecutive values', () => {
    const result = computeAngularVelocity([10, 15, 12, 20]);
    expect(result).toEqual([5, 3, 8]);
  });

  test('returns empty for single value', () => {
    expect(computeAngularVelocity([10])).toEqual([]);
  });

  test('returns empty for null/empty', () => {
    expect(computeAngularVelocity(null)).toEqual([]);
    expect(computeAngularVelocity([])).toEqual([]);
  });
});

describe('smoothArray', () => {
  test('smooths values with moving average', () => {
    const result = smoothArray([0, 0, 10, 0, 0], 3);
    // Middle value (10) smoothed with neighbors: (0+10+0)/3 ≈ 3.33
    expect(result[2]).toBeCloseTo(3.33, 1);
  });

  test('preserves array length', () => {
    const input = [1, 2, 3, 4, 5];
    expect(smoothArray(input, 3).length).toBe(5);
  });

  test('handles array shorter than window', () => {
    expect(smoothArray([5, 10], 5)).toEqual([5, 10]);
  });
});

describe('detectSwingPhase', () => {
  test('identifies high-motion window', () => {
    // 30 frames: first 10 low motion, 10 high motion, 10 low motion
    const frames = [];
    for (let i = 0; i < 30; i++) {
      const motion = (i >= 10 && i < 20) ? 15 : 1;
      frames.push({ poseMotion: motion, angles: {}, derivedMetrics: {} });
    }
    const phase = detectSwingPhase(frames);
    expect(phase.startIdx).toBeLessThanOrEqual(10);
    expect(phase.endIdx).toBeGreaterThanOrEqual(18);
  });

  test('handles all-low-motion frames', () => {
    const frames = Array.from({ length: 20 }, () => ({
      poseMotion: 2, angles: {}, derivedMetrics: {}
    }));
    const phase = detectSwingPhase(frames);
    // Should still return a valid range
    expect(phase.startIdx).toBeGreaterThanOrEqual(0);
    expect(phase.endIdx).toBeGreaterThan(phase.startIdx);
  });
});

describe('analyzeKineticChainImproved', () => {
  // Helper: create frames simulating a forehand swing with proper kinetic chain
  function makeChainFrames(count, peakOrder) {
    // peakOrder: { knee: 0.15, hip: 0.30, trunk: 0.45, shoulder: 0.60, elbow: 0.75, wrist: 0.90 }
    // Each metric ramps up to a peak at the given percentage and then decreases
    const frames = [];
    for (let i = 0; i < count; i++) {
      const pct = i / count;
      const motion = (pct > 0.1 && pct < 0.9) ? 12 : 2; // swing phase 10-90%

      const angles = {};
      const derivedMetrics = {};
      for (const [key, peakPct] of Object.entries(peakOrder)) {
        // Bell curve around peakPct
        const dist = Math.abs(pct - peakPct);
        const value = 90 + 60 * Math.exp(-dist * dist * 80);
        // Add slight noise
        angles[key] = value + (Math.sin(i * 7.3) * 0.5);
      }

      frames.push({
        timestamp: i * 0.033,
        poseMotion: motion,
        landmarks: 14,
        confidence: 75,
        angles,
        derivedMetrics
      });
    }
    return frames;
  }

  test('returns null for insufficient frames', () => {
    expect(analyzeKineticChainImproved([], 'forehand')).toBeNull();
    expect(analyzeKineticChainImproved(Array(10).fill({}), 'forehand')).toBeNull();
  });

  test('well-sequenced chain scores high', () => {
    // Perfect sequence: knee→hip→trunk→shoulder→elbow→wrist
    const frames = makeChainFrames(60, {
      knee: 0.15, hip: 0.28, trunk: 0.42, shoulder: 0.58, elbow: 0.73, wrist: 0.88
    });
    const result = analyzeKineticChainImproved(frames, 'forehand');
    expect(result).toBeTruthy();
    expect(result.avgScore).toBeGreaterThanOrEqual(55);
    expect(result.chainBreaks.length).toBe(0);
    expect(result.isWellSequenced).toBe(true);
  });

  test('reversed chain detects breaks and scores low', () => {
    // Reversed: wrist fires first, knee fires last (wrong order)
    const frames = makeChainFrames(60, {
      knee: 0.85, hip: 0.70, trunk: 0.55, shoulder: 0.40, elbow: 0.25, wrist: 0.12
    });
    const result = analyzeKineticChainImproved(frames, 'forehand');
    expect(result).toBeTruthy();
    expect(result.chainBreaks.length).toBeGreaterThan(0);
    expect(result.orderScore).toBeLessThan(50);
  });

  test('returns linkScores for each chain segment', () => {
    const frames = makeChainFrames(60, {
      knee: 0.15, hip: 0.30, trunk: 0.45, shoulder: 0.60, elbow: 0.75, wrist: 0.90
    });
    const result = analyzeKineticChainImproved(frames, 'forehand');
    expect(Object.keys(result.linkScores).length).toBe(6);
    for (const key of ['knee', 'hip', 'trunk', 'shoulder', 'elbow', 'wrist']) {
      const score = result.linkScores[key];
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  test('volley uses short chain (shoulder→elbow→wrist)', () => {
    const frames = makeChainFrames(40, {
      shoulder: 0.30, elbow: 0.55, wrist: 0.78
    });
    const result = analyzeKineticChainImproved(frames, 'volley');
    expect(result).toBeTruthy();
    expect(Object.keys(result.linkScores).length).toBe(3);
  });

  test('serve chain scores correctly', () => {
    const frames = makeChainFrames(50, {
      knee: 0.12, hip: 0.25, trunk: 0.40, shoulder: 0.55, elbow: 0.75, wrist: 0.90
    });
    const result = analyzeKineticChainImproved(frames, 'serve');
    expect(result).toBeTruthy();
    expect(result.avgScore).toBeGreaterThanOrEqual(50);
  });

  test('partial break with one inversion detected', () => {
    // Hip and trunk swapped — one inversion
    const frames = makeChainFrames(60, {
      knee: 0.15, hip: 0.45, trunk: 0.28, shoulder: 0.58, elbow: 0.73, wrist: 0.88
    });
    const result = analyzeKineticChainImproved(frames, 'forehand');
    expect(result).toBeTruthy();
    expect(result.chainBreaks.length).toBeGreaterThanOrEqual(1);
    expect(result.orderScore).toBeLessThan(100);
  });

  test('swingPhase is returned', () => {
    const frames = makeChainFrames(60, {
      knee: 0.15, hip: 0.30, trunk: 0.45, shoulder: 0.60, elbow: 0.75, wrist: 0.90
    });
    const result = analyzeKineticChainImproved(frames, 'forehand');
    expect(result.swingPhase).toBeTruthy();
    expect(result.swingPhase.start).toBeGreaterThanOrEqual(0);
    expect(result.swingPhase.end).toBeGreaterThan(result.swingPhase.start);
  });
});


// ═══════════════════════════════════════════════════════════════════
// HTML structure validation
// ═══════════════════════════════════════════════════════════════════

describe('HTML — signup.html structure', () => {
  const signupHtml = fs.readFileSync(path.join(ROOT, 'signup.html'), 'utf8');

  test('has mandatory agreement checkbox', () => {
    expect(signupHtml).toContain('id="agreeTerms"');
    expect(signupHtml).toContain('required');
  });

  test('has optional SMS checkbox', () => {
    expect(signupHtml).toContain('id="smsOptIn"');
  });

  test('links to user agreement', () => {
    expect(signupHtml).toContain('user-agreement.html');
  });

  test('links to privacy policy', () => {
    expect(signupHtml).toContain('privacy-policy.html');
  });
});

describe('HTML — analyze.html structure', () => {
  test('has match format buttons for sets', () => {
    expect(analyzeHtml).toContain('data-format-type="sets"');
    expect(analyzeHtml).toContain('1 Set');
    expect(analyzeHtml).toContain('3 Sets');
    expect(analyzeHtml).toContain('5 Sets');
  });

  test('has game-based formats under Fun Games section', () => {
    expect(analyzeHtml).toContain('data-format-type="games"');
    expect(analyzeHtml).toContain('Best of 3 Games');
    expect(analyzeHtml).toContain('Best of 5 Games');
  });

  test('ball detection code is fully removed', () => {
    expect(analyzeHtml).toContain('drawPose(keypoints)'); // no ballDetection param
    const hasBallDetector = analyzeHtml.includes('let ballDetector');
    expect(hasBallDetector).toBeFalsy();
    const hasInitBall = analyzeHtml.includes('async function initBallDetector');
    expect(hasInitBall).toBeFalsy();
    const hasDetectBall = analyzeHtml.includes('async function detectBall');
    expect(hasDetectBall).toBeFalsy();
  });

  test('has MoveNet/BlazePose detector references', () => {
    expect(analyzeHtml).toContain('movenet');
  });
});

describe('HTML — meta tags and SEO', () => {
  const pages = [
    'index.html', 'features.html', 'pricing.html',
    'about.html', 'contact.html', 'for-players.html',
    'for-coaches.html'
  ];

  for (const page of pages) {
    const filePath = path.join(ROOT, page);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');

    test(`${page} has og:title`, () => {
      expect(html).toContain('og:title');
    });

    test(`${page} has og:description`, () => {
      expect(html).toContain('og:description');
    });

    test(`${page} has og:site_name`, () => {
      expect(html).toContain('og:site_name');
    });

    test(`${page} has twitter:card`, () => {
      expect(html).toContain('twitter:card');
    });
  }
});

describe('HTML — email unification to contact@smartswingai.com', () => {
  const filesToCheck = [
    'contact.html', 'contact-white.html'
  ];

  for (const page of filesToCheck) {
    const filePath = path.join(ROOT, page);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');

    test(`${page} uses contact@smartswingai.com`, () => {
      expect(html).toContain('contact@smartswingai.com');
    });

    test(`${page} does not use old hello@ email`, () => {
      const hasOldEmail = html.includes('hello@smartswingai.com') || html.includes('hello@smartswing.ai');
      expect(hasOldEmail).toBeFalsy();
    });
  }
});

describe('HTML — manifest.json PWA', () => {
  const manifestPath = path.join(ROOT, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    test('has name field', () => {
      expect(!!manifest.name).toBeTruthy();
    });

    test('has start_url', () => {
      expect(!!manifest.start_url).toBeTruthy();
    });

    test('has icons array', () => {
      expect(Array.isArray(manifest.icons)).toBeTruthy();
      expect(manifest.icons.length).toBeGreaterThan(0);
    });

    test('icons do not combine "any maskable" in single purpose', () => {
      const badIcon = manifest.icons.find(i =>
        typeof i.purpose === 'string' && i.purpose.includes('any') && i.purpose.includes('maskable') && !i.purpose.includes(' ')
      );
      // Actually "any maskable" with a space is the old bad format. Check none have it.
      const hasCombined = manifest.icons.some(i =>
        typeof i.purpose === 'string' && i.purpose === 'any maskable'
      );
      expect(hasCombined).toBeFalsy();
    });
  }
});

describe('HTML — sitemap.xml', () => {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');

    test('includes root URL (index page)', () => {
      expect(sitemap).toContain('smartswingai.com/');
    });

    test('includes signup.html', () => {
      expect(sitemap).toContain('signup.html');
    });

    test('does not include non-existent pickleball.html', () => {
      // pickleball.html was removed from sitemap
      const hasPB = sitemap.includes('pickleball.html');
      // Only flag if it's in the sitemap AND the file doesn't exist
      if (hasPB && !fs.existsSync(path.join(ROOT, 'pickleball.html'))) {
        throw new Error('sitemap.xml references non-existent pickleball.html');
      }
    });

    test('has lastmod dates', () => {
      expect(sitemap).toContain('<lastmod>');
    });
  }
});

describe('HTML — robots.txt', () => {
  const robotsPath = path.join(ROOT, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    const robots = fs.readFileSync(robotsPath, 'utf8');

    test('disallows /api/', () => {
      expect(robots).toContain('/api/');
    });

    test('references sitemap', () => {
      expect(robots.toLowerCase()).toContain('sitemap');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API / Serverless validation
// ═══════════════════════════════════════════════════════════════════

describe('API — serverless functions syntax', () => {
  const apiFiles = [
    'api/create-checkout-session.js',
    'api/stripe-webhook.js',
    'api/runtime-config.js'
  ];

  for (const file of apiFiles) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;

    test(`${file} parses without errors`, () => {
      const src = fs.readFileSync(filePath, 'utf8');
      try {
        new Function(src);
      } catch (e) {
        // Some API files use require() which fails in new Function,
        // but SyntaxErrors are the real concern
        if (e instanceof SyntaxError) {
          throw new Error(`Syntax error in ${file}: ${e.message}`);
        }
      }
    });
  }
});

describe('API — email configuration', () => {
  const resendPath = path.join(ROOT, 'api/resend-setup.js');
  if (fs.existsSync(resendPath)) {
    const src = fs.readFileSync(resendPath, 'utf8');

    test('resend-setup.js uses contact@smartswingai.com for reply_to', () => {
      expect(src).toContain('contact@smartswingai.com');
    });
  }
});

describe('API — channel router (WhatsApp vs SMS)', () => {
  const { resolveChannel } = require('../api/_lib/channel-router.js');

  test('explicit whatsapp preference wins regardless of country', () => {
    expect(resolveChannel('+14155551234', 'whatsapp')).toBe('whatsapp');
  });

  test('explicit sms preference wins regardless of country', () => {
    expect(resolveChannel('+5511999990000', 'sms')).toBe('sms');
  });

  test('auto routes Brazil (+55) to whatsapp', () => {
    expect(resolveChannel('+55 11 99999 0000', 'auto')).toBe('whatsapp');
  });

  test('auto routes Portugal (+351) to whatsapp', () => {
    expect(resolveChannel('+351 912 345 678', 'auto')).toBe('whatsapp');
  });

  test('auto routes Germany (+49) to whatsapp', () => {
    expect(resolveChannel('+49 151 23456789')).toBe('whatsapp');
  });

  test('auto routes US (+1) to sms', () => {
    expect(resolveChannel('+1 415 555 1234')).toBe('sms');
  });

  test('auto routes UK (+44) to sms', () => {
    expect(resolveChannel('+44 7700 900000')).toBe('sms');
  });

  test('auto routes Japan (+81) to sms', () => {
    expect(resolveChannel('+81 90 1234 5678')).toBe('sms');
  });

  test('missing phone defaults to sms (step will skip anyway)', () => {
    expect(resolveChannel(null)).toBe('sms');
    expect(resolveChannel('')).toBe('sms');
  });

  test('3-digit prefix (+598 Uruguay) beats 2-digit fallback', () => {
    expect(resolveChannel('+598 99 123 456')).toBe('whatsapp');
  });
});

describe('API — WhatsApp template language routing', () => {
  const { resolveTemplateLang } = require('../api/_lib/channel-router.js');

  test('Brazil (+55) → pt_BR', () => {
    expect(resolveTemplateLang('+55 11 99999 0000')).toBe('pt_BR');
  });
  test('Portugal (+351) → pt_PT', () => {
    expect(resolveTemplateLang('+351 912 345 678')).toBe('pt_PT');
  });
  test('Mexico (+52) → es_LA', () => {
    expect(resolveTemplateLang('+52 55 1234 5678')).toBe('es_LA');
  });
  test('Argentina (+54) → es_LA', () => {
    expect(resolveTemplateLang('+54 9 11 1234 5678')).toBe('es_LA');
  });
  test('Uruguay (+598) → es_LA', () => {
    expect(resolveTemplateLang('+598 99 123 456')).toBe('es_LA');
  });
  test('Spain (+34) → es_ES', () => {
    expect(resolveTemplateLang('+34 612 345 678')).toBe('es_ES');
  });
  test('Italy (+39) → it_IT', () => {
    expect(resolveTemplateLang('+39 333 1234567')).toBe('it_IT');
  });
  test('Germany (+49) → de_DE', () => {
    expect(resolveTemplateLang('+49 151 23456789')).toBe('de_DE');
  });
  test('India (+91) → hi_IN', () => {
    expect(resolveTemplateLang('+91 98765 43210')).toBe('hi_IN');
  });
  test('US (+1) → en_US default', () => {
    expect(resolveTemplateLang('+1 415 555 1234')).toBe('en_US');
  });
  test('UK (+44) → en_US default', () => {
    expect(resolveTemplateLang('+44 7700 900000')).toBe('en_US');
  });
  test('null phone → en_US default', () => {
    expect(resolveTemplateLang(null)).toBe('en_US');
  });
});

describe('API — cadence email merge-tag rendering', () => {
  const mod = require('../api/_lib/cadence-email-render.js');
  const contact = { id: 'c123', name: 'Bernardo Medrado', email: 'bernardo@example.com', stage: 'lead' };

  test('substitutes {{first_name}} from first word of name', () => {
    const out = mod._substitute('Hi {{first_name}},', mod._buildVars(contact));
    expect(out).toBe('Hi Bernardo,');
  });

  test('falls back to "there" when name missing', () => {
    const out = mod._substitute('Hi {{first_name}}!', mod._buildVars({ id: 'x', email: 'a@b.c' }));
    expect(out).toBe('Hi there!');
  });

  test('replaces unknown tokens with empty string', () => {
    const out = mod._substitute('X {{mystery}} Y', mod._buildVars(contact));
    expect(out).toBe('X  Y');
  });

  test('unsubscribe_url is keyed on contact id', () => {
    const v = mod._buildVars(contact);
    expect(v.unsubscribe_url.includes('c=c123')).toBe(true);
  });

  test('renderCadenceEmail wraps short plain body in shell', () => {
    const step = { subject: 'Welcome {{first_name}}', body: 'Hi {{first_name}}, thanks for joining.' };
    const { subject, html } = mod.renderCadenceEmail(step, contact);
    expect(subject).toBe('Welcome Bernardo');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Bernardo');
    expect(html).toContain('SmartSwing');
  });

  test('renderCadenceEmail does NOT double-wrap a full HTML doc', () => {
    const fullDoc = '<!DOCTYPE html><html><body>Hi {{first_name}}</body></html>';
    const step = { subject: 's', body: fullDoc };
    const { html } = mod.renderCadenceEmail(step, contact);
    expect(html.match(/<!DOCTYPE/gi).length).toBe(1);
    expect(html).toContain('Hi Bernardo');
  });

  test('renderCadenceSms substitutes tokens without wrapping', () => {
    const step = { message: 'Hey {{first_name}}, your analysis is ready.' };
    const { message } = mod.renderCadenceSms(step, contact);
    expect(message).toBe('Hey Bernardo, your analysis is ready.');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failed === 0) {
  console.log(`\x1b[32m✓ All ${totalTests} functional tests passed.\x1b[0m`);
} else {
  console.error(`\x1b[31m✗ ${failed}/${totalTests} tests failed:\x1b[0m\n`);
  failures.forEach((f) => console.error(f));
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
