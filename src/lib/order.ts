import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Frakční řazení: každá položka má `pos` (řetězec). Mezi dvě položky jde vždy vložit
 * novou bez přečíslování ostatních, což se hodí pro pozdější sync.
 * Pozor: klíče se porovnávají obyčejným `<`, ne `localeCompare`.
 */

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function keyBetween(before: string | null | undefined, after: string | null | undefined): string {
  return generateKeyBetween(before ?? null, after ?? null);
}

export function keysBetween(before: string | null | undefined, after: string | null | undefined, n: number): string[] {
  return generateNKeysBetween(before ?? null, after ?? null, n);
}

export function sortByPos<T extends { pos: string; id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareKeys(a.pos, b.pos) || compareKeys(a.id, b.id));
}

/** Klíč za poslední položkou (pro přidání na konec). */
export function keyAfterLast(items: readonly { pos: string }[]): string {
  let last: string | null = null;
  for (const it of items) if (last === null || it.pos > last) last = it.pos;
  return keyBetween(last, null);
}
