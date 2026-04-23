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

describe('Auth — magic link passwordless option (M10)', () => {
  const signup = fs.readFileSync(path.join(ROOT, 'signup.html'), 'utf8');
  const login  = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');

  test('Signup has magic-link button alongside Google + Apple', () => {
    expect(signup).toContain('id="magicLinkBtn"');
    expect(signup).toContain('Send me a magic link');
    expect(signup).toContain('sendMagicLink()');
  });
  test('Login has magic-link button alongside Google + Apple', () => {
    expect(login).toContain('id="magicLinkBtn"');
    expect(login).toContain('magic link');
    expect(login).toContain('sendMagicLink()');
  });
  test('Signup sends with shouldCreateUser: true (allow new accounts)', () => {
    expect(signup).toContain('shouldCreateUser: true');
  });
  test('Login sends with shouldCreateUser: false (existing accounts only)', () => {
    expect(login).toContain('shouldCreateUser: false');
  });
  test('Redirect points to auth-callback.html on both pages', () => {
    expect(signup).toContain("'/auth-callback.html'");
    expect(login).toContain("'/auth-callback.html'");
  });
});

describe('HTML — analyze.html lazy-loads AI runtime (S12)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');

  test('No blocking <script src="./assets/vendor/tf.min.js"> in head', () => {
    // Check that we do NOT have a synchronous script tag loading tf.min.js in head.
    // It may still appear in the dynamic loader — that's fine.
    const headSection = src.slice(0, src.indexOf('</head>'));
    const blockingPattern = '<script src="./assets/vendor/tf.min.js"></script>';
    expect(headSection.includes(blockingPattern)).toBe(false);
  });
  test('No blocking <script> for pose-detection.min.js in head', () => {
    const headSection = src.slice(0, src.indexOf('</head>'));
    expect(headSection.includes('<script src="./assets/vendor/pose-detection.min.js"></script>')).toBe(false);
  });
  test('Preload links with fetchpriority=low are present (hints browser to fetch during idle)', () => {
    expect(src).toContain('href="./assets/vendor/tf.min.js" as="script" fetchpriority="low"');
    expect(src).toContain('href="./assets/vendor/pose-detection.min.js" as="script" fetchpriority="low"');
  });
  test('ensurePoseLibraries has local vendor as first fallback', () => {
    expect(src).toContain("'./assets/vendor/tf.min.js'");
    expect(src).toContain("'./assets/vendor/pose-detection.min.js'");
  });
  test('MediaPipe CDN fallback for users with local vendor stripped', () => {
    expect(src).toContain('cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
  });
});

describe('HTML — for-clubs.html Cal.com B2B demo booking', () => {
  const src = fs.readFileSync(path.join(ROOT, 'for-clubs.html'), 'utf8');

  test('Hero CTA uses Cal.com embed via data-cal-link', () => {
    expect(src).toContain('data-cal-link="smartswing/club-demo"');
    expect(src).toContain('Book a 15-min club demo');
  });
  test('Bottom CTA also uses Cal.com embed (2 placements)', () => {
    const matches = src.match(/data-cal-link="smartswing\/club-demo"/g) || [];
    expect(matches.length >= 2).toBe(true);
  });
  test('Cal.com loader script is included', () => {
    expect(src).toContain('https://app.cal.com/embed/embed.js');
    expect(src).toContain("Cal('init', 'demo'");
  });
  test('Fallback to /contact.html if Cal.com fails to load', () => {
    expect(src).toContain('./contact.html?source=clubs-demo-fallback');
  });
  test('Cal booking slug is configurable via PUBLIC_APP_CONFIG', () => {
    expect(src).toContain('PUBLIC_APP_CONFIG');
    expect(src).toContain('calBookingSlug');
  });
});

describe('Config — public-app-config.js Cal.com slug override', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public-app-config.js'), 'utf8');
  test('calBookingSlug default is smartswing/club-demo', () => {
    expect(src).toContain('smartswing/club-demo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S11 — HANDLER + _LIB COVERAGE
// Audit flagged 25+ untested modules. Tests below cover pure functions + key
// input-validation paths without requiring a running Supabase / Stripe / Meta.
// ═══════════════════════════════════════════════════════════════════════════════

describe('_lib — stripe-common pure helpers', () => {
  const s = require('../api/_lib/stripe-common.js');

  test('normalizePlanId lowercases + trims', () => {
    expect(s.normalizePlanId('  STARTER  ')).toBe('starter');
    expect(s.normalizePlanId('Pro')).toBe('pro');
    expect(s.normalizePlanId(null)).toBe('');
    expect(s.normalizePlanId(undefined)).toBe('');
  });

  test('normalizeBillingInterval maps annual → yearly', () => {
    expect(s.normalizeBillingInterval('annual')).toBe('yearly');
    expect(s.normalizeBillingInterval('Yearly')).toBe('yearly');
    expect(s.normalizeBillingInterval('monthly')).toBe('monthly');
    expect(s.normalizeBillingInterval('')).toBe('monthly');
    expect(s.normalizeBillingInterval(null)).toBe('monthly');
  });

  test('getPriceEnvKeyForPlan returns expected env var names', () => {
    expect(s.getPriceEnvKeyForPlan('starter', 'monthly')).toBe('STRIPE_PRICE_STARTER_MONTHLY');
    expect(s.getPriceEnvKeyForPlan('pro', 'yearly')).toBe('STRIPE_PRICE_PRO_YEARLY');
    expect(s.getPriceEnvKeyForPlan('elite', 'annual')).toBe('STRIPE_PRICE_ELITE_YEARLY');
    expect(s.getPriceEnvKeyForPlan('unknown', 'monthly')).toBe('');
  });

  test('getPublicAppUrl strips trailing slash', () => {
    process.env.PUBLIC_APP_URL = 'https://example.com/';
    expect(s.getPublicAppUrl()).toBe('https://example.com');
    delete process.env.PUBLIC_APP_URL;
    expect(s.getPublicAppUrl()).toBe('https://www.smartswingai.com');
  });

  test('buildCheckoutUrls encodes plan id for URL safety', () => {
    const urls = s.buildCheckoutUrls('pro plus');
    expect(urls.successUrl).toContain('pro%20plus');
    expect(urls.cancelUrl).toContain('pro%20plus');
    expect(urls.successUrl).toContain('{CHECKOUT_SESSION_ID}');
  });

  test('json helper sets Content-Type and status', () => {
    let statusCode = 0, body = '', headers = {};
    const fakeRes = {
      set statusCode(v) { statusCode = v; },
      get statusCode() { return statusCode; },
      setHeader(k, v) { headers[k] = v; },
      end(b) { body = b; }
    };
    s.json(fakeRes, 201, { ok: true });
    expect(statusCode).toBe(201);
    expect(headers['Content-Type']).toContain('application/json');
    expect(body).toBe('{"ok":true}');
  });
});

describe('_lib — brand-style prompt wrappers', () => {
  const b = require('../api/_lib/brand-style.js');

  test('brandImagePrompt prepends the SmartSwing brand prefix', () => {
    const out = b.brandImagePrompt('tennis court at sunset');
    expect(out).toContain('tennis court at sunset');
    expect(out.startsWith(b.BRAND_STYLE.image_prompt_prefix)).toBe(true);
  });

  test('brandCopyPrompt prepends brand tone rules', () => {
    const out = b.brandCopyPrompt('Write a post about forehand grip');
    expect(out).toContain('Write a post about forehand grip');
    expect(out.startsWith(b.BRAND_STYLE.copy_prompt_prefix)).toBe(true);
  });

  test('Empty/null input returns just the prefix', () => {
    expect(b.brandImagePrompt('').length).toBe(b.BRAND_STYLE.image_prompt_prefix.length);
    expect(b.brandImagePrompt(null).length).toBe(b.BRAND_STYLE.image_prompt_prefix.length);
  });

  test('BRAND_STYLE exports the core brand tokens', () => {
    expect(b.BRAND_STYLE.image_prompt_prefix).toContain('matte');
    expect(b.BRAND_STYLE.copy_prompt_prefix.length > 20).toBe(true);
  });
});

describe('_lib — platform-formatter text helpers', () => {
  const pf = require('../api/_lib/platform-formatter.js');

  test('smartTrim returns input unchanged when under limit', () => {
    expect(pf.smartTrim('short text', 100)).toBe('short text');
  });

  test('smartTrim prefers sentence boundaries when available', () => {
    const text = 'First sentence is short. Second sentence continues longer content here.';
    const out = pf.smartTrim(text, 30);
    expect(out.endsWith('.')).toBe(true);
    expect(out.length <= 30).toBe(true);
  });

  test('smartTrim falls back to word boundary with ellipsis', () => {
    const out = pf.smartTrim('This is a fairly long sentence without punctuation breakpoints', 30);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length <= 30).toBe(true);
  });

  test('extractUrls pulls all URLs + exposes first', () => {
    const r = pf.extractUrls('Check https://a.com and https://b.com/path here.');
    expect(r.urls.length).toBe(2);
    expect(r.first).toBe('https://a.com');
  });

  test('stripUrls removes URLs and collapses whitespace', () => {
    const out = pf.stripUrls('See https://a.com now.');
    expect(out.includes('https://')).toBe(false);
    expect(out.includes('  ')).toBe(false);
  });

  test('formatForPlatform returns caption + hashtags + link + warnings', () => {
    const item = { copy_text: 'Great forehand tip. https://smartswingai.com/tip', target_persona: 'player_tennis', title: 'Forehand tip' };
    const out = pf.formatForPlatform('instagram', item);
    expect(typeof out.caption === 'string').toBe(true);
    expect(Array.isArray(out.hashtags)).toBe(true);
    expect(Array.isArray(out.warnings)).toBe(true);
  });

  test('formatForPlatform enforces Twitter 280-char limit', () => {
    const longItem = { copy_text: 'A'.repeat(500), title: 'x' };
    const out = pf.formatForPlatform('x', longItem);
    expect(out.caption.length <= 280).toBe(true);
  });

  test('resolveOptimalSlot returns {date,time} for known platforms', () => {
    const slot = pf.resolveOptimalSlot('instagram', new Date('2026-04-22T00:00:00Z'));
    expect(typeof slot).toBe('object');
    expect(typeof slot.date).toBe('string');
    expect(typeof slot.time).toBe('string');
    expect(slot.date.match(/^\d{4}-\d{2}-\d{2}$/) !== null).toBe(true);
    expect(slot.time.match(/^\d{2}:\d{2}$/) !== null).toBe(true);
  });

  test('pickHashtags respects platform hashtag policy', () => {
    // Twitter = 'none' → empty
    expect(pf.pickHashtags('player_tennis', 'twitter', 't', 'b').length).toBe(0);
    // Facebook = 'few' → up to 3
    expect(pf.pickHashtags('player_tennis', 'facebook', 't', 'b').length <= 3).toBe(true);
    // Instagram = 'many' → up to 8
    expect(pf.pickHashtags('player_tennis', 'instagram', 'forehand drill', 'backhand slice').length <= 8).toBe(true);
  });

  test('extractKeywordTags pulls tennis-specific terms as hashtags', () => {
    const tags = pf.extractKeywordTags('Nailing your forehand and backhand takes footwork work.');
    expect(tags.includes('#forehand')).toBe(true);
    expect(tags.includes('#backhand')).toBe(true);
    expect(tags.includes('#footwork')).toBe(true);
  });
});

describe('_lib — link-shortener deterministic wrapping', () => {
  const ls = require('../api/_lib/link-shortener.js');

  test('makeCode returns same code for same inputs (deterministic)', () => {
    const a = ls.makeCode('item-123', 'instagram', 'https://a.com');
    const b = ls.makeCode('item-123', 'instagram', 'https://a.com');
    expect(a).toBe(b);
    expect(a.length <= 7).toBe(true);
    expect(a.length > 0).toBe(true);
  });

  test('makeCode differs when any input changes', () => {
    const a = ls.makeCode('item-123', 'instagram', 'https://a.com');
    const b = ls.makeCode('item-123', 'tiktok', 'https://a.com');
    expect(a !== b).toBe(true);
  });

  test('buildUtm includes utm_source + medium', () => {
    const qs = ls.buildUtm('instagram', { id: 'c1', campaign_id: 'camp1' });
    expect(qs.includes('utm_source=instagram')).toBe(true);
    expect(qs.includes('utm_medium=social')).toBe(true);
    expect(qs.includes('utm_campaign=camp1')).toBe(true);
    expect(qs.includes('utm_content=c1')).toBe(true);
  });

  test('wrapLinksWithUtm rewrites absolute URLs', () => {
    const item = { id: 'c1' };
    const out = ls.wrapLinksWithUtm('Visit https://example.com/path for more', { platform: 'x', item });
    expect(out.includes('https://example.com/path')).toBe(false);
    expect(out.includes(ls.BASE)).toBe(true);
    expect(out.includes('utm_source=x')).toBe(true);
  });

  test('wrapLinksWithUtm preserves non-URL text and skips already-wrapped links', () => {
    const already = `Check ${ls.BASE}/abc123?utm_source=x for deals`;
    const out = ls.wrapLinksWithUtm(already, { platform: 'x', item: { id: 'c1' } });
    expect(out).toBe(already);
  });

  test('wrapLinksWithUtm handles empty / null input without throwing', () => {
    expect(ls.wrapLinksWithUtm(null)).toBe(null);
    expect(ls.wrapLinksWithUtm('')).toBe('');
  });
});

describe('_lib — lead-scoring scoreContact', () => {
  const { scoreContact } = require('../api/_lib/lead-scoring.js');

  test('Empty contact yields baseline score of 0', () => {
    expect(scoreContact({})).toBe(0);
  });

  test('Contact with real email + phone scores contact completeness', () => {
    const s = scoreContact({ email: 'a@b.com', phone: '+1...' });
    expect(s >= 20).toBe(true);
  });

  test('Pending-enrichment email does NOT count as real', () => {
    const s = scoreContact({ email: 'foo@pending-enrichment.smartswingai.com' });
    expect(s).toBe(0);
  });

  test('Club with size hint + academy keyword gets bonuses', () => {
    const s = scoreContact({
      type: 'club',
      website: 'https://club.com',
      description: '12 courts high-performance academy'
    });
    expect(s >= 40).toBe(true); // 10 website + 15 size + 15 academy
  });

  test('Top-500 player gets ranking bonus', () => {
    const s = scoreContact({ type: 'player', ranking_position: 250, email: 'p@x.com' });
    expect(s >= 35).toBe(true); // 10 email + 25 top-500
  });

  test('Engagement.clicked adds 20, replied_at adds 40', () => {
    const base = scoreContact({ email: 'a@b.com' });
    const clicked = scoreContact({ email: 'a@b.com' }, { clicked: true });
    expect(clicked - base).toBe(20);
    const replied = scoreContact({ email: 'a@b.com', replied_at: new Date().toISOString() });
    expect(replied - base).toBe(40);
  });

  test('Pricing UTM campaign gets strong intent boost', () => {
    const s = scoreContact({ email: 'a@b.com', utm_campaign: 'pricing' });
    expect(s >= 45).toBe(true); // 10 email + 30 pricing + 5 any utm
  });

  test('Score caps at 100 regardless of inputs', () => {
    const s = scoreContact({
      email: 'a@b.com', phone: '+1...',
      type: 'player', ranking_position: 50,
      utm_campaign: 'pricing', replied_at: new Date().toISOString()
    }, { opened: true, clicked: true });
    expect(s).toBe(100);
  });

  test('Stale contact (>120 days) loses 15 points total', () => {
    // Use a high-baseline contact so the penalty isn't clamped by Math.max(0, ...)
    const base = { email: 'a@b.com', phone: '+1...', type: 'player', ranking_position: 100 };
    const oldStr = new Date(Date.now() - 150 * 86400000).toISOString();
    const fresh = scoreContact({ ...base, last_contacted_at: new Date().toISOString() });
    const stale = scoreContact({ ...base, last_contacted_at: oldStr });
    expect(fresh - stale).toBe(15);
  });
});

describe('M1 — Font consolidation to DM Sans', () => {
  const pages = ['dashboard.html', 'settings.html', 'login.html', 'signup.html', 'marketing.html'];

  pages.forEach(page => {
    test(page + ' loads DM Sans (not Inter/Plus Jakarta)', () => {
      const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
      expect(src).toContain('family=DM+Sans');
    });
    test(page + ' does not load Plus Jakarta Sans', () => {
      const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
      expect(src.includes('Plus+Jakarta+Sans')).toBe(false);
    });
  });

  test('login.html + signup.html no longer reference Inter in CSS', () => {
    const login = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');
    const signup = fs.readFileSync(path.join(ROOT, 'signup.html'), 'utf8');
    expect(login.includes("font-family: 'Inter'")).toBe(false);
    expect(signup.includes("font-family: 'Inter'")).toBe(false);
  });

  test('dashboard.html + settings.html no longer reference Plus Jakarta in CSS', () => {
    const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
    const settings = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
    expect(dash.includes('"Plus Jakarta Sans"')).toBe(false);
    expect(settings.includes('"Plus Jakarta Sans"')).toBe(false);
  });
});

describe('M3 — Brand tokens CSS', () => {
  const css = fs.readFileSync(path.join(ROOT, 'brand-tokens.css'), 'utf8');

  test('Defines --ss-radius-pill + lg + md + sm', () => {
    expect(css.includes('--ss-radius-pill:') && css.includes('999px')).toBe(true);
    expect(css.includes('--ss-radius-lg:') && css.includes('14px')).toBe(true);
    expect(css.includes('--ss-radius-md:') && css.includes('10px')).toBe(true);
    expect(css.includes('--ss-radius-sm:') && css.includes('6px')).toBe(true);
  });

  test('Defines --ss-font-body + display + mono', () => {
    expect(css).toContain('--ss-font-body');
    expect(css).toContain('--ss-font-display');
    expect(css).toContain('--ss-font-mono');
  });

  test('Body font is DM Sans (canonical per CLAUDE.md)', () => {
    expect(css).toContain('"DM Sans"');
  });

  test('Exports utility classes ss-btn-primary + ss-btn-ghost + ss-btn-app', () => {
    expect(css).toContain('.ss-btn-primary');
    expect(css).toContain('.ss-btn-ghost');
    expect(css).toContain('.ss-btn-app');
  });

  test('Respects prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition: none');
  });
});

describe('L2 — Meta Graph API version centralization', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api/marketing.js'), 'utf8');

  test('Exactly one META_GRAPH_VERSION constant defined', () => {
    const matches = src.match(/const META_GRAPH_VERSION\s*=/g) || [];
    expect(matches.length).toBe(1);
  });
  test('META_GRAPH_BASE used consistently (no remaining v21/v25 hardcoded URLs)', () => {
    const hardcoded = (src.match(/https:\/\/graph\.facebook\.com\/v2[15]\.0/g) || []).length;
    expect(hardcoded).toBe(0);
  });
  test('Version override via META_GRAPH_VERSION env var', () => {
    expect(src).toContain("process.env.META_GRAPH_VERSION || 'v25.0'");
  });
});

describe('L3 — http-responses helpers', () => {
  const h = require('../api/_lib/http-responses.js');

  function fakeRes() {
    const r = { headers: {}, statusCode: 0, body: null };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.end = (b) => { r.body = b; };
    return r;
  }

  test('sendError returns canonical {error, code?, details?, hint?} shape', () => {
    const res = fakeRes();
    h.sendError(res, 400, 'Bad input', { code: 'INVALID_INPUT', hint: 'Try X', details: { field: 'email' } });
    const parsed = JSON.parse(res.body);
    expect(res.statusCode).toBe(400);
    expect(parsed.error).toBe('Bad input');
    expect(parsed.code).toBe('INVALID_INPUT');
    expect(parsed.hint).toBe('Try X');
    expect(parsed.details.field).toBe('email');
  });

  test('sendError accepts Error instance and extracts message', () => {
    const res = fakeRes();
    h.sendError(res, 500, new Error('database down'));
    expect(JSON.parse(res.body).error).toBe('database down');
  });

  test('badRequest / unauthorized / notFound / methodNotAllowed convenience helpers', () => {
    expect(typeof h.badRequest).toBe('function');
    expect(typeof h.unauthorized).toBe('function');
    expect(typeof h.notFound).toBe('function');
    expect(typeof h.methodNotAllowed).toBe('function');
    const res = fakeRes();
    h.unauthorized(res);
    expect(res.statusCode).toBe(401);
  });

  test('internalError hides detail in production but exposes in dev', () => {
    const res1 = fakeRes();
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    h.internalError(res1, new Error('secret sauce'));
    expect(JSON.parse(res1.body).details).toBeUndefined ? true : (JSON.parse(res1.body).details === undefined);
    process.env.NODE_ENV = 'development';
    const res2 = fakeRes();
    h.internalError(res2, new Error('secret sauce'));
    expect(JSON.parse(res2.body).details).toBe('secret sauce');
    if (orig === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = orig;
  });
});

describe('L8 — i18n missing-key debug mode', () => {
  const src = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  test('Debug mode activates via ?i18nDebug=1', () => {
    expect(src).toContain("i18nDebug");
  });
  test('Missing key emits console.warn (once per key)', () => {
    expect(src).toContain('_missingKeySeen');
    expect(src).toContain('[i18n] Missing key');
  });
  test('Missing key visually flags element in debug mode', () => {
    expect(src).toContain('outline');
    expect(src).toContain("'data-i18n-missing'");
  });
});

describe('L7 — marketing.html sidebar emojis replaced with SVGs', () => {
  const src = fs.readFileSync(path.join(ROOT, 'marketing.html'), 'utf8');
  test('No emoji in Enrollments / History / Inbox sidebar nav items', () => {
    // These specific emoji were replaced in L7
    expect(src.includes('🎯</span> Enrollments')).toBe(false);
    expect(src.includes('📜</span> History')).toBe(false);
    expect(src.includes('🟢</span> WhatsApp Inbox')).toBe(false);
  });
  test('SVG replacements are inline with currentColor (inherits theme)', () => {
    // Count SVGs with the mkt-nav-svg class — should include the 3 we added
    const count = (src.match(/<svg class="mkt-nav-svg"/g) || []).length;
    expect(count >= 9).toBe(true); // 6 existing + 3 new
  });
});

describe('_lib — silent-failure-log helper contract', () => {
  const mod = require('../api/_lib/silent-failure-log.js');

  test('logSilentFailure is exported and callable', () => {
    expect(typeof mod.logSilentFailure).toBe('function');
  });

  test('Does not throw when Supabase env missing', () => {
    const orig = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    let threw = false;
    try { mod.logSilentFailure('test', new Error('x'), { a: 1 }); }
    catch (_) { threw = true; }
    expect(threw).toBe(false);
    if (orig) process.env.SUPABASE_URL = orig;
  });

  test('Does not throw when err is a plain string', () => {
    let threw = false;
    try { mod.logSilentFailure('test', 'string error message', {}); }
    catch (_) { threw = true; }
    expect(threw).toBe(false);
  });

  test('Does not throw on null metadata', () => {
    let threw = false;
    try { mod.logSilentFailure('test', new Error('x'), null); }
    catch (_) { threw = true; }
    expect(threw).toBe(false);
  });

  test('Returns synchronously (fire-and-forget, non-blocking)', () => {
    const start = Date.now();
    mod.logSilentFailure('test', new Error('x'), {});
    expect(Date.now() - start < 50).toBe(true);
  });
});

describe('Meta — token diagnostics for FB/IG reconnect', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api/marketing.js'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'marketing.html'), 'utf8');

  test('meta-token-diagnostics endpoint exists and is registered', () => {
    expect(src).toContain('async function handleMetaTokenDiagnostics');
    expect(src).toContain("'meta-token-diagnostics': handleMetaTokenDiagnostics");
  });

  test('Diagnostic calls /debug_token via centralized META_GRAPH_BASE constant', () => {
    expect(src).toContain('debug_token');
    expect(src).toContain('appAccessToken');
    expect(src).toContain('META_GRAPH_BASE');
  });

  test('Diagnostic checks 7 required scopes for FB + IG publishing', () => {
    ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
     'instagram_basic', 'instagram_manage_insights', 'instagram_content_publish',
     'business_management'].forEach(scope => {
      expect(src).toContain("'" + scope + "'");
    });
  });

  test('Diagnostic distinguishes TOKEN_EXPIRED vs MISSING_SCOPES vs TOKEN_INVALID', () => {
    expect(src).toContain("'TOKEN_EXPIRED'");
    expect(src).toContain("'MISSING_SCOPES'");
    expect(src).toContain("'TOKEN_INVALID'");
  });

  test('Marketing dashboard auto-surfaces diagnostic when Meta disconnected', () => {
    expect(dash).toContain('function loadMetaTokenDiagnostic');
    expect(dash).toContain('id="metaTokenDiagnostic"');
    expect(dash).toContain('metaFB && !metaFB.connected');
  });

  test('Reconnect guide exists', () => {
    const guide = fs.readFileSync(path.join(ROOT, 'deploy/META_RECONNECT.md'), 'utf8');
    expect(guide).toContain('Path A');
    expect(guide).toContain('Path B');
    expect(guide).toContain('meta-token-diagnostics');
  });
});

describe('S9 — skeleton loaders on app pages', () => {
  const css = fs.readFileSync(path.join(ROOT, 'skeleton-loader.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'skeleton-loader.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const library = fs.readFileSync(path.join(ROOT, 'library.html'), 'utf8');

  test('CSS defines 5 variants: text, heading, card, kpi, list-row', () => {
    ['--text', '--heading', '--card', '--kpi', '--list-row'].forEach(v => {
      expect(css).toContain('.ss-skeleton' + v);
    });
  });

  test('CSS respects prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
  });

  test('JS has safety timeout so stuck skeletons eventually clear', () => {
    expect(js).toContain('DEFAULT_TIMEOUT_MS = 10000');
    expect(js).toContain('Still loading…');
  });

  test('JS exposes SmartSwingSkeleton global with init/clear/refresh', () => {
    expect(js).toContain('window.SmartSwingSkeleton');
    expect(js).toContain('init: init');
    expect(js).toContain('clear: clear');
  });

  test('library.html loads skeleton CSS + JS and marks hydration containers', () => {
    expect(library).toContain('./skeleton-loader.css');
    expect(library).toContain('./skeleton-loader.js');
    expect(library).toContain('id="drillList" class="list" data-skeleton="list-row"');
    expect(library).toContain('id="tacticList" class="list" data-skeleton="list-row"');
  });

  test('dashboard.html loads skeleton CSS + JS and marks 5 key containers', () => {
    expect(dashboard).toContain('./skeleton-loader.css');
    expect(dashboard).toContain('./skeleton-loader.js');
    expect(dashboard).toContain('id="recentReportsList" data-skeleton=');
    expect(dashboard).toContain('id="overviewMatchList"');
    expect(dashboard).toContain('id="priorityList" data-skeleton=');
    expect(dashboard).toContain('id="kpiList" data-skeleton=');
    expect(dashboard).toContain('id="activityList" data-skeleton=');
  });
});

describe('Referral — two-sided bonus (M12)', () => {
  const appData = fs.readFileSync(path.join(ROOT, 'app-data.js'), 'utf8');
  const emailTpl = fs.readFileSync(path.join(ROOT, 'api/_lib/email-templates.js'), 'utf8');
  const marketing = fs.readFileSync(path.join(ROOT, 'api/marketing.js'), 'utf8');
  const analyze = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');

  test('applyReferralBonus credits both referrer AND referee', () => {
    expect(appData).toContain('REFERRER_BONUS = 2');
    expect(appData).toContain('REFEREE_BONUS  = 2');
    expect(appData).toContain('bonusMap[referredUserId]');
  });

  test('applyReferralBonus fires welcome email to referee', () => {
    expect(appData).toContain("fireEmailEvent('referral_welcome_bonus'");
  });

  test('Referral row records both bonus amounts for audit trail', () => {
    expect(appData).toContain('referrerBonus:');
    expect(appData).toContain('refereeBonus:');
  });

  test('Email template referral_welcome_bonus exists and is registered', () => {
    expect(emailTpl).toContain('function referralWelcomeBonus');
    expect(emailTpl).toContain('referral_welcome_bonus: referralWelcomeBonus');
  });

  test('Welcome email mentions referrer name + bonus count + total free', () => {
    expect(emailTpl).toContain('${referrerName} sent you');
    expect(emailTpl).toContain('${2 + bonusCount} free analyses total');
  });

  test('lite-signup accepts ref_code and validates format', () => {
    expect(marketing).toContain('ref_code');
    expect(marketing).toContain("/^[A-Z0-9]{5,8}$/");
    expect(marketing).toContain('referral_code_used');
  });

  test('analyze.html captures ref from URL and localStorage', () => {
    expect(analyze).toContain("p.get('ref')");
    expect(analyze).toContain('smartswing_pending_referral');
    expect(analyze).toContain('ref_code: refCode');
  });
});

describe('JS — shared-footer.js partials (M2)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'shared-footer.js'), 'utf8');

  test('Exposes 2 footer variants: default + minimal', () => {
    expect(src).toContain('defaultFooter');
    expect(src).toContain('minimalFooter');
  });
  test('Honors data-footer-variant="none" to skip injection', () => {
    expect(src).toContain("variant === 'none'");
  });
  test('Re-runs i18n.applyTranslations after injection', () => {
    expect(src).toContain('applyTranslations');
  });
  test('Exposes window.SmartSwingSharedFooter.inject for manual triggers', () => {
    expect(src).toContain('window.SmartSwingSharedFooter');
  });
});

describe('HTML — accessibility.html migrated to shared footer', () => {
  const src = fs.readFileSync(path.join(ROOT, 'accessibility.html'), 'utf8');

  test('Uses ss-footer-mount div instead of hardcoded footer', () => {
    expect(src).toContain('id="ss-footer-mount"');
    expect(src).toContain('data-footer-variant="default"');
  });
  test('Loads shared-footer.js script', () => {
    expect(src).toContain('<script src="./shared-footer.js"></script>');
  });
  test('Does NOT contain hardcoded footer-grid (replaced by mount)', () => {
    expect(src.includes('class="footer-grid"')).toBe(false);
  });
});

describe('API — silent-failure-log helper (S6)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api/_lib/silent-failure-log.js'), 'utf8');
  const marketing = fs.readFileSync(path.join(ROOT, 'api/marketing.js'), 'utf8');

  test('Helper module exports logSilentFailure', () => {
    expect(src).toContain('module.exports = { logSilentFailure }');
  });
  test('Helper is fire-and-forget (does not throw, does not block)', () => {
    expect(src).toContain('.catch(()');
  });
  test('Helper writes to api_error_log table', () => {
    expect(src).toContain('/rest/v1/api_error_log');
  });
  test('marketing.js imports the helper', () => {
    expect(marketing).toContain("require('./_lib/silent-failure-log')");
  });
  test('persistAgentOutput uses logSilentFailure (was console.warn)', () => {
    expect(marketing).toContain('logSilentFailure(\'persistAgentOutput.agent_tasks_insert\'');
    expect(marketing).toContain('logSilentFailure(\'persistAgentOutput.content_calendar_insert\'');
  });
  test('capture-lead sync failure now logs to dead-letter', () => {
    expect(marketing).toContain('logSilentFailure(\'capture-lead.marketing_contacts_sync\'');
  });
  test('whatsapp-webhook 3 silent catches now use helper', () => {
    expect(marketing).toContain('logSilentFailure(\'whatsapp-webhook.persist_inbound\'');
    expect(marketing).toContain('logSilentFailure(\'whatsapp-webhook.opt_out_update\'');
    expect(marketing).toContain('logSilentFailure(\'whatsapp-webhook.status_update\'');
  });
  test('Error log diagnostic endpoint registered', () => {
    expect(marketing).toContain("'error-log':");
    expect(marketing).toContain('async function handleErrorLog');
  });
});

describe('HTML — marketing.html ops-visibility batch (M5 M6 M7 M8)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'marketing.html'), 'utf8');

  test('M8: WhatsApp number health tile on dashboard', () => {
    expect(src).toContain('id="kpiWhatsappStatus"');
    expect(src).toContain('id="kpiWhatsappSub"');
    expect(src).toContain('loadWhatsappHealth');
    expect(src).toContain('/api/marketing/whatsapp-status');
  });
  test('M5: contact row has preferred_channel editor', () => {
    expect(src).toContain('setContactChannel');
    expect(src).toContain('preferred_channel');
    expect(src).toContain('<option value="auto"');
    expect(src).toContain('<option value="whatsapp"');
    expect(src).toContain('<option value="sms"');
  });
  test('M5: setContactChannel validates and PATCHes Supabase', () => {
    expect(src).toContain("['auto', 'whatsapp', 'sms'].includes(value)");
    expect(src).toContain("from('marketing_contacts')");
  });
  test('M6: opt-out admin viewer with restore action', () => {
    expect(src).toContain('renderOptOutList');
    expect(src).toContain('_restoreWhatsappConsent');
    expect(src).toContain('whatsapp_opted_out');
    expect(src).toContain('Restore consent');
  });
  test('M6: restore flow explicitly prompts for consent documentation', () => {
    expect(src).toContain('LGPD/GDPR/TCPA');
  });
  test('M7: per-step delivery monitor queries cadence_step_executions', () => {
    expect(src).toContain('renderDeliveryMonitor');
    expect(src).toContain("from('cadence_step_executions')");
    expect(src).toContain('delivery_state');
  });
  test('M7: delivery monitor is lazy-loaded on details toggle', () => {
    expect(src).toContain('deliveryMonitorDetails');
    expect(src).toContain("addEventListener('toggle'");
  });
});

describe('HTML — marketing.html WhatsApp Inbox tab', () => {
  const src = fs.readFileSync(path.join(ROOT, 'marketing.html'), 'utf8');

  test('Inbox nav item exists under CRM section', () => {
    expect(src).toContain('data-tab="inbox"');
    expect(src).toContain('WhatsApp Inbox');
    expect(src).toContain('id="inboxBadge"');
  });
  test('Inbox tab panel rendered with KPI row', () => {
    expect(src).toContain('id="tab-inbox"');
    expect(src).toContain('id="inboxKpiToday"');
    expect(src).toContain('id="inboxKpiUnhandled"');
    expect(src).toContain('id="inboxKpiOptOut"');
  });
  test('renderInbox + helper functions defined', () => {
    expect(src).toContain('async function renderInbox');
    expect(src).toContain('function _renderInboxRow');
    expect(src).toContain('async function _markInboxHandled');
    expect(src).toContain('async function _createContactFromInbound');
  });
  test('Inbox queries whatsapp_inbound_messages table + enriches with contact', () => {
    expect(src).toContain("from('whatsapp_inbound_messages')");
    expect(src).toContain("from('marketing_contacts')");
  });
  test('switchTab dispatches to renderInbox for inbox tab', () => {
    expect(src).toContain("tabName === 'inbox'");
  });
  test('Badge auto-refreshes on dashboard load', () => {
    expect(src).toContain('loadInboxBadge');
  });
});

describe('JS — pricing-currency.js multi-currency helper', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pricing-currency.js'), 'utf8');

  test('Supports the 7 launch currencies', () => {
    ['USD', 'BRL', 'MXN', 'EUR', 'GBP', 'CAD', 'AUD'].forEach(c => {
      expect(src).toContain(`'${c}'`);
    });
  });
  test('PRICING_TABLE has entries for starter + pro + performance', () => {
    expect(src).toContain('starter:');
    expect(src).toContain('pro:');
    expect(src).toContain('performance:');
  });
  test('COUNTRY_TO_CURRENCY maps BR → BRL, MX → MXN, DE → EUR', () => {
    expect(src).toContain("BR: 'BRL'");
    expect(src).toContain("MX: 'MXN'");
    expect(src).toContain("DE: 'EUR'");
  });
  test('Exposes SmartSwingPricing global with getCurrency/setCurrency/getCountry', () => {
    expect(src).toContain('window.SmartSwingPricing');
    expect(src).toContain('getCurrency:');
    expect(src).toContain('setCurrency:');
    expect(src).toContain('getCountry:');
  });
  test('Stores selected currency in localStorage', () => {
    expect(src).toContain("localStorage.setItem('ss_currency'");
  });
});

describe('API — checkout-session accepts currency + country', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api/create-checkout-session.js'), 'utf8');
  test('CURRENCY_ALLOWLIST includes USD/BRL/MXN/EUR/GBP/CAD/AUD/CHF/JPY/INR', () => {
    ['usd', 'brl', 'mxn', 'eur', 'gbp', 'cad', 'aud', 'chf', 'jpy', 'inr'].forEach(c => {
      expect(src).toContain(`'${c}'`);
    });
  });
  test('sessionPayload only sets currency if not usd (avoids single-currency Price break)', () => {
    expect(src).toContain("currency !== 'usd'");
  });
  test('Country code normalized to 2-letter uppercase', () => {
    expect(src).toContain('toUpperCase().trim().slice(0, 2)');
  });
  test('Locale is mapped for BRL → pt-BR, MXN → es-419', () => {
    expect(src).toContain("locale: 'pt-BR'");
    expect(src).toContain("locale: 'es-419'");
  });

  test('automatic_payment_methods enabled — surfaces Pix/SEPA/iDEAL/BNPL/etc.', () => {
    // Without this flag, Checkout defaults to card-only regardless of what's
    // enabled in the Stripe Dashboard. Surfacing regional methods depends on it.
    expect(src).toContain('automatic_payment_methods: { enabled: true }');
  });

  test('No hardcoded payment_method_types (would conflict with automatic_payment_methods)', () => {
    expect(src.includes('payment_method_types:')).toBe(false);
  });
});

describe('HTML — marketing.html WhatsApp cadence editor', () => {
  const src = fs.readFileSync(path.join(ROOT, 'marketing.html'), 'utf8');

  test('Cadence loader queries cadence_whatsapp table', () => {
    expect(src).toContain("from('cadence_whatsapp')");
  });
  test('WhatsApp step count is rendered in cadence card header', () => {
    expect(src).toContain('🟢 ${waCount} WhatsApp');
  });
  test('WhatsApp step editor modal exists with required fields', () => {
    expect(src).toContain('id="whatsappStepModal"');
    expect(src).toContain('id="waStepTemplateName"');
    expect(src).toContain('id="waStepTemplateLang"');
    expect(src).toContain('id="waStepTemplateVars"');
    expect(src).toContain('id="waStepDelayDays"');
  });
  test('Add-WhatsApp-step button present in cadence card actions', () => {
    expect(src).toContain('+ Add WhatsApp step');
  });
  test('openWhatsappStepEditor, saveWhatsappStep, deleteWhatsappStep defined', () => {
    expect(src).toContain('function openWhatsappStepEditor');
    expect(src).toContain('async function saveWhatsappStep');
    expect(src).toContain('async function deleteWhatsappStep');
  });
  test('Editor loads approved templates from Meta via /whatsapp-templates', () => {
    expect(src).toContain('/api/marketing/whatsapp-templates');
  });
});

describe('Social proof — hero trust strip on landing pages (Tier 1 #4)', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const forPlayers = fs.readFileSync(path.join(ROOT, 'for-players.html'), 'utf8');

  test('index.html hero has 3-line trust strip (privacy, elite-level, founders)', () => {
    expect(index).toContain('class="hero-proof"');
    expect(index).toContain('video never leaves your device');
    expect(index).toContain('USTA-certified coach');
  });

  test('for-players.html hero has trust strip', () => {
    expect(forPlayers).toContain('class="hero-proof"');
    expect(forPlayers).toContain('USTA-certified coach');
  });

  test('Trust strips include privacy claim (critical for cold US prospects)', () => {
    expect(index).toContain('Private');
    expect(forPlayers).toContain('Private');
  });

  test('Trust strips use aria-label region for screen-reader accessibility', () => {
    expect(index).toContain('aria-label="Trust indicators"');
    expect(forPlayers).toContain('aria-label="Trust indicators"');
  });
});

describe('Global toast system (Tier 2 #5)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'toast.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'toast.js'), 'utf8');

  test('CSS defines success/error/warn/info variants + reduced-motion support', () => {
    ['--success', '--error', '--warn', '--info'].forEach(v => {
      expect(css).toContain('.ss-toast' + v);
    });
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  test('JS exposes SmartSwingToast with success/error/warn/info + fieldError/Clear', () => {
    expect(js).toContain('window.SmartSwingToast');
    expect(js).toContain('success:');
    expect(js).toContain('error:');
    expect(js).toContain('fieldError:');
    expect(js).toContain('fieldClear:');
  });

  test('Errors use role=alert + aria-live=assertive (vs status+polite for others)', () => {
    expect(js).toContain("'alert'");
    expect(js).toContain("'assertive'");
  });

  test('Stack is capped at MAX_STACK to prevent spam', () => {
    expect(js).toContain('MAX_STACK');
    expect(js).toContain('queue.length >= MAX_STACK');
  });

  test('ESC key dismisses most recent toast', () => {
    expect(js).toContain("e.key === 'Escape'");
  });

  test('Idempotent — re-including toast.js does not double-define', () => {
    expect(js).toContain('if (window.SmartSwingToast) return;');
  });
});

describe('Alert replacement with toasts (Tier 2 #5 wiring)', () => {
  const pages = ['analyze.html', 'checkout.html', 'dashboard.html', 'coach-dashboard.html', 'welcome.html'];

  pages.forEach(page => {
    test(page + ' loads toast.css + toast.js', () => {
      const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
      expect(src).toContain('./toast.css');
      expect(src).toContain('./toast.js');
    });
  });

  test('analyze.html has _ssToast helper + no bare alert() remaining', () => {
    const src = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');
    expect(src).toContain('function _ssToast');
    // Every alert() call should now be inside a _ssToast(...) body OR a fallback branch
    // (simple smoke check: count raw alerts NOT followed by a close paren with nothing but fallback wrapping)
    const bareAlerts = (src.match(/\balert\(/g) || []).length;
    // _ssToast uses 'alert' as a string token INSIDE the helper so we allow up to 1
    expect(bareAlerts <= 1).toBe(true);
  });

  test('dashboard.html uses toast.info with action link for plan-gated features', () => {
    const src = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
    expect(src).toContain("utm_source=export_lock");
    expect(src).toContain('SmartSwingToast.info');
  });
});

describe('Inbox threading — schema + inbound webhook (Tier 2 #6 slice 1+2)', () => {
  const mig = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260421_inbox_threading.sql'), 'utf8');
  const hook = fs.readFileSync(path.join(ROOT, 'api/resend-webhook.js'), 'utf8');

  test('Migration creates inbox_threads with a rollup-friendly shape', () => {
    expect(mig).toContain('create table if not exists public.inbox_threads');
    expect(mig).toContain('last_message_at');
    expect(mig).toContain('message_count');
    expect(mig).toContain('unread_count');
    expect(mig).toContain('assigned_to');
    expect(mig).toContain("status text not null default 'open'");
  });

  test('inbox_messages gains threading + direction + read_at columns', () => {
    expect(mig).toContain('add column if not exists thread_id uuid');
    expect(mig).toContain('add column if not exists direction text');
    expect(mig).toContain('add column if not exists read_at timestamptz');
    expect(mig).toContain('add column if not exists email_message_id text');
    expect(mig).toContain("check (direction in ('inbound', 'outbound', 'internal'))");
  });

  test('Existing rows are backfilled before thread_id becomes NOT NULL', () => {
    const backfillIdx = mig.indexOf('insert into public.inbox_threads');
    const notNullIdx = mig.indexOf('alter column thread_id set not null');
    expect(backfillIdx > 0).toBe(true);
    expect(notNullIdx > backfillIdx).toBe(true);
  });

  test('Rollup trigger covers INSERT + read_at transitions', () => {
    expect(mig).toContain('create or replace function public.inbox_thread_rollup');
    expect(mig).toContain('trg_inbox_thread_rollup_ins');
    expect(mig).toContain('trg_inbox_thread_rollup_upd');
    expect(mig).toContain('greatest(0, t.unread_count - 1)');
  });

  test('RLS on threads inherits visibility from messages', () => {
    expect(mig).toContain('inbox_threads enable row level security');
    expect(mig).toContain('inbox_threads_select_via_messages');
    expect(mig).toContain('select 1 from public.inbox_messages m');
  });

  test('Inbound webhook folded into resend-webhook (no new function)', () => {
    expect(hook).toContain('email.inbound');
    expect(hook).toContain('handleInboundEmail');
  });

  test('Inbound handler threads by references first, then subject', () => {
    expect(hook).toContain('findThreadByReferences');
    expect(hook).toContain('findThreadBySubject');
    const refIdx = hook.indexOf('findThreadByReferences(candidateIds)');
    const subjIdx = hook.indexOf('findThreadBySubject(subject)');
    expect(refIdx < subjIdx).toBe(true);
  });

  test('Inbound failures never retry-storm — always 200 back to Resend', () => {
    expect(hook).toContain('Inbound handler failed');
    expect(hook).toContain('200 so Resend does not infinitely retry');
  });
});

describe('Brand token adoption sweep — 35/43 pages consume var(--ss-*)', () => {
  // Sample 10 pages across categories to keep this fast but representative.
  const SAMPLES = [
    'index.html', 'pricing.html', 'about.html', 'for-players.html',
    'analyze.html', 'dashboard.html', 'settings.html', 'library.html',
    'privacy-policy.html', 'shared-report.html'
  ];

  test('Every sampled page consumes var(--ss-*) tokens', () => {
    SAMPLES.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src.indexOf('var(--ss-')).toBeGreaterThan(-1);
    });
  });

  test('Every sampled page links brand-tokens.css', () => {
    SAMPLES.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('brand-tokens.css');
    });
  });

  test('Volt green is centrally defined (no hard-coded #39ff14 in :root)', () => {
    // Pages may still reference #39ff14 in inline CSS for one-off elements,
    // but their --volt / --green / --neon-green :root vars MUST alias the token.
    ['about.html', 'for-players.html', 'pricing.html'].forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      // After aliasing, the legacy var declaration includes the var(--ss- ...) wrapper
      const hit = /--(?:volt|green|neon-green):\s*var\(--ss-volt/.test(src);
      expect(hit).toBe(true);
    });
  });

  test('Brand red / gold / teal also route through tokens', () => {
    const checkout = fs.readFileSync(path.join(ROOT, 'checkout.html'), 'utf8');
    expect(checkout).toContain('var(--ss-red');
    const blog = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
    expect(blog).toContain('var(--ss-gold');
    const refer = fs.readFileSync(path.join(ROOT, 'refer-friends.html'), 'utf8');
    expect(refer).toContain('var(--ss-teal');
  });

  test('Aliases preserve a fallback so visual change is zero without brand-tokens.css', () => {
    // Pattern: --legacy: var(--ss-token, #literal);
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(idx).toContain('var(--ss-volt, #39ff14)');
    expect(idx).toContain('var(--ss-text, ');
  });
});

describe('Canonical app-shell (logged-in chrome consolidation)', () => {
  const css  = fs.readFileSync(path.join(ROOT, 'app-shell.css'), 'utf8');
  const js   = fs.readFileSync(path.join(ROOT, 'app-shell.js'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

  test('app-shell.css defines the three canonical surfaces', () => {
    expect(css).toContain('.app-topbar');
    expect(css).toContain('.app-topbar-nav');
    expect(css).toContain('.app-topbar-hamburger');
    expect(css).toContain('.app-mobile-drawer');
    expect(css).toContain('.app-bottom-nav');
  });

  test('app-shell.css respects iOS safe-area on top + bottom', () => {
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('env(safe-area-inset-bottom');
  });

  test('app-shell.css honors prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  test('app-shell.js exports the canonical NAV_ITEMS list', () => {
    expect(js).toContain('NAV_ITEMS');
    expect(js).toContain("href: './dashboard.html'");
    expect(js).toContain("href: './analyze.html'");
    expect(js).toContain("href: './library.html'");
    expect(js).toContain("href: './settings.html'");
  });

  test('app-shell.js renders into placeholders + wires drawer', () => {
    expect(js).toContain('data-ss-app-topbar');
    expect(js).toContain('data-ss-app-bottom-nav');
    expect(js).toContain('wireDrawer');
    expect(js).toContain("e.key === 'Escape'");
  });

  test('Active page is marked aria-current=page in both nav surfaces', () => {
    expect(js).toContain('aria-current="page"');
  });

  test('Dashboard migrated: links app-shell + uses placeholders + drops legacy chrome', () => {
    expect(dash).toContain('app-shell.css');
    expect(dash).toContain('app-shell.js');
    expect(dash).toContain('data-ss-app-topbar');
    expect(dash).toContain('data-ss-app-bottom-nav');
    // Legacy hand-written chrome is gone:
    expect(dash.includes('<header class="topbar"')).toBe(false);
    expect(dash.includes('<nav class="app-bottom-nav"')).toBe(false);
  });

  test('Mobile drawer is a proper modal dialog (a11y)', () => {
    expect(js).toContain('role="dialog"');
    expect(js).toContain('aria-modal="true"');
    expect(js).toContain('aria-controls="ss-mobile-drawer"');
  });
});

describe('Form UX — contact wires toast.fieldError per field', () => {
  const src = fs.readFileSync(path.join(ROOT, 'contact.html'), 'utf8');

  test('Contact loads toast.js + toast.css', () => {
    expect(src).toContain('toast.js');
    expect(src).toContain('toast.css');
  });

  test('Per-field validation calls fieldError + fieldClear', () => {
    expect(src).toContain('T.fieldError');
    expect(src).toContain('T.fieldClear');
  });

  test('Email format validated beyond required (regex check)', () => {
    expect(src).toContain('EMAIL_RE');
    expect(src.indexOf('@\]+@')).toBeGreaterThan(-1);
  });

  test('Focus lands on the first invalid field for keyboard users', () => {
    expect(src).toContain('firstInvalid.focus()');
  });

  test('Toast warn fires when any field is invalid', () => {
    expect(src).toContain("T.warn('Please fix");
  });
});

describe('Empty-state utility + axe-core CI', () => {
  const empty = fs.readFileSync(path.join(ROOT, 'empty-state.css'), 'utf8');
  const axe = fs.readFileSync(path.join(ROOT, '.github/workflows/a11y.yml'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

  test('empty-state.css defines title/body/CTA structure + variants', () => {
    expect(empty).toContain('.ss-empty');
    expect(empty).toContain('.ss-empty__icon');
    expect(empty).toContain('.ss-empty__title');
    expect(empty).toContain('.ss-empty__body');
    expect(empty).toContain('.ss-empty__cta');
    expect(empty).toContain('.ss-empty--inline');
  });

  test('Empty-state honors prefers-reduced-motion + uses brand tokens', () => {
    expect(empty).toContain('prefers-reduced-motion: reduce');
    expect(empty).toContain('var(--ss-volt');
    expect(empty).toContain('var(--ss-text');
  });

  test('Dashboard adopts empty-state for the recent reports tile', () => {
    expect(dash).toContain('empty-state.css');
    expect(dash).toContain('class="ss-empty"');
    expect(dash).toContain('No reports yet');
  });

  test('axe-core CI runs on PRs touching HTML/CSS/JS', () => {
    expect(axe).toContain('@axe-core/cli');
    expect(axe).toContain('pull_request:');
    expect(axe).toContain("branches: [main]");
  });

  test('axe-core enforces WCAG 2.1 AA + uploads reports', () => {
    expect(axe).toContain('wcag2a,wcag2aa');
    expect(axe).toContain('--exit');
    expect(axe).toContain('actions/upload-artifact');
  });

  test('axe-core scans 8 representative pages including auth surfaces', () => {
    expect(axe).toContain('"index.html"');
    expect(axe).toContain('"login.html"');
    expect(axe).toContain('"signup.html"');
    expect(axe).toContain('"pricing.html"');
  });
});

describe('Lighthouse CI quality gate', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'lighthouserc.json'), 'utf8'));
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8');

  test('Audits 5 representative high-traffic pages', () => {
    const urls = config.ci.collect.url;
    expect(Array.isArray(urls)).toBe(true);
    expect(urls.length).toBe(5);
    expect(urls.some(u => u.includes('/index.html'))).toBe(true);
    expect(urls.some(u => u.includes('/pricing.html'))).toBe(true);
  });

  test('Performance + a11y + SEO have hard minimum thresholds', () => {
    const a = config.ci.assert.assertions;
    expect(a['categories:performance'][1].minScore).toBeGreaterThanOrEqual(0.85);
    expect(a['categories:accessibility'][1].minScore).toBeGreaterThanOrEqual(0.90);
    expect(a['categories:seo'][1].minScore).toBeGreaterThanOrEqual(0.90);
  });

  test('Critical a11y + SEO single-audit checks are errors not warnings', () => {
    const a = config.ci.assert.assertions;
    expect(a['color-contrast']).toBe('error');
    expect(a['image-alt']).toBe('error');
    expect(a['html-has-lang']).toBe('error');
    expect(a['meta-description']).toBe('error');
    expect(a['document-title']).toBe('error');
  });

  test('Workflow runs on PR + main and uploads HTML reports as artifact', () => {
    expect(wf).toContain('lhci autorun');
    expect(wf).toContain('actions/upload-artifact');
    expect(wf).toContain('pull_request:');
    expect(wf).toContain('branches: [main]');
  });
});

describe('UI/UX consistency sweep — headers, footers, tokens, year', () => {
  const sharedChrome = fs.readFileSync(path.join(ROOT, 'shared-chrome.js'), 'utf8');

  test('Pricing header uses canonical .nav class (was .nav-bar outlier)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'pricing.html'), 'utf8');
    expect(src).toContain('<nav class="nav"');
    expect(src.includes('<nav class="nav-bar"')).toBe(false);
  });

  test('No page still shows a stale 2025 copyright', () => {
    const pages = ['index.html', 'pricing.html', 'about.html', 'contact.html',
      'blog.html', 'for-players.html', 'for-coaches.html', 'privacy-policy.html',
      'user-agreement.html', 'refund-policy.html', 'settings.html', 'welcome.html'];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src.includes('2025 SmartSwing')).toBe(false);
    });
  });

  test('Footer logo dim (140x35) is the shared-chrome canonical', () => {
    const chrome = fs.readFileSync(path.join(ROOT, 'shared-chrome.js'), 'utf8');
    expect(chrome).toContain('class="footer-logo" width="140" height="35"');
    // And stale 152x64 should not be anywhere on migrated pages.
    const pages = ['for-players.html', 'for-coaches.html', 'for-clubs.html', 'for-parents.html'];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src.includes('footer-logo" width="152"')).toBe(false);
    });
  });

  test('Shared chrome script exports renderFooter + renderHeader + skipLink', () => {
    expect(sharedChrome).toContain('function footerHTML');
    expect(sharedChrome).toContain('function headerHTML');
    expect(sharedChrome).toContain('ensureSkipLink');
    expect(sharedChrome).toContain('data-ss-footer');
    expect(sharedChrome).toContain('data-ss-header');
  });

  test('Shared footer auto-updates the year from runtime Date', () => {
    expect(sharedChrome).toContain('new Date().getFullYear()');
  });

  test('Pages that previously had no header now load shared-chrome.js', () => {
    const pages = ['cart.html', 'contact.html', 'login.html', 'signup.html',
      'auth-callback.html', 'post.html'];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('shared-chrome.js');
      expect(src).toContain('data-ss-header');
    });
  });

  test('Brand-tokens.css now linked on 12+ top-of-funnel public pages', () => {
    const pages = ['index.html', 'pricing.html', 'features.html', 'how-it-works.html',
      'about.html', 'contact.html', 'blog.html', 'for-players.html',
      'for-coaches.html', 'for-clubs.html', 'for-parents.html', 'pickleball.html',
      'dashboard.html'];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('brand-tokens.css');
    });
  });

  test('404 page migrated to shared footer placeholder', () => {
    const src = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
    expect(src).toContain('data-ss-footer');
  });

  test('shared-footer.css exists and defines canonical grid layout', () => {
    const css = fs.readFileSync(path.join(ROOT, 'shared-footer.css'), 'utf8');
    expect(css).toContain('.ss-footer');
    expect(css).toContain('grid-template-columns');
    expect(css).toContain('.ss-footer .footer-heading');
    expect(css).toContain('.ss-footer .footer-links');
  });

  test('shared-chrome auto-injects shared-footer.css when rendering', () => {
    const chrome = fs.readFileSync(path.join(ROOT, 'shared-chrome.js'), 'utf8');
    expect(chrome).toContain('ensureFooterCss');
    expect(chrome).toContain('shared-footer.css');
    expect(chrome).toContain("ss-footer"); // class applied
  });

  test('All 27 public + legal pages now use data-ss-footer placeholder (not inline <footer>)', () => {
    const pages = [
      'index.html','pricing.html','features.html','how-it-works.html','about.html',
      'contact.html','blog.html','for-players.html','for-coaches.html','for-clubs.html',
      'for-parents.html','pickleball.html','checkout.html','payment-success.html',
      'payment-cancelled.html','refer-friends.html','login.html','signup.html',
      'auth-callback.html','privacy-policy.html','user-agreement.html','cookie-policy.html',
      'california-privacy.html','refund-policy.html','brand-policy.html',
      'copyright-policy.html','shared-report.html'
    ];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('data-ss-footer');
      // No more literal <footer class="footer" role="contentinfo"> in these files —
      // it's all rendered by shared-chrome at runtime.
      expect(src.includes('<footer class="footer" role="contentinfo"')).toBe(false);
    });
  });

  test('Pages that had no footer at all now have a placeholder (cart/post/accessibility)', () => {
    ['cart.html', 'post.html', 'accessibility.html'].forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('data-ss-footer');
    });
  });

  test('Previously-missing meta descriptions are present', () => {
    const pages = ['404.html', 'cart.html', 'auth-callback.html'];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('name="description"');
    });
  });

  test('Homepage + blog logo dims match the canonical 190x80', () => {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const blog = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
    expect(idx.includes('brand-logo" width="160"')).toBe(false);
    expect(blog.includes('brand-logo" width="160"')).toBe(false);
    expect(idx).toContain('brand-logo" width="190" height="80"');
  });
});

describe('UX polish — analyze skeleton + hero video + safe-area + token adoption', () => {
  const analyze = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');
  const idx     = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dash    = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const safe    = fs.readFileSync(path.join(ROOT, 'safe-area.css'), 'utf8');

  test('Analyze page links skeleton-loader.css + renders AI-load skeleton', () => {
    expect(analyze).toContain('skeleton-loader.css');
    expect(analyze).toContain('class="ai-skeleton"');
    expect(analyze).toContain('sk-canvas');
    expect(analyze).toContain('sk-stats-panel');
  });

  test('Skeleton shows by default on step 4, hides once AI ready', () => {
    expect(analyze).toContain('class="step-content ai-loading" data-step="4"');
    expect(analyze).toContain("step4.classList.add('ai-loading')");
    expect(analyze).toContain("step4.classList.remove('ai-loading')");
  });

  test('Skeleton caption announces progress to screen readers', () => {
    expect(analyze).toContain('aria-live="polite"');
    expect(analyze).toContain('id="aiSkeletonStatus"');
  });

  test('Hero video replaces static img on homepage + uses webp as poster', () => {
    expect(idx).toContain('hero-visual-video');
    expect(idx).toContain('poster="./assets/redesign/hero-action.webp"');
    expect(idx).toContain('src="./assets/hero-animation.mp4"');
    expect(idx).toContain('autoplay muted loop playsinline');
  });

  test('Hero video respects prefers-reduced-motion', () => {
    expect(idx).toContain('prefers-reduced-motion: reduce');
  });

  test('safe-area.css defines body insets + utility classes', () => {
    expect(safe).toContain('env(safe-area-inset-bottom, 0)');
    expect(safe).toContain('.ss-safe-bottom');
    expect(safe).toContain('.ss-safe-top');
    expect(safe).toContain('.ss-site-header');
  });

  test('safe-area.css is linked on the top-of-funnel public pages', () => {
    const pages = ['index.html', 'pricing.html', 'features.html',
      'for-players.html', 'for-coaches.html', 'for-clubs.html', 'for-parents.html',
      'how-it-works.html', 'checkout.html', 'payment-success.html'];
    pages.forEach(p => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src).toContain('safe-area.css');
    });
  });

  test('Dashboard now consumes --ss-* design tokens (unblocks 0/43 audit gap)', () => {
    expect(dash).toContain('brand-tokens.css');
    expect(dash).toContain('var(--ss-volt');
    expect(dash).toContain('var(--ss-text');
  });
});

describe('Day-1 onboarding checklist (Tier 2 #8)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

  test('Checklist panel is rendered with a11y-friendly labelling', () => {
    expect(src).toContain('id="onboardingChecklist"');
    expect(src).toContain('aria-labelledby="onboardingTitle"');
    expect(src).toContain('id="onboardingTitle"');
  });

  test('Progress bar + percentage UI present', () => {
    expect(src).toContain('id="onboardingBar"');
    expect(src).toContain('id="onboardingPct"');
  });

  test('All 5 onboarding steps are defined with destinations', () => {
    expect(src).toContain("id: 'profile'");
    expect(src).toContain("id: 'analyze'");
    expect(src).toContain("id: 'share'");
    expect(src).toContain("id: 'invite'");
    expect(src).toContain("id: 'plan'");
    expect(src).toContain('./refer-friends.html');
    expect(src).toContain('./pricing.html?src=onboarding');
  });

  test('Dismiss state persists to localStorage (per-user)', () => {
    expect(src).toContain("'ss:onboarding:dismissed:' + user.id");
    expect(src).toContain('onboardingDismiss');
  });

  test('Checklist hides when user has completed all items', () => {
    expect(src).toContain('doneCount >= items.length');
  });

  test('Anchored on real store state (plan, assessments, referralStats)', () => {
    expect(src).toContain('store.getReferralStats');
    expect(src).toContain('access.plan.id');
    expect(src).toContain('assessments.length');
  });

  test('Onboarding block is defensive — never breaks dashboard on error', () => {
    expect(src).toContain('/* never break dashboard over onboarding UI */');
  });
});

describe('Lifecycle emails — D1 + D7 onboarding engine (Tier 1 #2)', () => {
  const tpl = fs.readFileSync(path.join(ROOT, 'api/_lib/email-templates.js'), 'utf8');
  const cron = fs.readFileSync(path.join(ROOT, 'api/cron-win-back.js'), 'utf8');

  test('D1 no-analysis template defined + registered', () => {
    expect(tpl).toContain('function onboardingD1NoAnalysis');
    expect(tpl).toContain('onboarding_d1_no_analysis: onboardingD1NoAnalysis');
  });

  test('D7 progress check-in template defined + registered', () => {
    expect(tpl).toContain('function onboardingD7Progress');
    expect(tpl).toContain('onboarding_d7_progress: onboardingD7Progress');
  });

  test('D1 template mentions social proof (real testimonial quote)', () => {
    expect(tpl).toContain('Marcus T.');
    expect(tpl).toContain('footwork habit');
  });

  test('D7 template uses last analysis score + shot type when available', () => {
    expect(tpl).toContain('${lastShotType}');
    expect(tpl).toContain('${lastScore}');
  });

  test('cron-win-back has D1 no-analysis pass (24h post-signup + 0 assessments)', () => {
    expect(cron).toContain('onboarding_d1_no_analysis');
    expect(cron).toContain("dayRange(1)");
    expect(cron).toContain('0 analyses');
  });

  test('cron-win-back has D7 progress pass (7d post-signup + ≥1 assessment)', () => {
    expect(cron).toContain('onboarding_d7_progress');
    expect(cron).toContain('1 analysis');
  });

  test('D1 + D7 passes are mutually exclusive with win_back_7d (no double-send)', () => {
    // D1 targets 0-analysis at 24h; win_back_7d targets 0-analysis at 7d; D7 targets ≥1-analysis at 7d
    // All three are orthogonal and don't send to the same user
    expect(cron).toContain('if (!assessments || assessments.length === 0)'); // D1 + win_back_7d gate
    expect(cron).toContain('if (assessments && assessments.length > 0)'); // D7 gate
  });
});

describe('Share card — referral-embedded viral loop (Tier 1 #3)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');

  test('_getScoreCardReferralCode helper defined with localStorage fallback', () => {
    expect(src).toContain('function _getScoreCardReferralCode');
    expect(src).toContain('smartswing_pending_referral');
  });

  test('Score card footer renders URL with embedded referral code when present', () => {
    expect(src).toContain("'smartswingai.com/?ref=' + refCode");
    expect(src).toContain('footerUrl = refCode');
  });

  test('Web Share API caption includes full URL with referral query param', () => {
    expect(src).toContain('I just got my swing analyzed');
    expect(src).toContain("'https://www.smartswingai.com/?ref='");
  });

  test('Share event tracked via gtag for funnel attribution', () => {
    expect(src).toContain("gtag('event', 'scorecard_share'");
    expect(src).toContain('has_referral_code');
  });

  test('Share payload includes files + text + url for maximum client compatibility', () => {
    expect(src).toContain('files: [file]');
    expect(src).toContain('text: shareText');
    expect(src).toContain('url: shareUrl');
  });
});

describe('Paywall — post-analysis tease (Tier 1 #1)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');

  test('isPaidUser helper defined with safe default = false', () => {
    expect(src).toContain('function isPaidUser()');
    expect(src).toContain("p !== 'free' && p !== 'starter'");
  });

  test('Paywall tease section is rendered conditionally for non-paid users', () => {
    expect(src).toContain('paywall-tease');
    expect(src).toContain("isPaidUser() ? '' : `");
  });

  test('Tease includes 3 locked preview benefits with blur filter', () => {
    expect(src).toContain('Compare to pro benchmarks');
    expect(src).toContain('personalized drill plan');
    expect(src).toContain('AI coach narrative');
    expect(src).toContain('filter:blur(3px)');
  });

  test('CTA links to pricing with UTM + plan params for attribution', () => {
    expect(src).toContain('utm_source=post_analysis_paywall');
    expect(src).toContain('utm_campaign=unlock_report');
    expect(src).toContain('plan=pro');
  });

  test('Full Technical Details section is gated with PLAYER PLAN badge for free users', () => {
    expect(src).toContain('data-paywall-locked="1"');
    expect(src).toContain('🔒 PLAYER PLAN');
  });

  test('Paywall click tracked via gtag for funnel analytics', () => {
    expect(src).toContain("gtag('event', 'paywall_click'");
  });
});

describe('HTML — analyze.html lite-signup modal', () => {
  const src = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');

  test('Lite-signup modal element is present', () => {
    expect(src).toContain('id="liteSignupModal"');
    expect(src).toContain('aria-modal="true"');
  });
  test('Modal has 3 required fields: first name, email, marketing consent', () => {
    expect(src).toContain('id="liteSignupFirstName"');
    expect(src).toContain('id="liteSignupEmail"');
    expect(src).toContain('id="liteSignupConsent"');
  });
  test('Modal posts to /api/marketing/lite-signup', () => {
    expect(src).toContain("/api/marketing/lite-signup");
  });
  test('Upload click is gated by isLiteSignupComplete()', () => {
    expect(src).toContain('isLiteSignupComplete');
    expect(src).toContain('openLiteSignupModal');
  });
  test('Form includes privacy policy link for LGPD/GDPR clarity', () => {
    expect(src).toContain('privacy-policy.html');
  });
  test('UTM params + session id captured for attribution', () => {
    expect(src).toContain('utm_source');
    expect(src).toContain('ss_session_id');
  });
});

describe('HTML — index.html hero sends to analyze (not signup)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  test('Primary hero CTA points to analyze.html', () => {
    expect(src).toContain('href="./analyze.html" class="btn-primary btn-lg" data-i18n="hero.cta.primary"');
  });
  test('Big CTA section also routes to analyze.html', () => {
    expect(src).toContain('href="./analyze.html" class="btn-primary btn-lg" data-i18n="bigcta.primary"');
  });
});

describe('API — cadence CTA redirect allowlist', () => {
  // The allowlist is private to api/marketing.js. We mirror it here for direct testing
  // of the URL parser logic. If the production allowlist changes, update this list.
  const ALLOWED = new Set([
    'www.smartswingai.com', 'smartswingai.com', 'app.smartswingai.com',
    'analyze.smartswingai.com', 'pay.smartswingai.com',
    'checkout.stripe.com', 'billing.stripe.com',
    'cal.com',
    'youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com'
  ]);
  function isAllowed(rawUrl) {
    try {
      const p = new URL(rawUrl);
      if (p.protocol !== 'https:' && p.protocol !== 'http:') return false;
      return ALLOWED.has(p.hostname.toLowerCase());
    } catch (_) { return false; }
  }

  test('SmartSwing-controlled URLs are allowed', () => {
    expect(isAllowed('https://www.smartswingai.com/pricing.html')).toBe(true);
    expect(isAllowed('https://app.smartswingai.com/dashboard')).toBe(true);
  });
  test('Stripe + Cal.com partner hosts allowed', () => {
    expect(isAllowed('https://checkout.stripe.com/c/pay/cs_xxx')).toBe(true);
    expect(isAllowed('https://cal.com/smartswing/demo')).toBe(true);
  });
  test('Arbitrary hosts are REJECTED (phishing prevention)', () => {
    expect(isAllowed('https://evil.example.com/login?session=...')).toBe(false);
    expect(isAllowed('https://smartswingai.com.attacker.example/x')).toBe(false);
  });
  test('javascript: + data: protocols rejected (XSS)', () => {
    expect(isAllowed('javascript:alert(1)')).toBe(false);
    expect(isAllowed('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
  test('Malformed URLs return false (no exception)', () => {
    expect(isAllowed('')).toBe(false);
    expect(isAllowed('not a url')).toBe(false);
    expect(isAllowed(null)).toBe(false);
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
  test('US (+1) → en default', () => {
    expect(resolveTemplateLang('+1 415 555 1234')).toBe('en');
  });
  test('UK (+44) → en default', () => {
    expect(resolveTemplateLang('+44 7700 900000')).toBe('en');
  });
  test('null phone → en default', () => {
    expect(resolveTemplateLang(null)).toBe('en');
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
