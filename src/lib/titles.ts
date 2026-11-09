import { hostOf, hostWithoutGenericTld, safeUrl } from './url';

/**
 * Úklid titulků. SD2 u většiny odkazů vyrobil titulek strojově z URL
 * („Windy ?49.800,15.500,5“, „Chmi.cz files/portal/…“, „http://mestske.noviny.cz/“).
 * Ty se dají nahradit čitelnějším tvarem „host/cesta“. Titulky od člověka
 * („Member cam 1“) se nechají být.
 */

const GENERIC_SEGMENTS = /^(home|index|default)(\.(html?|php|aspx?))?$/i;
const ID_LIKE = /^(\d{6,}|[A-Za-z0-9_-]{20,})$/;
const MAX_LEN = 34;

export function isMachineTitle(title: string, url: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (t === url.trim()) return true;
  if (/^(https?:\/\/|www\.)/i.test(t)) return true;
  const host = hostOf(url);
  if (!host) return false;
  const first = t.split(/\s+/)[0].toLowerCase().replace(/:\d+$/, '');
  return first === host || first === hostWithoutGenericTld(host);
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Čitelný titulek z URL: host bez www + nejvýš dva smysluplné segmenty cesty. */
export function cleanTitle(url: string): string {
  const u = safeUrl(url);
  if (!u) return url.trim();
  const host = hostOf(url);
  const segments = u.pathname
    .split('/')
    .filter(Boolean)
    .map(decode)
    .filter((s) => !GENERIC_SEGMENTS.test(s) && !ID_LIKE.test(s))
    .map((s) => s.replace(/\.(html?|php|aspx?)$/i, ''))
    .slice(0, 2);
  let out = segments.length ? `${host}/${segments.join('/')}` : host;
  if (out.length > MAX_LEN) out = `${out.slice(0, MAX_LEN - 1)}…`;
  return out;
}

/** Titulek po importu: strojový se uklidí, lidský zůstane. */
export function tidyTitle(title: string, url: string): { title: string; changed: boolean } {
  if (!isMachineTitle(title, url)) return { title: title.trim(), changed: false };
  const cleaned = cleanTitle(url);
  return { title: cleaned, changed: cleaned !== title.trim() };
}
