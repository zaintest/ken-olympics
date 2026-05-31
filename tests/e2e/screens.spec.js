/* Visual-capture spec. Skipped in normal runs; capture with:
     SHOTS=1 npx playwright test screens --project="Mobile Safari"
   PNGs land in ./screenshots for a real device-viewport design pass.
   One state per test → fresh context → the seed applies cleanly. */
const { test, expect, editorPath, viewerPath, seedState, draftedState, finishedState } = require('./helpers');

const DIR = 'screenshots';
const AFTER = new Date('2026-06-05T06:00:00Z');
const BEFORE = new Date('2026-06-04T20:00:00-07:00');

test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });

test('editor onboarding + draft', async ({ page }) => {
  await page.goto(editorPath);
  await shot(page, '01-editor-now-empty');
  await page.locator('.nav-btn[data-tab="draft"]').click();
  const cards = page.locator('.team-edit');
  const names = ['Sharks', 'Goblins', 'Pirates', 'Wolves'];
  const players = [['Andre', 'Ben', 'Cy'], ['Deon', 'Eli', 'Finn'], ['Gus', 'Hank', 'Ivo'], ['Jax', 'Kel', 'Lou']];
  for (let i = 0; i < 4; i++) {
    await cards.nth(i).locator('input.tname').fill(names[i]);
    const inp = cards.nth(i).locator('.player-in input');
    for (let j = 0; j < 3; j++) await inp.nth(j).fill(players[i][j]);
    await cards.nth(i).locator('.cap-toggle').first().click();
  }
  await shot(page, '02-editor-draft');
});

test('now + result modal + schedule (drafted)', async ({ page }) => {
  await seedState(page, draftedState());
  await page.goto(editorPath);
  await shot(page, '03-now-current-event');
  await page.getByRole('button', { name: /record result/i }).click();
  await shot(page, '04-result-modal-bracket');
  await page.locator('.btn.ghost', { hasText: /cancel/i }).click();
  await page.locator('.nav-btn[data-tab="sched"]').click();
  await shot(page, '05-schedule');
});

test('placement modal with lineup picker (drafted)', async ({ page }) => {
  await seedState(page, draftedState());
  await page.goto(editorPath);
  await page.locator('.nav-btn[data-tab="sched"]').click();
  await page.locator('.ev', { hasText: 'Mario Kart' }).click();
  await shot(page, '04b-result-modal-placement');
});

test('scores + champion + share (finished)', async ({ page }) => {
  await seedState(page, finishedState());
  await page.goto(editorPath);
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await shot(page, '06-scores-standings');
  await page.getByRole('button', { name: /share/i }).first().click();
  await shot(page, '08-share-sheet');
  await page.locator('.btn.ghost', { hasText: /close/i }).click();
  await page.locator('.nav-btn[data-tab="now"]').click();
  await shot(page, '07-champion');
});

test('viewer countdown + live board (finished)', async ({ page }) => {
  await page.clock.install({ time: BEFORE });
  await seedState(page, finishedState());
  await page.goto(viewerPath);
  await shot(page, '09-viewer-countdown');
  await page.clock.setFixedTime(AFTER);
  await page.reload();
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await shot(page, '10-viewer-scores-live');
});
