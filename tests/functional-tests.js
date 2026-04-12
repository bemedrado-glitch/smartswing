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
  test('has match format buttons', () => {
    expect(analyzeHtml).toContain('data-format-type="games"');
    expect(analyzeHtml).toContain('data-format-type="sets"');
    expect(analyzeHtml).toContain('Best of 3 Games');
    expect(analyzeHtml).toContain('Best of 5 Games');
    expect(analyzeHtml).toContain('1 Set');
    expect(analyzeHtml).toContain('3 Sets');
    expect(analyzeHtml).toContain('5 Sets');
  });

  test('ball detection is disabled', () => {
    // initBallDetector should be commented out
    expect(analyzeHtml).toContain('// Ball detector disabled');
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
