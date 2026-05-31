'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const KO = require('../../engine.js');

test('encState → decState round-trips a full state', () => {
  const s = KO.defaultState();
  s.setupDone = true;
  s.teams[0].name = 'Sharks';
  s.results[1] = { rank: ['t0', 't1', 't2', 't3'] };
  const round = KO.decState(KO.encState(s));
  assert.deepStrictEqual(round, s);
});

test('round-trips emoji and accents (UTF-8 safe)', () => {
  const s = KO.defaultState();
  s.teams[0].name = 'Café 🌴 Niño';
  s.teams[1].name = 'Ωmega — Þórr';
  s.teams[2].players[0].name = '日本語';
  const round = KO.decState(KO.encState(s));
  assert.strictEqual(round.teams[0].name, 'Café 🌴 Niño');
  assert.strictEqual(round.teams[1].name, 'Ωmega — Þórr');
  assert.strictEqual(round.teams[2].players[0].name, '日本語');
});

test('decState returns null on garbage (never throws)', () => {
  assert.strictEqual(KO.decState('not-base64-@@@'), null);
  assert.strictEqual(KO.decState(''), null);
});

test('hashParams parses #room/edit-style fragments', () => {
  assert.deepStrictEqual(KO.hashParams('#edit=ABCD'), { edit: 'ABCD' });
  assert.deepStrictEqual(KO.hashParams('#a=1&b=2'), { a: '1', b: '2' });
  assert.deepStrictEqual(KO.hashParams(''), {});
  assert.deepStrictEqual(KO.hashParams('#v=' + encodeURIComponent('x y')), { v: 'x y' });
});

test('countLabel describes per-team counts', () => {
  assert.strictEqual(KO.countLabel({ count: 1 }), '1 / team');
  assert.strictEqual(KO.countLabel({ count: 2 }), '2 / team');
  assert.strictEqual(KO.countLabel({ count: 'all' }), 'Whole team');
});
