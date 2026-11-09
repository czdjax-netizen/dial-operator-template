/** Práce s URL: bezpečné parsování, hostname a normalizace pro hledání duplicit. */

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src)$/i;

/** Doplní schéma, povolí jen http(s). Vrací null pro nesmysly a `javascript:` apod. */
export function safeUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

/** Hostname bez `www.` (a bez `m.`), malými písmeny. */
export function hostOf(url: string): string {
  const u = safeUrl(url);
  if (!u) return '';
  return u.hostname.toLowerCase().replace(/^(www\d?|m)\./, '');
}

export function originOf(url: string): string {
  const u = safeUrl(url);
  return u ? u.origin : '';
}

/**
 * Klíč pro porovnání duplicit: bez schématu, www, koncového lomítka, kotvy
 * a sledovacích parametrů.
 */
export function normalizeUrl(url: string): string {
  const u = safeUrl(url);
  if (!u) return url.trim().toLowerCase();
  const host = u.hostname.toLowerCase().replace(/^www\d?\./, '');
  const port = u.port && !['80', '443'].includes(u.port) ? `:${u.port}` : '';
  let path = u.pathname.replace(/\/+$/, '');
  path = path.replace(/\/index\.(html?|php)$/i, '');
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return `${host}${port}${path}${query}`;
}

/** Odstraní z hostu `www.` a obecnou TLD (.com/.net/.org), jak to dělá SD2 ve svých titulcích. */
export function hostWithoutGenericTld(host: string): string {
  return host.replace(/\.(com|net|org|info)$/i, '');
}
