const { test, expect, EDITOR_SECRET } = require('./helpers');

const BEFORE_REVEAL = new Date('2026-06-04T20:00:00-07:00');

test('a #room= sandbox skips the countdown and is clearly badged', async ({ page }) => {
  await page.clock.install({ time: BEFORE_REVEAL });    // before kickoff
  await page.goto('/#room=demo');                        // viewer, sandbox
  await expect(page.locator('.lock-title')).toHaveCount(0);          // no countdown in a sandbox
  await expect(page.locator('#hdrRole')).toContainText(/test room/i);
  await expect(page.locator('#view-now')).toBeVisible();
});

test('the sandbox is an isolated Firebase node — the real party room is untouched', async ({ page }) => {
  await page.goto(`/#room=iso&edit=${EDITOR_SECRET}`);   // editor in sandbox
  await expect(page.locator('#navDraft')).toBeVisible(); // editor connected (and seeded the room)
  const db = await page.evaluate(() => window.__fbmock.dump());
  expect(db.rooms['test-iso'], 'sandbox node exists').toBeTruthy();
  expect(db.rooms['ken-olympics-2026'], 'real room untouched').toBeFalsy();
});

test('&view=1 forces read-only even on a device that has claimed editor', async ({ page }) => {
  await page.goto(`/#room=pv&edit=${EDITOR_SECRET}`);          // claim editor (saves the device flag)
  await expect(page.locator('#navDraft')).toBeVisible();
  await page.goto(`/#room=pv&edit=${EDITOR_SECRET}&view=1`);   // same device, force the guest view…
  await page.reload();                                         // …as a fresh load (hash-only change won't re-run connect)
  await expect(page.locator('#navDraft')).toBeHidden();
  await expect(page.getByRole('button', { name: /record result/i })).toHaveCount(0);
});

test('editor → viewer live sync works inside a sandbox', async ({ page, context }) => {
  await page.clock.install({ time: BEFORE_REVEAL });
  await page.goto('/#room=live');                         // viewer first (read-only)
  await expect(page.locator('#navDraft')).toBeHidden();
  await expect(page.locator('#view-now')).toContainText(/setting the stage/i);

  const editor = await context.newPage();
  await editor.goto(`/#room=live&edit=${EDITOR_SECRET}`);
  await editor.locator('.nav-btn[data-tab="draft"]').click();
  const cards = editor.locator('.team-edit');
  for (let i = 0; i < 4; i++) {
    await cards.nth(i).locator('input.tname').fill(['Sharks', 'Goblins', 'Pirates', 'Wolves'][i]);
    await cards.nth(i).locator('.player-in input').first().fill('P' + (i + 1));
  }
  await editor.getByRole('button', { name: /lock in rosters/i }).click();

  // the viewer (same sandbox) gets the live update
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.locator('.rank')).toHaveCount(4);
  await expect(page.locator('.rank').first().locator('.tn')).toHaveText('Sharks');
});
