// Vykreslí ikony rozšíření do public/icons/ (16, 32, 48, 128 px) přes Playwright Chromium.
// Použití: node tools/make-icons.mjs (stačí po změně vzhledu ikony, PNG jsou v gitu).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });

function draw(s) {
  const c = document.createElement('canvas');
  c.id = 'c';
  c.width = s;
  c.height = s;
  document.body.replaceChildren(c);
  const g = c.getContext('2d');
  const r = s * 0.22;
  // modrý čtverec se zaoblenými rohy a čtyři bílé dlaždice (mřížka odkazů)
  g.fillStyle = '#2563eb';
  g.beginPath();
  g.roundRect(0, 0, s, s, r);
  g.fill();
  g.fillStyle = '#ffffff';
  const pad = s * 0.2;
  const gap = s * 0.1;
  const tile = (s - 2 * pad - gap) / 2;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    g.beginPath();
    g.roundRect(pad + x * (tile + gap), pad + y * (tile + gap), tile, tile, tile * 0.22);
    g.fill();
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body style="margin:0;background:transparent"></body>');
for (const size of [16, 32, 48, 128]) {
  await page.evaluate(draw, size);
  await page.locator('#c').screenshot({ path: `${out}icon-${size}.png`, omitBackground: true });
  console.log('icon', size);
}
await browser.close();
