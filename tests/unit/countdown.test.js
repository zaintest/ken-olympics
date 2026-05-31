'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const KO = require('../../engine.js');

const REVEAL = KO.REVEAL_AT;

test('REVEAL_AT is the exact UTC instant for 10:30 PM PDT, Thu Jun 4 2026', () => {
  assert.strictEqual(REVEAL, Date.UTC(2026, 5, 5, 5, 30, 0)); // 05:30 UTC Jun 5 = 22:30 PDT Jun 4
  assert.strictEqual(new Date(REVEAL).toISOString(), '2026-06-05T05:30:00.000Z');
});

test('REVEAL_AT is a fixed instant — identical no matter the device timezone', () => {
  // It is a single epoch-ms number, so it cannot vary by locale/timezone.
  assert.strictEqual(typeof REVEAL, 'number');
  const a = REVEAL, b = Date.UTC(2026, 5, 5, 5, 30, 0);
  assert.strictEqual(a, b);
});

test('countdownParts breaks the remaining time into d/h/m/s', () => {
  const now = REVEAL - ((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
  assert.deepStrictEqual(KO.countdownParts(now), { d: 2, h: 3, m: 4, s: 5 });
});

test('countdownParts clamps to zero at/after reveal (never negative)', () => {
  assert.deepStrictEqual(KO.countdownParts(REVEAL), { d: 0, h: 0, m: 0, s: 0 });
  assert.deepStrictEqual(KO.countdownParts(REVEAL + 10_000), { d: 0, h: 0, m: 0, s: 0 });
});

test('isLockedAt: viewers are locked strictly before reveal', () => {
  assert.strictEqual(KO.isLockedAt(true, REVEAL - 1), true);
  assert.strictEqual(KO.isLockedAt(true, REVEAL), false);      // boundary: unlocks AT reveal
  assert.strictEqual(KO.isLockedAt(true, REVEAL + 1), false);
});

test('isLockedAt: the editor (viewOnly=false) is NEVER locked', () => {
  assert.strictEqual(KO.isLockedAt(false, REVEAL - 1_000_000), false);
  assert.strictEqual(KO.isLockedAt(false, 0), false);
  assert.strictEqual(KO.isLockedAt(false, REVEAL + 1), false);
});
