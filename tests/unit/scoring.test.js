'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const KO = require('../../engine.js');

function freshTeams() { return KO.defaultState(); }
const ids = s => KO.standings(s).map(r => r.t.id);
// derive event numbers by characteristic so tests don't break when the play order changes
const DODGE = KO.EVENTS.find(e => e.mode === 'dodgeball').n;
const ALLTEAM = KO.EVENTS.find(e => e.count === 'all' && e.mode === 'placement').n;

test('tolerates a room with NO results object (Firebase drops an empty {})', () => {
  const s = KO.defaultState();
  delete s.results;                          // exactly what comes back from a freshly-seeded room
  assert.doesNotThrow(() => KO.standings(s));
  assert.doesNotThrow(() => KO.totals(s));
  assert.doesNotThrow(() => KO.pointsForEvent(s, 1));
  assert.doesNotThrow(() => KO.firstsCount(s, 't0'));
  assert.deepStrictEqual(KO.standings(s).map(r => r.pts), [0, 0, 0, 0]);
});

test('placement event pays 10 / 6 / 3 / 1', () => {
  const s = freshTeams();
  s.results[2] = { rank: ['t0', 't1', 't2', 't3'] };
  const p = KO.pointsForEvent(s, 2);
  assert.deepStrictEqual([p.t0, p.t1, p.t2, p.t3], [10, 6, 3, 1]);
});

test('Lip Sync finale (event 14) pays double 20 / 12 / 6 / 2', () => {
  const s = freshTeams();
  s.results[14] = { rank: ['t2', 't0', 't3', 't1'] };
  const p = KO.pointsForEvent(s, 14);
  assert.strictEqual(p.t2, 20);
  assert.strictEqual(p.t0, 12);
  assert.strictEqual(p.t3, 6);
  assert.strictEqual(p.t1, 2);
});

test('only event 14 is doubled — event 12 is still standard', () => {
  const s = freshTeams();
  s.results[12] = { rank: ['t0', 't1', 't2', 't3'] };
  assert.strictEqual(KO.pointsForEvent(s, 12).t0, 10);
});

test('dodgeball is alliance-based: winners +8, losers +2', () => {
  const s = freshTeams();
  s.results[DODGE] = { win: ['t0', 't2'] };
  const p = KO.pointsForEvent(s, DODGE);
  assert.deepStrictEqual([p.t0, p.t1, p.t2, p.t3], [8, 2, 8, 2]);
});

test('an unrecorded event scores zero for everyone', () => {
  const s = freshTeams();
  const p = KO.pointsForEvent(s, 5);
  assert.deepStrictEqual([p.t0, p.t1, p.t2, p.t3], [0, 0, 0, 0]);
});

test('totals sum every event; totals(excl) drops one event', () => {
  const s = freshTeams();
  s.results[1] = { rank: ['t0', 't1', 't2', 't3'] };  // t0 +10
  s.results[DODGE] = { win: ['t0', 't1'] };            // t0 +8
  assert.strictEqual(KO.totals(s).t0, 18);
  assert.strictEqual(KO.totals(s, DODGE).t0, 10);      // exclude dodgeball
});

test('firstsCount only counts rank[0]; dodgeball wins are not "firsts"', () => {
  const s = freshTeams();
  s.results[1] = { rank: ['t0', 't1', 't2', 't3'] };
  s.results[2] = { rank: ['t0', 't2', 't1', 't3'] };
  s.results[DODGE] = { win: ['t1', 't0'] };
  assert.strictEqual(KO.firstsCount(s, 't0'), 2);
  assert.strictEqual(KO.firstsCount(s, 't1'), 0);
});

test('standings sort by points', () => {
  const s = freshTeams();
  s.results[1] = { rank: ['t3', 't2', 't1', 't0'] };
  assert.deepStrictEqual(ids(s), ['t3', 't2', 't1', 't0']);
});

test('TIEBREAK: equal points → more 1st-place finishes ranks higher', () => {
  const s = freshTeams();
  s.results[1] = { rank: ['t0', 't1', 't2', 't3'] }; // t0 +10(1st) t1 +6 t2 +3 t3 +1
  s.results[2] = { rank: ['t2', 't3', 't1', 't0'] }; // t2 +10(1st) t3 +6 t1 +3 t0 +1
  s.results[3] = { rank: ['t2', 't3', 't1', 't0'] }; // t2 +10(1st) t3 +6 t1 +3 t0 +1
  // totals: t0=12(1 first) t1=12(0 firsts) t2=23(2) t3=13(0)
  const st = KO.standings(s);
  assert.strictEqual(st[0].t.id, 't2');
  assert.strictEqual(st[1].t.id, 't3');
  // the real assertion: t0 and t1 are tied on 12 pts, t0 wins the tiebreak on firsts
  assert.strictEqual(st[2].pts, 12);
  assert.strictEqual(st[3].pts, 12);
  assert.strictEqual(st[2].t.id, 't0');
  assert.strictEqual(st[2].firsts, 1);
  assert.strictEqual(st[3].t.id, 't1');
  assert.strictEqual(st[3].firsts, 0);
});

test('full finished weekend: champion has the most points', () => {
  const s = freshTeams();
  KO.EVENTS.forEach(e => {
    s.results[e.n] = e.mode === 'dodgeball' ? { win: ['t0', 't1'] } : { rank: ['t0', 't1', 't2', 't3'] };
  });
  const st = KO.standings(s);
  assert.strictEqual(st[0].t.id, 't0');
  // t0 is 1st in every placement/bracket event; the dodgeball event isn't a "first"
  assert.strictEqual(st[0].firsts, KO.EVENTS.filter(e => e.mode !== 'dodgeball').length);
});

test('playerGames counts lineup appearances + whole-team events', () => {
  const s = freshTeams();
  s.results[2] = { rank: ['t0', 't1', 't2', 't3'], lineup: { t0: [0, 1] } }; // count:2 event
  s.results[ALLTEAM] = { rank: ['t0', 't1', 't2', 't3'] };                    // count:'all'
  assert.strictEqual(KO.playerGames(s, 0, 0), 2); // lineup + all-team
  assert.strictEqual(KO.playerGames(s, 0, 1), 2);
  assert.strictEqual(KO.playerGames(s, 0, 2), 1); // only the all-team event
});
