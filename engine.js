/* ============================================================
   Ken Olympics — engine.js
   Pure, framework-free logic shared by index.html (browser) and
   the Node test suite. No DOM, no Firebase. Loads as a classic
   <script> in the browser (exposes window.KO + an allow-list of
   globals) and via require() in Node (module.exports).

   Nothing here touches `document`, `localStorage`, `firebase`,
   or app state except through explicit function arguments — which
   is exactly what makes it unit-testable.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- DATA (game rules — do not alter) ---------------- */
  const PALETTE = [
    { name: 'Coral',    v: '#ff6f59' }, { name: 'Ocean',  v: '#2fa8d0' },
    { name: 'Palm',     v: '#3fc26e' }, { name: 'Sunset', v: '#ffb13b' },
    { name: 'Hibiscus', v: '#ff4f7d' }, { name: 'Surf',   v: '#2fd0c0' },
    { name: 'Plum',     v: '#a06bf0' }, { name: 'Mango',  v: '#ffd23b' }
  ];

  // count = players per team (1, 2, or 'all'); mode = placement | bracket | dodgeball
  const EVENTS = [
    { n: 1,  name: 'Smash',                       day: 'FRI', count: 1,     mode: 'bracket',   note: '4-team single-elim bracket + 3rd-place game. Each team fields 1 player.' },
    { n: 2,  name: 'Mario Kart',                  day: 'FRI', count: 2,     mode: 'placement', note: '6 races — sum in-game points across both teammates, then enter the team finishing order.' },
    { n: 3,  name: 'Back-to-Back Drawing',        day: 'FRI', count: 2,     mode: 'placement', judged: true, note: 'Pairs sit back-to-back — one describes a hidden image, the partner draws it blind. Judged on likeness.' },
    { n: 4,  name: 'Knockout',                    day: 'FRI', count: 2,     mode: 'placement', note: 'Last team with a player still alive = 1st.' },
    { n: 5,  name: 'Horse / Pig',                 day: 'FRI', count: 1,     mode: 'placement', note: 'P-I-G free-for-all, last standing wins.' },
    { n: 6,  name: 'Cornhole',                    day: 'FRI', count: 1,     mode: 'placement', note: 'Single elim, run live; enter the final order.' },
    { n: 7,  name: 'Pool Basketball 2v2',         day: 'FRI', count: 2,     mode: 'bracket',   note: '4-team single-elim bracket + 3rd-place game. No dunking. Each team fields 2 players.' },
    { n: 8,  name: 'Blackjack',                   day: 'SAT', count: 1,     mode: 'placement', note: 'Equal chips, 10 hands, rank by chip count.' },
    { n: 9,  name: 'Dad Joke Off',                day: 'SAT', count: 1,     mode: 'placement', note: '4 in a circle, 6 rounds, 1 pt per laugh you cause.' },
    { n: 10, name: 'Beer Pong',                   day: 'SAT', count: 2,     mode: 'placement', note: 'Single elim, run live; enter the final order.' },
    { n: 11, name: 'Blindfold Guessing',          day: 'SAT', count: 1,     mode: 'placement', note: '60s round, most correct, speed tiebreak.' },
    { n: 12, name: 'Grilled Cheese Championship', day: 'SAT', count: 'all', mode: 'placement', judged: true, note: 'Draw a cheese + special ingredient. Judged: Execution / Pairing / Presentation.' },
    { n: 13, name: 'Dodgeball',                   day: 'SAT', count: 'all', mode: 'dodgeball', note: 'Two alliances (seed 1st+4th vs 2nd+3rd). Winning teams +8 each, losing +2 each.' },
    { n: 14, name: 'Lip Sync Battle',             day: 'SAT', count: 'all', mode: 'placement', judged: true, note: 'DOUBLE POINTS FINALE — the whole team performs, full theatrics. The title gets won here.' }
  ];

  const PTS = { standard: [10, 6, 3, 1], finale: [20, 12, 6, 2] };
  const DODGE_WIN = 8, DODGE_LOSE = 2;
  const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

  // Reveal at 10:30 PM Pacific on Thu June 4, 2026. June = PDT (UTC-7) -> 05:30 UTC on Jun 5.
  // This is a single absolute UTC instant, so it fires at the same real moment in every timezone.
  const REVEAL_AT = Date.UTC(2026, 5, 5, 5, 30, 0);

  const ptsArr     = ev => (ev && (ev.type === 'finale' || ev.n === 14)) ? PTS.finale : PTS.standard;
  const isFinale   = ev => !!ev && ev.n === 14;
  const countLabel = ev => ev.count === 'all' ? 'Whole team' : (ev.count + ' / team');

  /* ---------------- STATE ---------------- */
  function defaultState() {
    return {
      setupDone: false,
      teams: [0, 1, 2, 3].map(i => ({
        id: 't' + i, name: 'Team ' + (i + 1), color: PALETTE[i].v,
        players: [{ name: '', cap: false }, { name: '', cap: false }, { name: '', cap: false }]
      })),
      results: {} // n -> {rank:[ids], lineup:{tid:[idx]}, bracket?:{}} | {win:[ids], lineup}
    };
  }

  /* ---------------- SHARE CODEC (offline snapshot links) ---------------- */
  // btoa/atob/escape/unescape exist in both modern browsers and Node 16+, so the
  // encoding stays byte-compatible with any snapshot links already in the wild.
  function encState(obj) { try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); } catch (e) { return ''; } }
  function decState(str) { try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch (e) { return null; } }

  /* ---------------- URL HASH PARAMS ---------------- */
  // Pass a hash string for testing; defaults to location.hash in the browser.
  function hashParams(hash) {
    let h = hash;
    if (h == null) h = (typeof location !== 'undefined' && location.hash) ? location.hash : '';
    h = String(h).replace(/^#/, '');
    const o = {};
    if (!h) return o;
    h.split('&').forEach(kv => {
      const i = kv.indexOf('=');
      const k = i < 0 ? kv : kv.slice(0, i);
      const v = i < 0 ? '' : kv.slice(i + 1);
      if (k) { try { o[k] = decodeURIComponent(v); } catch (e) { o[k] = v; } }
    });
    return o;
  }

  /* ---------------- SCORING ENGINE ---------------- */
  function pointsForEvent(S, n) {
    const ev = EVENTS.find(e => e.n === n);
    const r = S.results[n];
    const out = {};
    S.teams.forEach(t => { out[t.id] = 0; });
    if (!r || !ev) return out;
    if (ev.mode === 'dodgeball') {
      if (r.win) S.teams.forEach(t => { out[t.id] = r.win.includes(t.id) ? DODGE_WIN : DODGE_LOSE; });
    } else {
      const arr = ptsArr(ev);
      if (r.rank) r.rank.forEach((id, i) => { if (out[id] !== undefined) out[id] = arr[i] || 0; });
    }
    return out;
  }

  function totals(S, excl) {
    const tot = {};
    S.teams.forEach(t => { tot[t.id] = 0; });
    EVENTS.forEach(e => {
      if (excl && e.n === excl) return;
      const p = pointsForEvent(S, e.n);
      S.teams.forEach(t => { tot[t.id] += p[t.id]; });
    });
    return tot;
  }

  function firstsCount(S, id) {
    let c = 0;
    EVENTS.forEach(e => { const r = S.results[e.n]; if (r && r.rank && r.rank[0] === id) c++; });
    return c;
  }

  // Sort: total points, then most 1st-place finishes (cornhole sudden-death is manual / off-app).
  function standings(S, excl) {
    const tot = totals(S, excl);
    return S.teams
      .map(t => ({ t, pts: tot[t.id], firsts: firstsCount(S, t.id) }))
      .sort((a, b) => b.pts - a.pts || b.firsts - a.firsts);
  }

  // How many events this player is recorded in (whole-team events count for everyone).
  function playerGames(S, ti, pi) {
    let c = 0;
    EVENTS.forEach(ev => {
      const r = S.results[ev.n];
      if (!r) return;
      if (ev.count === 'all') { c++; return; }
      if (r.lineup && r.lineup['t' + ti] && r.lineup['t' + ti].includes(pi)) c++;
    });
    return c;
  }

  /* ---------------- BRACKET (events 1 & 7) ---------------- */
  // Seeded by current standings excluding this event: A=1 seed, B=4, C=2, D=3.
  function bracketSeed(S, ev) {
    const s = standings(S, ev.n);
    return { A: s[0].t, B: s[3].t, C: s[1].t, D: s[2].t };
  }

  // From seed + picks {sf1,sf2,final,third} derive the final [1st,2nd,3rd,4th] team-id order.
  function deriveBracketRank(S, ev, br) {
    const { A, B, C, D } = bracketSeed(S, ev);
    const fin2 = (br.final === br.sf1) ? br.sf2 : br.sf1;
    const sf1L = (br.sf1 === A.id) ? B.id : A.id;
    const sf2L = (br.sf2 === C.id) ? D.id : C.id;
    const thirdL = (br.third === sf1L) ? sf2L : sf1L;
    return [br.final, fin2, br.third, thirdL];
  }

  // A renderable, read-only view of the bracket (for viewers + the schedule). Returns the
  // stages with team ids and the winner so far; the Final/3rd appear only once both semis
  // are decided. `br` may be partial (live, mid-tournament) or complete.
  function bracketView(S, ev, br) {
    br = br || {};
    const { A, B, C, D } = bracketSeed(S, ev);
    const stages = [
      { key: 'sf1', label: 'Semifinal 1', a: A.id, b: B.id, winner: br.sf1 || null },
      { key: 'sf2', label: 'Semifinal 2', a: C.id, b: D.id, winner: br.sf2 || null }
    ];
    if (br.sf1 && br.sf2) {
      const l1 = (br.sf1 === A.id) ? B.id : A.id;
      const l2 = (br.sf2 === C.id) ? D.id : C.id;
      stages.push({ key: 'final', label: 'Final',     a: br.sf1, b: br.sf2, winner: br.final || null });
      stages.push({ key: 'third', label: '3rd-place', a: l1,     b: l2,     winner: br.third || null });
    }
    return stages;
  }

  /* ---------------- COUNTDOWN / LOCK ---------------- */
  function countdownParts(now) {
    let ms = Math.max(0, REVEAL_AT - now);
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000);  ms -= h * 3600000;
    const m = Math.floor(ms / 60000);    ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    return { d, h, m, s };
  }
  // Editors are never locked; viewers are locked until REVEAL_AT.
  function isLockedAt(viewOnly, now) { return !!viewOnly && now < REVEAL_AT; }

  /* ---------------- SECURITY: SHA-256 (sync, dependency-free) ----------------
     Used to keep the editor secret OUT of the public source: only its hash ships.
     Self-contained so it behaves identically in the browser and in Node tests.
     Correctness is pinned by unit tests against published NIST vectors. */
  function sha256Hex(message) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const rrot = (x, n) => (x >>> n) | (x << (32 - n));

    // UTF-8 encode the message into bytes
    const bytes = [];
    for (let i = 0; i < message.length; i++) {
      let c = message.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c < 0xd800 || c >= 0xe000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      else { // surrogate pair
        i++;
        const cp = 0x10000 + (((c & 0x3ff) << 10) | (message.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
    bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

    const w = new Array(64);
    for (let off = 0; off < bytes.length; off += 64) {
      for (let t = 0; t < 16; t++)
        w[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3];
      for (let t = 16; t < 64; t++) {
        const s0 = rrot(w[t - 15], 7) ^ rrot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rrot(w[t - 2], 17) ^ rrot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
  }

  /* ---------------- ROLE RESOLUTION (soft edit gate) ---------------- */
  // editor iff a previously-claimed editor flag is set on this device, OR the URL
  // carries a secret whose hash matches the embedded one. Everyone else = viewer.
  function resolveRole(opts) {
    opts = opts || {};
    if (opts.savedEditor) return 'editor';
    if (opts.providedKey && opts.editorKeyHash && sha256Hex(opts.providedKey) === opts.editorKeyHash) return 'editor';
    return 'viewer';
  }

  /* ---------------- EXPORTS ---------------- */
  const api = {
    PALETTE, EVENTS, PTS, DODGE_WIN, DODGE_LOSE, MEDALS, REVEAL_AT,
    ptsArr, isFinale, countLabel, defaultState, encState, decState, hashParams,
    pointsForEvent, totals, firstsCount, standings, playerGames,
    bracketSeed, deriveBracketRank, bracketView, countdownParts, isLockedAt,
    sha256Hex, resolveRole
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.KO = api;
    // expose the data + pure helpers that index.html references by bare name
    ['PALETTE', 'EVENTS', 'PTS', 'DODGE_WIN', 'DODGE_LOSE', 'MEDALS', 'REVEAL_AT',
     'ptsArr', 'isFinale', 'countLabel', 'defaultState', 'encState', 'decState', 'hashParams']
      .forEach(k => { window[k] = api[k]; });
  }
})();
