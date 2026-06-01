/* Shared E2E helpers: auto-install the Firebase mock on every test's context,
   plus small builders for app state (constructed with the REAL engine.js so the
   shapes can't drift from production). */
const pw = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const KO = require('../../engine.js');

const expect = pw.expect;
const EDITOR_SECRET = '33WX-SRGH-NNDF';            // plaintext whose sha256 is embedded in index.html
const ROOM = 'ken-olympics-2026';
const MOCK = fs.readFileSync(path.join(__dirname, 'firebase-mock.js'), 'utf8');

// Every test's browser context: (1) serve the mock instead of the real Firebase CDN,
// (2) kill CSS animations/transitions so WebKit's actionability "stability" checks don't
// fight the slide-up sheet / button transforms (purely a test-speed/flake concern).
const test = pw.test.extend({
  context: async ({ context }, use) => {
    await context.route('**/firebasejs/**', route =>
      route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: MOCK })
    );
    await context.addInitScript(() => {
      const css = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
                  'transition-duration:0s!important;transition-delay:0s!important;}';
      const inject = () => {
        const root = document.head || document.documentElement;
        if (!root) return requestAnimationFrame(inject);
        const s = document.createElement('style'); s.textContent = css; root.appendChild(s);
      };
      inject();
    });
    await use(context);
  }
});

const TEAM_NAMES = ['Sharks', 'Goblins', 'Pirates', 'Wolves'];
const PLAYER_NAMES = [
  ['Andre', 'Ben', 'Cy'], ['Deon', 'Eli', 'Finn'],
  ['Gus', 'Hank', 'Ivo'], ['Jax', 'Kel', 'Lou']
];

// teams named + captains set, no results yet
function draftedState() {
  const s = KO.defaultState();
  s.setupDone = true;
  s.teams.forEach((t, i) => {
    t.name = TEAM_NAMES[i];
    t.players.forEach((p, j) => { p.name = PLAYER_NAMES[i][j]; });
    t.players[0].cap = true;
  });
  return s;
}

// a fully-played weekend so standings/champion can be asserted deterministically
function finishedState() {
  const s = draftedState();
  KO.EVENTS.forEach(e => {                                // t0 wins everything
    s.results[e.n] = e.mode === 'dodgeball' ? { win: ['t0', 't1'] } : { rank: ['t0', 't1', 't2', 't3'] };
  });
  return s;
}

// Seed the mock DB before the app boots (runs once; never clobbers later live writes).
async function seedState(page, state) {
  await page.addInitScript(({ room, state }) => {
    try {
      if (!localStorage.getItem('__fbmock_db__'))
        localStorage.setItem('__fbmock_db__', JSON.stringify({ rooms: { [room]: { state, updated: 1 } } }));
    } catch (e) {}
  }, { room: ROOM, state });
}

const editorPath = '/#edit=' + EDITOR_SECRET;
const viewerPath = '/';

module.exports = {
  test, expect, KO, EDITOR_SECRET, ROOM,
  draftedState, finishedState, seedState, editorPath, viewerPath,
  TEAM_NAMES, PLAYER_NAMES
};
