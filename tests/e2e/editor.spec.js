const { test, expect, editorPath, viewerPath, seedState, finishedState } = require('./helpers');

const TEAMS = ['Sharks', 'Goblins', 'Pirates', 'Wolves'];
const PLAYERS = [['Andre', 'Ben', 'Cy'], ['Deon', 'Eli', 'Finn'], ['Gus', 'Hank', 'Ivo'], ['Jax', 'Kel', 'Lou']];

async function runDraft(page) {
  await page.goto(editorPath);
  await page.locator('.nav-btn[data-tab="draft"]').click();
  const cards = page.locator('.team-edit');
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const card = cards.nth(i);
    await card.locator('input.tname').fill(TEAMS[i]);
    const inputs = card.locator('.player-in input');
    for (let j = 0; j < 3; j++) await inputs.nth(j).fill(PLAYERS[i][j]);
    await card.locator('.cap-toggle').first().click();          // captain = P1 (re-renders card)
    await page.locator('.team-edit').nth(i).locator('.colors button').nth(i).click(); // pick a colour
  }
  await page.getByRole('button', { name: /lock in rosters/i }).click();
  await expect(page.locator('.nav-btn[data-tab="now"]')).toHaveClass(/active/);
}

async function recordCurrent(page, n) {
  await page.getByRole('button', { name: /record result/i }).click();
  await expect(page.locator('#overlay')).toHaveClass(/open/);

  if (n === 13) {                                   // dodgeball: pick the two winning teams
    await page.locator('#dodgeRows .rrow', { hasText: 'Sharks' }).locator('.won-toggle').click();
    await page.locator('#dodgeRows .rrow', { hasText: 'Goblins' }).locator('.won-toggle').click();
  } else if (n === 1 || n === 7) {                  // bracket: SF winners → final → 3rd
    await page.locator('.bstage', { hasText: 'Semifinal 1' }).locator('.mteam').first().click();
    await page.locator('.bstage', { hasText: 'Semifinal 2' }).locator('.mteam').first().click();
    await page.locator('.bstage', { hasText: '🥇' }).locator('.mteam').first().click();
    await page.locator('.bstage', { hasText: '🥉' }).locator('.mteam').first().click();
  } else {                                          // placement: rows are in team order → 1,2,3,4
    if (n === 2) {                                  // also exercise the lineup picker on one event
      const chips = page.locator('.lineup-team').first().locator('.pchip');
      await chips.nth(0).click();
      await chips.nth(1).click();
    }
    const rows = page.locator('#rankRows .rrow');
    const count = await rows.count();
    for (let i = 0; i < count; i++) await rows.nth(i).locator('.place-sel button').nth(i).click();
  }

  await expect(page.locator('#saveBtn')).toHaveCSS('opacity', '1');  // enabled when result is complete
  await page.locator('#saveBtn').click();
  await expect(page.locator('#overlay')).not.toHaveClass(/open/);
}

test('full editor flow: draft → score all 14 events → champion crowned', async ({ page }) => {
  test.setTimeout(60_000);                            // 14 events × many taps, on two engines
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await runDraft(page);

  for (let n = 1; n <= 14; n++) {
    await recordCurrent(page, n);
    // progress bar advances as events complete
    const pct = await page.locator('#progBar').evaluate(el => parseFloat(el.style.width));
    expect(pct).toBeGreaterThan((n - 1) / 14 * 100 - 0.01);
  }

  // all 14 done → champion screen
  await expect(page.locator('.champ')).toBeVisible();
  await expect(page.locator('.champ .cn')).toHaveText('Sharks');     // t0 won everything
  await expect(page.locator('.champ .lbl')).toContainText(/champion/i);

  // standings sane: 4 ranked rows, Sharks on top
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.locator('.rank')).toHaveCount(4);
  await expect(page.locator('.rank').first().locator('.tn')).toHaveText('Sharks');

  expect(errors, 'no console/page errors across the whole editor flow').toEqual([]);
});

test('correcting a saved result recomputes the standings', async ({ page }) => {
  await seedState(page, finishedState());
  await page.goto(editorPath);

  await page.locator('.nav-btn[data-tab="scores"]').click();
  const sharks = page.locator('.rank', { hasText: 'Sharks' }).locator('.pts');
  await expect(sharks).toContainText('148');                       // 120 + 8 + 20

  // re-open the finale (event 14) from the schedule and flip the order to Wolves-first
  await page.locator('.nav-btn[data-tab="sched"]').click();
  await page.locator('.ev', { hasText: 'Lip Sync Battle' }).click();
  await expect(page.locator('#overlay')).toHaveClass(/open/);
  const newOrder = ['Wolves', 'Sharks', 'Goblins', 'Pirates'];
  for (let i = 0; i < 4; i++) {
    await page.locator('#rankRows .rrow', { hasText: newOrder[i] }).locator('.place-sel button').nth(i).click();
  }
  await page.locator('#saveBtn').click();
  await expect(page.locator('#overlay')).not.toHaveClass(/open/);

  // points recompute: Sharks lose the 20-pt finale (now 2nd = 12) → 148 - 8 = 140
  await page.locator('.nav-btn[data-tab="scores"]').click();
  await expect(page.locator('.rank', { hasText: 'Sharks' }).locator('.pts')).toContainText('140');
  await expect(page.locator('.rank', { hasText: 'Wolves' }).locator('.pts')).toContainText('34'); // 16 - 2 + 20
});

test('reloading the bare URL keeps you the editor (one fixed event — no fork)', async ({ page }) => {
  await page.goto(editorPath);
  await expect(page.locator('#navDraft')).toBeVisible();           // editor via #edit=secret
  // now drop the secret and reload — the persisted editor flag keeps the role
  await page.goto(viewerPath);
  await expect(page.locator('#navDraft')).toBeVisible();
  await expect(page.locator('#hdrRole')).toContainText(/live synced/i);
});
