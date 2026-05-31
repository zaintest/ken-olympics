const { test, expect, editorPath, viewerPath, seedState, draftedState, EDITOR_SECRET } = require('./helpers');

const AFTER_REVEAL = new Date('2026-06-05T06:00:00Z');

async function recordBracketWinner(p) {
  await p.getByRole('button', { name: /record result/i }).click();
  await p.locator('.bstage', { hasText: 'Semifinal 1' }).locator('.mteam').first().click();
  await p.locator('.bstage', { hasText: 'Semifinal 2' }).locator('.mteam').first().click();
  await p.locator('.bstage', { hasText: '🥇' }).locator('.mteam').first().click();
  await p.locator('.bstage', { hasText: '🥉' }).locator('.mteam').first().click();
  await p.locator('#saveBtn').click();
  await expect(p.locator('#overlay')).not.toHaveClass(/open/);
}

test('edit gate: correct secret → editor', async ({ page }) => {
  await page.goto('/#edit=' + EDITOR_SECRET);
  await expect(page.locator('#navDraft')).toBeVisible();
  await expect(page.locator('#hdrRole')).toContainText(/live synced/i);
});

test('edit gate: wrong secret → viewer (no editor powers)', async ({ page }) => {
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, draftedState());
  await page.goto('/#edit=NOT-THE-REAL-KEY');
  await expect(page.locator('#navDraft')).toBeHidden();
  await expect(page.getByRole('button', { name: /record result/i })).toHaveCount(0);
});

test('edit gate: no secret → viewer', async ({ page }) => {
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, draftedState());
  await page.goto(viewerPath);
  await expect(page.locator('#navDraft')).toBeHidden();
});

test('a viewer joining mid-event sees the current standings (reconnect)', async ({ page, context }) => {
  const drafted = draftedState();
  await seedState(page, drafted);
  await page.goto(editorPath);          // editor records one event first
  await recordBracketWinner(page);

  const viewer = await context.newPage(); // a brand-new viewer connects afterwards
  await viewer.clock.install({ time: AFTER_REVEAL });
  await seedState(viewer, drafted);
  await viewer.goto(viewerPath);
  await viewer.locator('.nav-btn[data-tab="scores"]').click();
  await expect(viewer.locator('.rank').first().locator('.tn')).toHaveText('Sharks');
  await expect(viewer.locator('.rank').first().locator('.pts')).toContainText('10');

  // and a full reload still shows it (state is server-side, not page-local)
  await viewer.reload();
  await viewer.locator('.nav-btn[data-tab="scores"]').click();
  await expect(viewer.locator('.rank').first().locator('.pts')).toContainText('10');
});

test('offline → online: an edit made while disconnected syncs on reconnect', async ({ page, context }) => {
  const drafted = draftedState();

  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, drafted);
  await page.goto(viewerPath);
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.locator('.rank').first().locator('.pts')).toContainText('0');

  const editor = await context.newPage();
  await seedState(editor, drafted);
  await editor.goto(editorPath);
  await editor.evaluate(() => window.__fbmock.setOnline(false));   // editor drops connection

  await recordBracketWinner(editor);                               // edits locally while offline
  const localPct = await editor.locator('#progBar').evaluate(el => parseFloat(el.style.width));
  expect(localPct).toBeGreaterThan(6);                             // ~7% (1 of 14) reflected locally
  expect(localPct).toBeLessThan(8);

  await page.waitForTimeout(400);
  await expect(page.locator('.rank').first().locator('.pts')).toContainText('0'); // viewer not yet updated

  await editor.evaluate(() => window.__fbmock.setOnline(true));    // reconnect → buffered write flushes
  await expect(page.locator('.rank').first().locator('.tn')).toHaveText('Sharks');
  await expect(page.locator('.rank').first().locator('.pts')).toContainText('10'); // now synced
});
