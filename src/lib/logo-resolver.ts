import type { Platform } from './platform';
import { hostOf, safeUrl } from './url';

/**
 * Resolver log (náhrada za mrtvý logo.clearbit.com):
 * 1. HTML stránky → apple-touch-icon, link rel=icon se sizes, ikony z manifestu.
 * 2. Odhad `/apple-touch-icon.png`.
 * 3. Google favicon služba (sz=256).
 * Vezme největší zhruba čtvercovou ikonu od 96 px a převede ji na WebP 256 px.
 * Běží ve stránce (potřebuje DOMParser a canvas), ne v service workeru.
 */

export type CandidateSource = 'apple-touch' | 'manifest' | 'icon' | 'guess' | 'favicon-service';

export interface IconCandidate {
  url: string;
  /** Deklarovaná velikost (delší strana), 0 = neznámá. SVG = 512. */
  size: number;
  source: CandidateSource;
  type?: string;
}

export const MIN_LOGO = 96;
export const THUMB_SIZE = 256;
const SVG_SIZE = 512;
const SOURCE_RANK: Record<CandidateSource, number> = {
  'apple-touch': 0,
  manifest: 1,
  icon: 2,
  guess: 3,
  'favicon-service': 4,
};

function absolute(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function isSvg(type: string | null | undefined, url: string): boolean {
  return (type ?? '').includes('svg') || /\.svg(\?|#|$)/i.test(url);
}

/** "16x16 32x32" → 32, "any" → 512 (SVG), "" → 0. */
export function parseSizes(sizes: string | null | undefined): number {
  if (!sizes) return 0;
  let max = 0;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') max = Math.max(max, SVG_SIZE);
    const m = token.match(/^(\d+)x(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]), Number(m[2]));
  }
  return max;
}

export interface PageInfo {
  candidates: IconCandidate[];
  manifestUrl?: string;
  title?: string;
}

export function extractCandidates(html: string, pageUrl: string): PageInfo {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = absolute(doc.querySelector('base[href]')?.getAttribute('href'), pageUrl) ?? pageUrl;
  const candidates: IconCandidate[] = [];
  let manifestUrl: string | undefined;
  for (const link of Array.from(doc.querySelectorAll('link[rel][href]'))) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    const href = absolute(link.getAttribute('href'), base);
    if (!href) continue;
    const type = link.getAttribute('type') ?? undefined;
    const declared = parseSizes(link.getAttribute('sizes'));
    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) {
      candidates.push({ url: href, size: declared || 180, source: 'apple-touch', type });
    } else if (rel.includes('icon')) {
      candidates.push({ url: href, size: declared || (isSvg(type, href) ? SVG_SIZE : 0), source: 'icon', type });
    } else if (rel.includes('manifest') && !manifestUrl) {
      manifestUrl = href;
    }
  }
  const title = doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
  return { candidates, manifestUrl, title };
}

export function parseManifestIcons(json: unknown, manifestUrl: string): IconCandidate[] {
  const icons = (json as { icons?: unknown })?.icons;
  if (!Array.isArray(icons)) return [];
  const out: IconCandidate[] = [];
  for (const icon of icons) {
    const i = icon as { src?: string; sizes?: string; type?: string; purpose?: string };
    if ((i.purpose ?? '').includes('monochrome')) continue;
    const url = absolute(i.src, manifestUrl);
    if (!url) continue;
    out.push({ url, size: parseSizes(i.sizes) || (isSvg(i.type, url) ? SVG_SIZE : 0), source: 'manifest', type: i.type });
  }
  return out;
}

/** Odstraní duplicity a seřadí: největší napřed, při shodě podle zdroje. */
export function rankCandidates(list: readonly IconCandidate[]): IconCandidate[] {
  const best = new Map<string, IconCandidate>();
  for (const c of list) {
    const prev = best.get(c.url);
    if (!prev || c.size > prev.size || SOURCE_RANK[c.source] < SOURCE_RANK[prev.source]) best.set(c.url, c);
  }
  return [...best.values()].sort((a, b) => b.size - a.size || SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
}

export function faviconServiceUrl(pageUrl: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(pageUrl))}&sz=256`;
}

// ---------------------------------------------------------------- obrázky

interface Decoded {
  width: number;
  height: number;
  source: CanvasImageSource;
  close(): void;
}

function looksLikeSvg(contentType: string, url: string, head: string): boolean {
  return contentType.includes('svg') || isSvg(null, url) || /^\s*(<\?xml|<svg)/i.test(head);
}

async function decode(blob: Blob, contentType: string, url: string): Promise<Decoded | null> {
  const head = await blob.slice(0, 256).text();
  if (/^\s*<(!doctype|html)/i.test(head)) return null; // místo obrázku přišla HTML stránka
  if (!looksLikeSvg(contentType, url, head)) {
    try {
      const bmp = await createImageBitmap(blob);
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
    } catch {
      // ICO a spol. zkusí ještě <img>
    }
  }
  const typed = looksLikeSvg(contentType, url, head) ? new Blob([blob], { type: 'image/svg+xml' }) : blob;
  const objectUrl = URL.createObjectURL(typed);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    await img.decode();
    const svg = typed.type === 'image/svg+xml';
    const w = img.naturalWidth || (svg ? SVG_SIZE : 0);
    const h = img.naturalHeight || (svg ? SVG_SIZE : 0);
    if (!w || !h) return null;
    // SVG se dá vykreslit v libovolné velikosti
    const scale = svg ? SVG_SIZE / Math.max(w, h) : 1;
    return {
      width: Math.round(w * scale),
      height: Math.round(h * scale),
      source: img,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

function isAcceptableLogo(d: Decoded): boolean {
  const ratio = d.width / d.height;
  return Math.min(d.width, d.height) >= MIN_LOGO && ratio > 0.75 && ratio < 1.34;
}

/** Vykreslí obrázek „contain“ do čtverce a vrátí WebP. */
async function toWebp(d: Decoded, size = THUMB_SIZE): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.min(size / d.width, size / d.height);
  const w = d.width * scale;
  const h = d.height * scale;
  ctx.drawImage(d.source, (size - w) / 2, (size - h) / 2, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.9),
  );
}

export interface ResolveOk {
  ok: true;
  blob: Blob;
  source: string;
  via: CandidateSource | 'direct';
  width: number;
  /** Zhruba čtvercový obrázek (zobrazí se jako logo, jinak přes celou dlaždici). */
  square: boolean;
  pageTitle?: string;
}

export interface ResolveFail {
  ok: false;
  reason: string;
  pageTitle?: string;
}

export type ResolveResult = ResolveOk | ResolveFail;

async function tryImage(
  platform: Platform,
  url: string,
  accept: (d: Decoded) => boolean,
): Promise<{ blob: Blob; width: number; square: boolean } | null> {
  const res = await platform.fetchBlob(url, 8000);
  if (!res || res.blob.size === 0) return null;
  const d = await decode(res.blob, res.contentType, res.url);
  if (!d) return null;
  try {
    if (!accept(d)) return null;
    const ratio = d.width / d.height;
    return { blob: await toWebp(d), width: Math.min(d.width, d.height), square: ratio > 0.75 && ratio < 1.34 };
  } finally {
    d.close();
  }
}

/** Obrázek zadaný přímo (např. živý `thumbnail` ze SD2). Bere i nečtvercové od 64 px. */
export async function resolveImage(platform: Platform, imageUrl: string): Promise<ResolveResult> {
  const r = await tryImage(platform, imageUrl, (d) => Math.min(d.width, d.height) >= 64);
  return r
    ? { ok: true, blob: r.blob, source: imageUrl, via: 'direct', width: r.width, square: r.square }
    : { ok: false, reason: 'image unusable' };
}

export async function resolveLogo(platform: Platform, pageUrl: string, maxAttempts = 6): Promise<ResolveResult> {
  const page = safeUrl(pageUrl);
  if (!page) return { ok: false, reason: 'bad url' };
  const candidates: IconCandidate[] = [];
  let pageTitle: string | undefined;
  let origin = page.origin;

  const html = await platform.fetchText(page.href, 8000);
  if (html && /html|xml|text\/plain|^$/.test(html.contentType)) {
    const info = extractCandidates(html.text, html.url);
    pageTitle = info.title;
    candidates.push(...info.candidates);
    origin = safeUrl(html.url)?.origin ?? origin;
    if (info.manifestUrl) {
      const manifest = await platform.fetchText(info.manifestUrl, 5000);
      if (manifest) {
        try {
          candidates.push(...parseManifestIcons(JSON.parse(manifest.text), manifest.url));
        } catch {
          // neplatný manifest ignorujeme
        }
      }
    }
  }
  candidates.push({ url: `${origin}/apple-touch-icon.png`, size: 180, source: 'guess' });

  let attempts = 0;
  for (const c of rankCandidates(candidates)) {
    if (c.size > 0 && c.size < MIN_LOGO) continue;
    if (attempts++ >= maxAttempts) break;
    const r = await tryImage(platform, c.url, isAcceptableLogo);
    if (r) return { ok: true, blob: r.blob, source: c.url, via: c.source, width: r.width, square: true, pageTitle };
  }

  const fav = await tryImage(platform, faviconServiceUrl(page.href), isAcceptableLogo);
  if (fav) {
    return { ok: true, blob: fav.blob, source: 'google-favicon', via: 'favicon-service', width: fav.width, square: true, pageTitle };
  }

  return { ok: false, reason: html ? 'no usable icon' : 'page unreachable', pageTitle };
}

/** Jednoduchý pool se souběhem `concurrency`. */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
}
