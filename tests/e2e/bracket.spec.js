const { test, expect, editorPath, viewerPath, seedState, draftedState } = require('./helpers');

const AFTER_REVEAL = new Date('2026-06-05T06:00:00Z');

async function openEditorOnSmash(context, drafted) {
  const editor = await context.newPage();
  await seedState(editor, drafted);
  await editor.goto(editorPath);
  await editor.getByRole('button', { name: /record result/i }).click(); // Smash = event 1 (bracket)
  return editor;
}

test('viewers watch the bracket light up live, then see it on the schedule when done', async ({ page, context }) => {
  const drafted = draftedState();

  // viewer on the Now tab, post-reveal
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, drafted);
  await page.goto(viewerPath);
  await expect(page.locator('.nav-btn[data-tab="now"]')).toHaveClass(/active/);
  await expect(page.locator('.bview')).toHaveCount(0);                 // nothing yet

  // editor records Semifinal 1
  const editor = await openEditorOnSmash(context, drafted);
  await editor.locator('.bstage', { hasText: 'Semifinal 1' }).locator('.mteam').first().click();

  // → the viewer's Now lights up with a live bracket, SF1 winner highlighted
  // (generous timeout: the mock relays cross-page over BroadcastChannel, which can lag under load)
  await expect(page.locator('.bview')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.bview .bvteam.win')).toHaveCount(1, { timeout: 15000 });

  // editor records SF2 → viewer now shows the Final + 3rd-place rows appear
  await editor.locator('.bstage', { hasText: 'Semifinal 2' }).locator('.mteam').first().click();
  await expect(page.locator('.bview .bvmatch')).toHaveCount(4, { timeout: 15000 });

  // finish + save
  await editor.locator('.bstage', { hasText: '🥇' }).locator('.mteam').first().click();
  await editor.locator('.bstage', { hasText: '🥉' }).locator('.mteam').first().click();
  await editor.locator('#saveBtn').click();

  // live preview clears on Now (event done → Now advances), bracket now lives on the Schedule
  await expect(page.locator('#view-now .bview')).toHaveCount(0, { timeout: 15000 });
  await page.locator('.nav-btn[data-tab="sched"]').click();
  await expect(page.locator('.bracket-det')).toHaveCount(1, { timeout: 15000 }); // finished bracket event
  await page.locator('.bracket-det summary').first().click();         // expand
  await expect(page.locator('.bracket-det .bview')).toBeVisible();
  await expect(page.locator('.bracket-det .bvmatch')).toHaveCount(4); // SF1, SF2, Final, 3rd
});

test('cancelling a bracket clears the live preview for viewers', async ({ page, context }) => {
  const drafted = draftedState();
  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, drafted);
  await page.goto(viewerPath);

  const editor = await openEditorOnSmash(context, drafted);
  await editor.locator('.bstage', { hasText: 'Semifinal 1' }).locator('.mteam').first().click();
  await expect(page.locator('.bview')).toBeVisible({ timeout: 15000 });   // viewer sees it

  await editor.locator('.btn.ghost', { hasText: /cancel/i }).click();     // editor backs out
  await expect(page.locator('.bview')).toHaveCount(0, { timeout: 15000 });// preview removed for viewers
});
