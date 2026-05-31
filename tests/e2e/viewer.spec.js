const { test, expect, editorPath, viewerPath, seedState, draftedState } = require('./helpers');

const AFTER_REVEAL = new Date('2026-06-05T06:00:00Z');     // 30 min after kickoff
const BEFORE_REVEAL = new Date('2026-06-04T20:00:00-07:00'); // ~2.5h before kickoff

test('viewer link is strictly read-only: no Draft tab, no record/edit buttons', async ({ page }) => {
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, draftedState());
  await page.goto(viewerPath);

  await expect(page.locator('#navDraft')).toBeHidden();
  await expect(page.locator('.nav-in')).toHaveClass(/cols-3/);
  // no "Record Result" anywhere across the three viewer tabs
  await expect(page.getByRole('button', { name: /record result/i })).toHaveCount(0);
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.getByRole('button', { name: /share/i })).toHaveCount(0);  // editor-only control
  // schedule rows are non-interactive (read-only)
  await page.locator('.nav-btn[data-tab="sched"]').click();
  await expect(page.locator('.ev').first()).toHaveClass(/ro/);
});

test('the live signal is honest: viewer shows LIVE only on a real connection', async ({ page }) => {
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, draftedState());
  await page.goto(viewerPath);
  await expect(page.locator('#hdrRole .live-dot-pill')).toContainText(/live/i);
});

test('an editor result lands on the viewer live (no refresh)', async ({ page, context }) => {
  const drafted = draftedState();

  // viewer, post-reveal so the board (not the countdown) is showing
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, drafted);
  await page.goto(viewerPath);
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.locator('.rank')).toHaveCount(4);
  await expect(page.locator('.rank').first().locator('.pts')).toContainText('0');

  // editor (same browser context → shares the mock) records event 1
  const editor = await context.newPage();
  await seedState(editor, drafted);
  await editor.goto(editorPath);
  await editor.getByRole('button', { name: /record result/i }).click();
  await editor.locator('.bstage', { hasText: 'Semifinal 1' }).locator('.mteam').first().click();
  await editor.locator('.bstage', { hasText: 'Semifinal 2' }).locator('.mteam').first().click();
  await editor.locator('.bstage', { hasText: '🥇' }).locator('.mteam').first().click();
  await editor.locator('.bstage', { hasText: '🥉' }).locator('.mteam').first().click();
  await editor.locator('#saveBtn').click();

  // viewer updates itself — Sharks (seed 1, bracket winner) now lead with 10
  await expect(page.locator('.rank').first().locator('.tn')).toHaveText('Sharks');
  await expect(page.locator('.rank').first().locator('.pts')).toContainText('10');
});

test('countdown is shown before kickoff, then auto-reveals at kickoff', async ({ page }) => {
  await page.clock.install({ time: BEFORE_REVEAL });
  await seedState(page, draftedState());
  await page.goto(viewerPath);

  await expect(page.locator('.lock-title')).toBeVisible();
  await expect(page.locator('#cd-h')).toBeVisible();
  await expect(page.locator('nav')).toBeHidden();             // nav hidden while sealed

  // cross the kickoff boundary — the 1s tick swaps to the live board on its own
  await page.clock.fastForward('02:31:00');                   // past 10:30 PM PT

  await expect(page.locator('.lock-title')).toBeHidden();
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('#view-now')).toBeVisible();
});

test('snapshot link (#v=) is clearly non-live and bypasses the countdown', async ({ page }) => {
  const KO = require('../../engine.js');
  const snap = KO.defaultState();
  snap.setupDone = true;
  snap.teams[0].name = 'Frozen FC';
  snap.results[1] = { rank: ['t0', 't1', 't2', 't3'] };
  const url = '/#v=' + KO.encState(snap);

  await page.clock.install({ time: BEFORE_REVEAL });           // even before kickoff…
  await page.goto(url);

  // …a snapshot shows its frozen board immediately, labelled NOT LIVE — never a countdown
  await expect(page.locator('.lock-title')).toHaveCount(0);
  await expect(page.locator('#hdrRole')).toContainText(/snapshot/i);
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.locator('.rank', { hasText: 'Frozen FC' })).toBeVisible();
});
