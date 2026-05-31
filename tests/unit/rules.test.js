'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const KO = require('../../engine.js');

// These pin the section-6 product rules so they can't be "fixed" by accident.
test('exactly 14 events, numbered 1..14', () => {
  assert.strictEqual(KO.EVENTS.length, 14);
  assert.deepStrictEqual(KO.EVENTS.map(e => e.n), [1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
});

test('scoring tables are 10/6/3/1 and double 20/12/6/2', () => {
  assert.deepStrictEqual(KO.PTS.standard, [10, 6, 3, 1]);
  assert.deepStrictEqual(KO.PTS.finale, [20, 12, 6, 2]);
});

test('dodgeball alliance points are 8 / 2', () => {
  assert.strictEqual(KO.DODGE_WIN, 8);
  assert.strictEqual(KO.DODGE_LOSE, 2);
});

test('event 13 is dodgeball, event 14 is the double finale', () => {
  assert.strictEqual(KO.EVENTS.find(e => e.n === 13).mode, 'dodgeball');
  assert.strictEqual(KO.isFinale(KO.EVENTS.find(e => e.n === 14)), true);
  assert.strictEqual(KO.isFinale(KO.EVENTS.find(e => e.n === 13)), false);
  assert.deepStrictEqual(KO.ptsArr(KO.EVENTS.find(e => e.n === 14)), [20, 12, 6, 2]);
  assert.deepStrictEqual(KO.ptsArr(KO.EVENTS.find(e => e.n === 1)), [10, 6, 3, 1]);
});

test('four teams of three; two non-playing commissioners are not modelled', () => {
  const s = KO.defaultState();
  assert.strictEqual(s.teams.length, 4);
  s.teams.forEach(t => assert.strictEqual(t.players.length, 3));
});

test('per-event participation counts are 1, 2 or whole-team', () => {
  KO.EVENTS.forEach(e => assert.ok([1, 2, 'all'].includes(e.count), `event ${e.n} count`));
});
