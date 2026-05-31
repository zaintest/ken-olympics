const { test, expect, editorPath, viewerPath } = require('./helpers');

test('harness: serves the app and injects the Firebase mock (no real CDN)', async ({ page }) => {
  await page.goto(editorPath);
  const mock = await page.evaluate(() => !!(window.firebase && window.firebase.__mock));
  expect(mock).toBe(true);
});

test('editor link → commissioner UI (Draft tab + live-synced header)', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(editorPath);
  await expect(page.locator('#navDraft')).toBeVisible();
  await expect(page.locator('#hdrRole')).toContainText(/live synced/i);
  expect(errors, 'no console/page errors on editor boot').toEqual([]);
});

test('viewer link before kickoff → sealed countdown, no Draft tab', async ({ page }) => {
  await page.goto(viewerPath);
  await expect(page.locator('.lock-title')).toBeVisible();           // countdown screen
  await expect(page.locator('#view-lock')).toContainText(/sealed until kickoff/i);
  await expect(page.locator('#navDraft')).toBeHidden();
});
