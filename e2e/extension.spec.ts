import { chromium, expect, test, type Page, type Worker } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Rozšíření z `dist/` v Chromiu z Playwrightu (bez okna). Značkový Chrome od verze 137
 * --load-extension ignoruje, proto Chromium. Před během `npm run build` (dělá to `npm run e2e`).
 */

// EXT_DIR: jiná složka s rozšířením, třeba rozbalený zip z npm run zip
const DIST = resolve(process.env.EXT_DIR ?? resolve(process.cwd(), 'dist'));
const SHOTS = resolve(process.cwd(), 'private/shots');

/** Id rozšíření z klíče v manifestu (stejný výpočet jako tools/extension-id.mjs). */
function expectedId(): string {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.json'), 'utf8')) as { key: string };
  const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((ch) => String.fromCharCode(97 + parseInt(ch, 16))).join('');
}

test.skip(!existsSync(resolve(DIST, 'manifest.json')), 'Chybí dist/, nejdřív npm run build');

test('rozšíření: nová záložka, import, menu prohlížeče, popup, chrome.storage.sync', async () => {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const errors: string[] = [];
  const watch = (p: Page) => p.on('pageerror', (e) => errors.push(e.message));

  try {
    let sw: Worker | undefined = ctx.serviceWorkers()[0];
    sw ??= await ctx.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    expect(id).toBe(expectedId());

    const page = await ctx.newPage();
    watch(page);
    await page.goto(`chrome-extension://${id}/newtab.html`);
    await expect(page.getByText('Zatím tu nic není')).toBeVisible();

    await test.step('import fixtury přes wizard (bez log)', async () => {
      await page.getByRole('button', { name: 'Importovat' }).first().click();
      const wizard = page.getByRole('dialog');
      await wizard.locator('input[type=file]').setInputFiles(resolve(process.cwd(), 'fixtures/sd2-sample.json'));
      await wizard.getByRole('checkbox', { name: /Najít loga/ }).uncheck();
      await wizard.getByRole('button', { name: 'Importovat', exact: true }).click();
      await expect(wizard.getByText(/Import hotový/)).toBeVisible();
      await wizard.getByRole('button', { name: 'Hotovo' }).click();
      await expect(page.locator('[data-dial-id]')).toHaveCount(8);
      const stored = await page.evaluate(async () => ((await chrome.storage.local.get('dials')).dials as unknown[]).length);
      expect(stored).toBe(22);
    });

    await test.step('menu prohlížeče: přidat stránku (přes service worker)', async () => {
      const add = (url: string) =>
        sw!.evaluate(
          ([u]) => (globalThis as unknown as { addFromBrowserForTests: (u: string, t: string) => Promise<string> }).addFromBrowserForTests(u, 'Example'),
          [url],
        );
      expect(await add('https://example.com/')).toBe('added');
      await expect(page.locator('[data-dial-id]')).toHaveCount(9);
      expect(await add('http://www.example.com')).toBe('duplicate');
    });

    await test.step('popup: přidat aktuální stránku', async () => {
      const pop = await ctx.newPage();
      watch(pop);
      await pop.setViewportSize({ width: 400, height: 380 });
      await pop.goto(`chrome-extension://${id}/popup.html?url=${encodeURIComponent('https://www.wikipedia.org/')}&title=Wikipedie`);
      await expect(pop.getByRole('textbox').first()).toHaveValue('https://www.wikipedia.org/');
      await pop.screenshot({ path: resolve(SHOTS, '30-popup.png') });
      await pop.getByRole('button', { name: 'Přidat', exact: true }).click();
      await expect(pop.getByText(/Přidáno do skupiny Domů/)).toBeVisible();
      await expect(page.locator('[data-dial-id]')).toHaveCount(10);
    });

    await test.step('synchronizace přes chrome.storage.sync', async () => {
      await page.getByRole('button', { name: 'Nastavení', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Nastavení' });
      await panel.getByRole('navigation').getByRole('button', { name: 'sync', exact: true }).click();
      await panel.getByRole('switch', { name: /synchronizovat tento počítač/ }).click();
      await expect(panel.getByText(/Stav: OK/)).toBeVisible({ timeout: 15_000 });
      const keys = await page.evaluate(async () => Object.keys(await chrome.storage.sync.get(null)));
      expect(keys.filter((k) => k.startsWith('d.'))).toHaveLength(24);
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(SHOTS, '31-rozsireni-sync.png') });
      await page.keyboard.press('Escape');
    });

    await page.screenshot({ path: resolve(SHOTS, '32-rozsireni-mrizka.png') });
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});
