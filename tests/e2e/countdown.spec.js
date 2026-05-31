const { test, expect, editorPath, viewerPath, seedState, draftedState, KO } = require('./helpers');

const REVEAL = KO.REVEAL_AT;
const BEFORE_REVEAL = new Date('2026-06-04T20:00:00-07:00'); // ~2.5h before kickoff

test('the editor is NEVER locked — full app hours before kickoff', async ({ page }) => {
  await page.clock.install({ time: BEFORE_REVEAL });
  await page.goto(editorPath);
  await expect(page.locator('.lock-title')).toHaveCount(0);   // no countdown for the editor
  await expect(page.locator('#navDraft')).toBeVisible();
  await expect(page.locator('nav')).toBeVisible();
});

test('the editor is not locked even at the exact reveal instant', async ({ page }) => {
  await page.clock.install({ time: new Date(REVEAL) });
  await page.goto(editorPath);
  await expect(page.locator('.lock-title')).toHaveCount(0);
  await expect(page.locator('#navDraft')).toBeVisible();
});

test('viewer is locked one second before reveal, live one second after', async ({ page }) => {
  await page.clock.install({ time: new Date(REVEAL - 1000) });
  await seedState(page, draftedState());
  await page.goto(viewerPath);
  await expect(page.locator('.lock-title')).toBeVisible();    // sealed

  await page.clock.setFixedTime(new Date(REVEAL + 1000));
  await page.reload();
  await expect(page.locator('.lock-title')).toBeHidden();     // revealed
  await expect(page.locator('nav')).toBeVisible();
});

test('the countdown digits are rendered while sealed', async ({ page }) => {
  // 2d 3h 4m 30s before reveal — the +30s keeps the minute stable against sub-second load drift
  await page.clock.install({ time: new Date(REVEAL - ((2 * 86400 + 3 * 3600 + 4 * 60 + 30) * 1000)) });
  await page.goto(viewerPath);
  await expect(page.locator('#cd-d')).toHaveText('2');
  await expect(page.locator('#cd-h')).toHaveText('03');
  await expect(page.locator('#cd-m')).toHaveText('04');
});
