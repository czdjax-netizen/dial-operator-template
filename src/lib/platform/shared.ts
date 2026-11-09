import type { BlobResponse, FetchMeta, TextResponse } from './types';

/** Společné kousky obou platforem (fetch s časovým limitem, stažení souboru). */

export async function timedFetch(target: string, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs + 1000);
  try {
    return await fetch(target, { signal: ctrl.signal, credentials: 'omit' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Stav odpovědi. Dev proxy posílá skutečný stav a výslednou URL v hlavičkách. */
export function metaOf(res: Response, requested: string): FetchMeta {
  const upstream = Number(res.headers.get('x-upstream-status') ?? res.status);
  return {
    ok: upstream >= 200 && upstream < 300,
    status: upstream,
    url: res.headers.get('x-final-url') || res.url || requested,
    contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
  };
}

export async function readText(res: Response | null, url: string): Promise<TextResponse | null> {
  if (!res) return null;
  const meta = metaOf(res, url);
  if (!meta.ok) return null;
  return { ...meta, text: await res.text() };
}

export async function readBlob(res: Response | null, url: string): Promise<BlobResponse | null> {
  if (!res) return null;
  const meta = metaOf(res, url);
  if (!meta.ok) return null;
  return { ...meta, blob: await res.blob() };
}

/** Stažení souboru přes dočasný odkaz (funguje na webu i ve stránce rozšíření). */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Jednoznačné id stránky pro rozpoznání vlastních zápisů do úložiště. */
export const PAGE_ID = Math.random().toString(36).slice(2, 10);
