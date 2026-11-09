import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Synchronizace mezi „počítači“ ve web režimu: každý počítač je samostatný kontext
 * prohlížeče (vlastní localStorage), sync úložiště je paměť dev serveru (`/__sync`).
 */

const BASE = 'http://127.0.0.1:5173';
const panel = (page: Page) => page.getByRole('dialog', { name: 'Nastavení' });
const tiles = (page: Page) => page.locator('[data-dial-id]');
const SLOW = { timeout: 15_000 };

async function device(browser: Browser, seed?: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE, colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(seed ? `/newtab.html?wipe=1&seed=${seed}&logos=0` : '/newtab.html?wipe=1');
  return page;
}

async function openSync(page: Page) {
  if (!(await panel(page).isVisible())) await page.getByRole('button', { name: 'Nastavení', exact: true }).click();
  await panel(page).getByRole('navigation').getByRole('button', { name: 'sync', exact: true }).click();
}

async function enableSync(page: Page) {
  await openSync(page);
  await panel(page).getByRole('switch', { name: /synchronizovat tento počítač/ }).click();
}

test('synchronizace: tři počítače přes dev server', async ({ browser, request }) => {
  await request.delete(`${BASE}/__sync`);

  // A: data z fixtury, zapne synchronizaci a nahraje je
  const a = await device(browser, 'fixture');
  await expect(tiles(a)).toHaveCount(8);
  await enableSync(a);
  await expect(panel(a).getByText(/Stav: OK/)).toBeVisible(SLOW);
  const remote = (await (await request.get(`${BASE}/__sync`)).json()) as { items: Record<string, unknown> };
  const keys = Object.keys(remote.items);
  expect(keys.filter((k) => k.startsWith('d.'))).toHaveLength(22);
  expect(keys.filter((k) => k.startsWith('g.'))).toHaveLength(5);
  expect(keys).toContain('meta');
  await a.keyboard.press('Escape');

  // B: prázdný počítač, po zapnutí převezme data
  const b = await device(browser);
  await expect(b.getByText('Zatím tu nic není')).toBeVisible();
  await enableSync(b);
  await b.keyboard.press('Escape');
  await expect(tiles(b)).toHaveCount(8, SLOW);
  await expect(b.locator('footer').getByText('Synchronizováno')).toBeVisible(SLOW);

  // A přejmenuje odkaz, B to uvidí
  await tiles(a).first().hover();
  await a.keyboard.press('e');
  await a.getByRole('dialog').getByLabel('Název').fill('Sync test');
  await a.getByRole('button', { name: 'Uložit' }).click();
  await expect(tiles(b).first()).toContainText('Sync test', SLOW);

  // B smaže odkaz, A ho ztratí
  await tiles(b).nth(1).hover();
  await b.keyboard.press('Delete');
  await expect(tiles(b)).toHaveCount(7);
  await expect(tiles(a)).toHaveCount(7, SLOW);

  // A změní motiv, B ho převezme
  await openSync(a);
  await panel(a).getByRole('navigation').getByRole('button', { name: 'vzhled', exact: true }).click();
  await panel(a).getByRole('radio', { name: 'světlý' }).click();
  await expect(b.locator('html')).toHaveAttribute('data-theme', 'light', SLOW);
  await a.keyboard.press('Escape');

  // C: vlastní import (jiná id) = kolize, musí rozhodnout člověk; převezme data ze synchronizace
  const c = await device(browser, 'fixture');
  await expect(tiles(c)).toHaveCount(8);
  await enableSync(c);
  await expect(panel(c).getByText(/Co s tím\?/)).toBeVisible(SLOW);
  await c.screenshot({ path: 'private/shots/20-sync-volba.png' });
  await panel(c).getByRole('button', { name: /Převzít data ze synchronizace/ }).click();
  await expect(panel(c).getByText(/Stav: OK/)).toBeVisible(SLOW);
  await c.keyboard.press('Escape');
  await expect(tiles(c)).toHaveCount(7, SLOW);
  await expect(tiles(c).first()).toContainText('Sync test');
  await expect(c.locator('html')).toHaveAttribute('data-theme', 'light');

  // C měl před převzetím vlastní data: jsou v restore pointu
  await c.getByRole('button', { name: 'Nastavení', exact: true }).click();
  await panel(c).getByRole('navigation').getByRole('button', { name: 'zálohy', exact: true }).click();
  await expect(panel(c).getByText('před převzetím synchronizace')).toBeVisible();
  await c.screenshot({ path: 'private/shots/21-sync-restore-point.png' });

  await openSync(b);
  await b.waitForTimeout(400);
  await b.screenshot({ path: 'private/shots/22-sync-nastaveni.png' });
});
