import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sd2Export } from '../src/lib/import/sd2';

/** Vitest běží z kořene projektu (happy-dom mění import.meta.url, proto cwd). */
export function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
}

export const fixture = () => loadJson<Sd2Export>('fixtures/sd2-sample.json');

/** Deterministická id pro testy. */
export function seqIds(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}
