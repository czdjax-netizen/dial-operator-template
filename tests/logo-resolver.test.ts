import { describe, expect, it } from 'vitest';
import {
  extractCandidates,
  faviconServiceUrl,
  parseManifestIcons,
  parseSizes,
  rankCandidates,
  runPool,
} from '../src/lib/logo-resolver';

const HTML = `<!doctype html><html><head>
<base href="/sub/">
<title>  Test
  Site </title>
<link rel="icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="fav32.png">
<link rel="apple-touch-icon" href="/apple.png">
<link rel="apple-touch-icon" sizes="152x152" href="https://cdn.example.net/a152.png">
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<link rel="manifest" href="/site.webmanifest">
<link rel="mask-icon" href="/mask.svg">
</head><body></body></html>`;

describe('logo resolver', () => {
  it('parseSizes', () => {
    expect(parseSizes('16x16 32x32')).toBe(32);
    expect(parseSizes('any')).toBe(512);
    expect(parseSizes('')).toBe(0);
    expect(parseSizes(null)).toBe(0);
  });

  it('vytáhne kandidáty, manifest a titulek, respektuje <base>', () => {
    const info = extractCandidates(HTML, 'https://example.com/page');
    expect(info.title).toBe('Test Site');
    expect(info.manifestUrl).toBe('https://example.com/site.webmanifest');
    expect(info.candidates.map((c) => c.url)).toEqual([
      'https://example.com/favicon.ico',
      'https://example.com/sub/fav32.png',
      'https://example.com/apple.png',
      'https://cdn.example.net/a152.png',
      'https://example.com/logo.svg',
    ]);
  });

  it('seřadí největší napřed, SVG jako 512', () => {
    const ranked = rankCandidates(extractCandidates(HTML, 'https://example.com/page').candidates);
    expect(ranked.map((c) => [c.source, c.size])).toEqual([
      ['icon', 512],
      ['apple-touch', 180],
      ['apple-touch', 152],
      ['icon', 32],
      ['icon', 0],
    ]);
  });

  it('ikony z manifestu bez monochrome', () => {
    const icons = parseManifestIcons(
      {
        icons: [
          { src: '/i/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'i/512.png', sizes: '512x512', purpose: 'maskable' },
          { src: '/mono.png', sizes: '512x512', purpose: 'monochrome' },
        ],
      },
      'https://example.com/app/site.webmanifest',
    );
    expect(icons.map((i) => [i.url, i.size])).toEqual([
      ['https://example.com/i/192.png', 192],
      ['https://example.com/app/i/512.png', 512],
    ]);
    expect(parseManifestIcons({}, 'https://x.cz/m.json')).toEqual([]);
  });

  it('favicon služba podle hostu', () => {
    expect(faviconServiceUrl('http://www.novinky.cz/x')).toBe('https://www.google.com/s2/favicons?domain=novinky.cz&sz=256');
  });

  it('runPool dodrží souběh a zpracuje vše', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      done.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
