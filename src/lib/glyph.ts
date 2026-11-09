import { hostOf } from './url';

/** Dlaždice bez obrázku: iniciály a barva odvozená z domény (stejná doména = stejná barva). */

export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

function ascii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, '');
}

/** Dvě písmena z jednoho slova: „youtube“ → YT, „nintendo-insider“ → NI, „speeddial2“ → S2. */
function fromWord(word: string): string {
  const w = ascii(word).replace(/[^A-Z0-9-]/g, '');
  if (!w) return '??';
  const parts = w.split('-').filter(Boolean);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  const digit = w.slice(1).match(/\d/);
  if (digit) return w[0] + digit[0];
  for (let i = 1; i < w.length; i++) {
    if (!VOWELS.has(w[i]) && w[i] !== w[0]) return w[0] + w[i];
  }
  return w.slice(0, 2).padEnd(2, w[0]);
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/** Popisky domény bez www/m a bez TLD (včetně co.uk apod.). */
export function domainLabels(host: string): string[] {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length > 1) labels.pop();
  if (labels.length > 1 && SECOND_LEVEL.has(labels[labels.length - 1])) labels.pop();
  while (labels.length > 1 && ['www', 'm'].includes(labels[0])) labels.shift();
  return labels;
}

/** Iniciály pro glyph dlaždici. */
export function glyphInitials(title: string, url: string): string {
  const t = title.trim();
  const hostLike = !/\s/.test(t) && t.includes('.');
  if (t && !hostLike && !/^https?:/i.test(t)) {
    const words = ascii(t).split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1) return fromWord(words[0]);
  }
  const labels = domainLabels(hostOf(url) || t.split('/')[0]);
  if (labels.length === 0) return '??';
  if (labels.length === 1) return fromWord(labels[0]);
  return (ascii(labels[0])[0] ?? '?') + (ascii(labels[labels.length - 1])[0] ?? '?');
}

/** Odstín barvy dlaždice (0 až 359) podle domény. */
export function glyphHue(url: string): number {
  return hash32(hostOf(url) || url) % 360;
}
