import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Smoke test web režimu: fixtura bez resolveru, panel nastavení, privacy, záloha tam
 * a zpět, restore points a odkaz na Google Disk. Jeden běh za sebou (sdílí úložiště).
 */

const SHOTS = resolve(process.cwd(), 'private/shots');
mkdirSync(SHOTS, { recursive: true });

/** Snímek až po doběhnutí animací (přeskupení mřížky, vysunutí panelu). */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
}
const tiles = (page: Page) => page.locator('[data-dial-id]');
const panel = (page: Page) => page.getByRole('dialog', { name: 'Nastavení' });

async function openSettings(page: Page, tab: string) {
  if (!(await panel(page).isVisible())) await page.getByRole('button', { name: 'Nastavení', exact: true }).click();
  await panel(page).getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
}

async function closeSettings(page: Page) {
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
}

test('web režim: nastavení, privacy, záloha, restore points, Google Disk', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0, 5).join(' | '));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text());
  });

  await test.step('fixtura bez resolveru', async () => {
    await page.goto('/newtab.html?wipe=1&seed=fixture&logos=0');
    await expect(tiles(page)).toHaveCount(8); // Domů
    await expect(page.getByRole('navigation', { name: 'Skupiny' }).getByRole('button')).toHaveCount(6); // 5 + „+“
    await shot(page, '01-mrizka');
  });

  await test.step('vzhled: motiv a písmo', async () => {
    await page.keyboard.press(',');
    await expect(panel(page)).toBeVisible();
    await shot(page, '02-nastaveni-vzhled');
    await panel(page).getByRole('radio', { name: 'světlý' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await panel(page).getByRole('radio', { name: 'strojové' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
    await shot(page, '03-svetly-strojove');
    await panel(page).getByRole('button', { name: /Výchozí hodnoty: vzhled/ }).click();
    // výchozí motiv je „podle systému“, Playwright běží v tmavém režimu
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  await test.step('mřížka: sloupce, zaoblení', async () => {
    await openSettings(page, 'mřížka');
    await panel(page).getByLabel('Sloupce').fill('6');
    await expect(page.locator('section.grid')).toHaveAttribute('style', /--cols: 6/);
    await panel(page).getByRole('radio', { name: 'velké' }).first().click();
    await shot(page, '04-nastaveni-mrizka');
  });

  await test.step('pozadí, chování, náhledy', async () => {
    await openSettings(page, 'vzhled');
    await panel(page).getByRole('radio', { name: 'obrázek' }).click();
    await expect(panel(page).getByText('Adresa obrázku')).toBeVisible();
    await shot(page, '05-nastaveni-pozadi');
    await panel(page).getByRole('radio', { name: 'barva motivu' }).click();

    await openSettings(page, 'chování');
    await panel(page).getByRole('switch', { name: /Soukromý režim/ }).click();
    await shot(page, '06-nastaveni-chovani');
    await openSettings(page, 'náhledy');
    await expect(panel(page).getByText(/Iniciály/)).toBeVisible();
    await shot(page, '07-nastaveni-nahledy');
    await closeSettings(page);
    await expect(tiles(page).first()).toHaveClass(/privacy/);
    await page.mouse.move(5, 5);
    await shot(page, '08-privacy');
  });

  let backupPath = '';
  await test.step('záloha do souboru', async () => {
    await openSettings(page, 'zálohy');
    await shot(page, '09-nastaveni-zalohy');
    const download = page.waitForEvent('download');
    await panel(page).getByRole('button', { name: /Stáhnout zálohu/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^zaloha-odkazu-\d{4}-\d{2}-\d{2}\.json$/);
    backupPath = resolve(process.cwd(), 'private/e2e-results', file.suggestedFilename());
    await file.saveAs(backupPath);
    const json = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(json.format).toBe('dial-operator-backup');
    expect(json.dials).toHaveLength(22);
    expect(json.groups).toHaveLength(5);
    expect(json.settings.behavior.privacy).toBe(true);
  });

  await test.step('restore point: vytvořit, smazat odkaz, obnovit, vrátit', async () => {
    await panel(page).getByRole('button', { name: 'Vytvořit teď' }).click();
    await expect(panel(page).getByText('ručně')).toBeVisible();
    await closeSettings(page);
    // smazat první odkaz klávesou Del nad dlaždicí
    await tiles(page).first().hover();
    await page.keyboard.press('Delete');
    await expect(tiles(page)).toHaveCount(7);
    await openSettings(page, 'zálohy');
    const row = panel(page).locator('li', { hasText: 'ručně' });
    await row.getByRole('button', { name: 'Obnovit', exact: true }).click();
    await row.getByRole('button', { name: 'Opravdu' }).click();
    await expect(tiles(page)).toHaveCount(8);
    await expect(panel(page).getByText('před obnovením')).toBeVisible();
    await shot(page, '10-restore-points');
  });

  await test.step('obnova zálohy ze souboru (NAHRADIT)', async () => {
    await closeSettings(page);
    // změna, kterou záloha přepíše: nová skupina
    await page.getByRole('button', { name: '+', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('textbox').fill('Dočasná');
    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByRole('navigation', { name: 'Skupiny' }).getByRole('button')).toHaveCount(7);

    await openSettings(page, 'zálohy');
    await panel(page).getByRole('button', { name: /Importovat ze souboru/ }).click();
    const wizard = page.getByRole('dialog');
    await wizard.locator('input[type=file]').setInputFiles(backupPath);
    await expect(wizard.getByText(/Záloha \(formát v1\)/)).toBeVisible();
    await wizard.getByRole('radio', { name: /Nahradit/ }).check();
    await shot(page, '11-import-zalohy');
    await wizard.getByRole('button', { name: 'Importovat', exact: true }).click();
    await expect(wizard.getByText(/Obnova hotová/)).toBeVisible();
    await wizard.getByRole('button', { name: 'Hotovo' }).click();
    await expect(page.getByRole('navigation', { name: 'Skupiny' }).getByRole('button')).toHaveCount(6);
  });

  await test.step('Google Disk: odkaz ve nastavení', async () => {
    await openSettings(page, 'sync');
    const input = panel(page).getByLabel('Odkaz na složku Google Disku');
    await input.fill('https://example.com/nic');
    await input.press('Enter');
    await expect(panel(page).getByText(/Tohle není odkaz na složku/)).toBeVisible();
    await input.fill('https://drive.google.com/drive/folders/TESTFOLDER_0123456789?usp=sharing');
    await input.press('Enter');
    await expect(panel(page).getByText('TESTFOLDER_0123456789')).toBeVisible();
    await shot(page, '12-nastaveni-sync');
  });

  await test.step('nastavení přežije reload', async () => {
    await page.reload();
    await expect(tiles(page).first()).toHaveClass(/privacy/);
    await expect(page.locator('section.grid')).toHaveAttribute('style', /--cols: 6/);
    await openSettings(page, 'sync');
    await expect(panel(page).getByText('TESTFOLDER_0123456789')).toBeVisible();
  });

  expect(errors).toEqual([]);
});
