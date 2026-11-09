import { describe, expect, it } from 'vitest';
import { compareKeys, keyAfterLast, keyBetween, keysBetween, sortByPos } from '../src/lib/order';

describe('order (frakční indexy)', () => {
  it('vloží klíč mezi dva a zachová pořadí', () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);
    expect(a < b && b < c).toBe(true);
  });

  it('vyrobí n rostoucích klíčů', () => {
    const keys = keysBetween(null, null, 50);
    expect(keys).toHaveLength(50);
    for (let i = 1; i < keys.length; i++) expect(compareKeys(keys[i - 1], keys[i])).toBe(-1);
  });

  it('sortByPos řadí obyčejným porovnáním řetězců', () => {
    const [k1, k2, k3] = keysBetween(null, null, 3);
    const sorted = sortByPos([
      { id: 'c', pos: k3 },
      { id: 'a', pos: k1 },
      { id: 'b', pos: k2 },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('keyAfterLast přidá na konec', () => {
    const items = keysBetween(null, null, 3).map((pos, i) => ({ id: String(i), pos }));
    const k = keyAfterLast(items);
    expect(items.every((x) => x.pos < k)).toBe(true);
  });
});
