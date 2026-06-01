'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const KO = require('../../engine.js');

// At the very start every team is tied, so bracketSeed falls back to team order:
// A = seed1 = t0, B = seed4 = t3, C = seed2 = t1, D = seed3 = t2.
test('bracketSeed pairs 1v4 and 2v3 by current standings', () => {
  const s = KO.defaultState();
  const ev = KO.EVENTS.find(e => e.n === 1);
  const seed = KO.bracketSeed(s, ev);
  assert.strictEqual(seed.A.id, 't0'); // 1 seed
  assert.strictEqual(seed.B.id, 't3'); // 4 seed
  assert.strictEqual(seed.C.id, 't1'); // 2 seed
  assert.strictEqual(seed.D.id, 't2'); // 3 seed
});

test('deriveBracketRank: favourites hold serve → [A, C, B, D]', () => {
  const s = KO.defaultState();
  const ev = KO.EVENTS.find(e => e.n === 1);
  // SF1: A beats B. SF2: C beats D. Final: A beats C. 3rd: B beats D.
  const br = { sf1: 't0', sf2: 't1', final: 't0', third: 't3' };
  assert.deepStrictEqual(KO.deriveBracketRank(s, ev, br), ['t0', 't1', 't3', 't2']);
});

test('deriveBracketRank: upsets — lower seeds win both semis and the final', () => {
  const s = KO.defaultState();
  const ev = KO.EVENTS.find(e => e.n === 7);
  // SF1: B(t3) beats A(t0). SF2: D(t2) beats C(t1). Final: D beats B. 3rd: A beats C.
  const br = { sf1: 't3', sf2: 't2', final: 't2', third: 't0' };
  // 1st = final winner t2, 2nd = other finalist t3, 3rd = third-game winner t0, 4th = t1
  assert.deepStrictEqual(KO.deriveBracketRank(s, ev, br), ['t2', 't3', 't0', 't1']);
});

test('deriveBracketRank always returns 4 distinct teams', () => {
  const s = KO.defaultState();
  const ev = KO.EVENTS.find(e => e.n === 1);
  const br = { sf1: 't0', sf2: 't2', final: 't2', third: 't3' };
  const rank = KO.deriveBracketRank(s, ev, br);
  assert.strictEqual(rank.length, 4);
  assert.strictEqual(new Set(rank).size, 4);
});

test('bracketView shows only the semifinals until both are decided', () => {
  const s = KO.defaultState();
  const ev = KO.EVENTS.find(e => e.n === 1);
  assert.strictEqual(KO.bracketView(s, ev, {}).length, 2);
  assert.strictEqual(KO.bracketView(s, ev, { sf1: 't0' }).length, 2);
  assert.strictEqual(KO.bracketView(s, ev, { sf1: 't0', sf2: 't1' }).length, 4);
});

test('bracketView reports matchups, winners, and derived losers', () => {
  const s = KO.defaultState();           // seeds A=t0 B=t3 C=t1 D=t2
  const ev = KO.EVENTS.find(e => e.n === 1);
  const v = KO.bracketView(s, ev, { sf1: 't0', sf2: 't1', final: 't0', third: 't3' });
  assert.deepStrictEqual(v.map(x => [x.key, x.a, x.b, x.winner]), [
    ['sf1', 't0', 't3', 't0'],
    ['sf2', 't1', 't2', 't1'],
    ['final', 't0', 't1', 't0'],
    ['third', 't3', 't2', 't3']
  ]);
});

test('bracketView uses the FROZEN seed — every match winner stays inside its match', () => {
  const s = KO.defaultState();                       // live standings would seed t0,t3,t1,t2…
  const ev = KO.EVENTS.find(e => e.n === 1);
  // …but this bracket was PLAYED with a different seed (t3,t2,t1,t0); the frozen seed must win
  const br = { seed: ['t3', 't2', 't1', 't0'], sf1: 't3', sf2: 't1', final: 't3', third: 't2' };
  const v = KO.bracketView(s, ev, br);
  assert.deepStrictEqual([v[0].a, v[0].b, v[0].winner], ['t3', 't2', 't3']); // SF1 = t3 v t2, t3 wins
  assert.deepStrictEqual([v[1].a, v[1].b, v[1].winner], ['t1', 't0', 't1']); // SF2 = t1 v t0, t1 wins
  for (const m of v) assert.ok(m.winner === m.a || m.winner === m.b, `orphan winner in ${m.key}`);
});

test('deriveBracketRank also honours the frozen seed', () => {
  const s = KO.defaultState();
  const ev = KO.EVENTS.find(e => e.n === 1);
  const br = { seed: ['t3', 't2', 't1', 't0'], sf1: 't3', sf2: 't1', final: 't3', third: 't2' };
  assert.deepStrictEqual(KO.deriveBracketRank(s, ev, br), ['t3', 't1', 't2', 't0']);
});

test('only events 1 and 7 are brackets; Mario Kart (2) is plain placement', () => {
  assert.strictEqual(KO.EVENTS.find(e => e.n === 1).mode, 'bracket');
  assert.strictEqual(KO.EVENTS.find(e => e.n === 7).mode, 'bracket');
  assert.strictEqual(KO.EVENTS.find(e => e.n === 2).mode, 'placement');
  const brackets = KO.EVENTS.filter(e => e.mode === 'bracket').map(e => e.n);
  assert.deepStrictEqual(brackets, [1, 7]);
});
