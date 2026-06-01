const { test, expect, KO, editorPath, viewerPath, seedState, draftedState, finishedState } = require('./helpers');

const AFTER_REVEAL = new Date('2026-06-05T06:00:00Z');

test('interactive controls meet a comfortable touch-target size', async ({ page }) => {
  await seedState(page, draftedState());
  await page.goto(editorPath);

  // Draft: colour swatches + captain toggle
  await page.locator('.nav-btn[data-tab="draft"]').click();
  for (const sel of ['.colors button', '.cap-toggle']) {
    const bb = await page.locator(sel).first().boundingBox();
    expect(Math.min(bb.width, bb.height), `${sel} min side`).toBeGreaterThanOrEqual(38);
  }
  // bottom-nav buttons
  const nav = await page.locator('.nav-btn').first().boundingBox();
  expect(nav.height, 'nav button height').toBeGreaterThanOrEqual(40);

  // Result modal: place buttons + lineup chips (open a placement event)
  await page.locator('.nav-btn[data-tab="sched"]').click();
  await page.locator('.ev', { hasText: 'Mario Kart' }).click();
  for (const sel of ['.place-sel button', '.pchip']) {
    const bb = await page.locator(sel).first().boundingBox();
    expect(bb.height, `${sel} height`).toBeGreaterThanOrEqual(40);
  }
});

test('inputs are ≥16px so iOS Safari does not auto-zoom on focus', async ({ page }) => {
  await page.goto(editorPath);
  await page.locator('.nav-btn[data-tab="draft"]').click();
  const fontPx = await page.locator('.player-in input').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(16);
});

test('long names wrap cleanly — no clipping, no horizontal scroll', async ({ page }) => {
  const s = finishedState();
  s.teams[0].name = 'The Absolutely Unstoppable Mega Hammerhead Sharks of San Diego';
  s.teams[0].players[0].name = 'Maximilian-Bartholomew Featherstonehaugh III';
  await seedState(page, s);
  await page.goto(editorPath);

  const cn = page.locator('.champ .cn');                       // champion screen, long name
  await expect(cn).toBeVisible();
  expect(await cn.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  await page.locator('.nav-btn[data-tab="scores"]').click();
  const tn = page.locator('.rank', { hasText: 'Sharks' }).locator('.tn');
  expect(await tn.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  for (const tab of ['now', 'sched', 'scores', 'draft']) {
    await page.locator(`.nav-btn[data-tab="${tab}"]`).click();
    const noHScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(noHScroll, `no horizontal scroll on ${tab}`).toBe(true);
  }
});

test('safe-area insets are wired into the sticky chrome', async ({ page }) => {
  await page.goto(editorPath);
  // The emulator reports 0 insets, but the calc() must be present so notched devices get padding.
  const headerUsesInset = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (r.selectorText === '.head-in' && /safe-area-inset-top/.test(r.style.padding || r.cssText)) return true;
      }
    }
    return false;
  });
  expect(headerUsesInset, '.head-in honours safe-area-inset-top').toBe(true);
});

test('editor opens a fresh room (Firebase dropped empty results) without going blank', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const s = KO.defaultState();
  delete s.results;                          // Firebase persists no key for an empty {}
  await seedState(page, s);
  await page.goto(editorPath);
  await expect(page.getByRole('button', { name: /open the draft/i })).toBeVisible(); // not blank
  expect(errors, 'no uncaught errors on a fresh room').toEqual([]);
});

test('empty state: viewer arriving before the commissioner sets up', async ({ page }) => {
  await page.clock.install({ time: AFTER_REVEAL });            // past reveal, but room is empty
  await page.goto(viewerPath);
  await expect(page.locator('#view-now')).toContainText(/setting the stage/i);
});

test('error state: viewer cannot reach the live server', async ({ page }) => {
  await page.clock.install({ time: AFTER_REVEAL });
  await page.addInitScript(() => { window.__FBMOCK_START_OFFLINE = true; });
  await page.goto(viewerPath);
  await expect(page.locator('#view-now')).toContainText(/can.{0,3}t reach the scoreboard/i);
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
});

test('zero console errors across a fully-populated viewer session', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.clock.install({ time: AFTER_REVEAL });
  await seedState(page, finishedState());
  await page.goto(viewerPath);
  for (const tab of ['now', 'sched', 'scores']) await page.locator(`.nav-btn[data-tab="${tab}"]`).click();
  expect(errors, 'no console/page errors').toEqual([]);
});
