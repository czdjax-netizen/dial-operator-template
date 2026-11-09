import { describe, expect, it } from 'vitest';
import type { Dial } from '../src/lib/model';
import { SCHEMA_VERSION, defaultSettings, mergeSettings } from '../src/lib/model';
import { keysBetween } from '../src/lib/order';
import { fold, migrate, orderDials, searchDials } from '../src/lib/state-utils';

const [k1, k2, k3] = keysBetween(null, null, 3);
const dial = (id: string, title: string, url: string, pos: string, visits: number, createdAt: number): Dial => ({
  id,
  groupId: 'g',
  title,
  url,
  pos,
  visits,
  createdAt,
  updatedAt: createdAt,
});
const DIALS = [
  dial('a', 'novinky.cz', 'http://www.novinky.cz', k2, 10, 3),
  dial('b', 'Počasí radar', 'https://radar.bourky.cz', k1, 500, 1),
  dial('c', 'youtube.com', 'http://www.youtube.com', k3, 50, 2),
];

describe('migrate', () => {
  it('z prázdného úložiště vyrobí výchozí stav s meta', () => {
    const s = migrate({}, 1000);
    expect(s.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.meta.deviceId).toMatch(/[0-9a-f-]{36}/);
    expect(s.groups).toEqual([]);
    expect(s.settings).toEqual(defaultSettings());
    expect(s.ui.activeGroupId).toBeNull();
  });

  it('doplní chybějící nastavení a zachová uložené', () => {
    const s = migrate({ settings: { layout: { columns: 6 } } as never });
    expect(s.settings.layout.columns).toBe(6);
    expect(s.settings.layout.maxWidth).toBe(defaultSettings().layout.maxWidth);
  });
});

describe('mergeSettings', () => {
  it('ignoruje undefined a neznámé klíče, background bere i nové', () => {
    const m = mergeSettings(defaultSettings(), {
      fontScale: undefined,
      layout: { columns: 5, bogus: 1 } as never,
      background: { imageUrl: 'https://example.com/x.jpg' },
    });
    expect(m.fontScale).toBe(1);
    expect(m.layout.columns).toBe(5);
    expect((m.layout as unknown as Record<string, unknown>).bogus).toBeUndefined();
    expect(m.background.imageUrl).toBe('https://example.com/x.jpg');
  });
});

describe('orderDials', () => {
  it.each([
    ['manual', ['b', 'a', 'c']],
    ['visits', ['b', 'c', 'a']],
    ['title', ['a', 'b', 'c']],
    ['created', ['a', 'c', 'b']],
  ] as const)('%s', (orderBy, ids) => {
    expect(orderDials(DIALS, orderBy).map((d) => d.id)).toEqual(ids);
  });
});

describe('hledání', () => {
  it('fold odstraní diakritiku', () => {
    expect(fold('Počasí ČR')).toBe('pocasi cr');
  });

  it('najde bez diakritiky, v URL i titulku, víc slov = AND', () => {
    expect(searchDials(DIALS, 'pocasi').map((d) => d.id)).toEqual(['b']);
    expect(searchDials(DIALS, 'bourky').map((d) => d.id)).toEqual(['b']);
    expect(searchDials(DIALS, 'radar pocasi').map((d) => d.id)).toEqual(['b']);
    expect(searchDials(DIALS, 'xyz')).toEqual([]);
    expect(searchDials(DIALS, '   ')).toEqual([]);
  });

  it('začátek titulku má přednost', () => {
    expect(searchDials(DIALS, 'y').map((d) => d.id)[0]).toBe('c');
  });
});
