import { describe, expect, it } from 'vitest';
import type { Dial } from '../src/lib/model';
import { createDial, createGroup, editDial, posForIndex, quickAdd } from '../src/lib/ops';
import { cleanTitle } from '../src/lib/titles';
import { keysBetween, sortByPos } from '../src/lib/order';

const NOW = 1_800_000_000_000;
const [k1, k2, k3] = keysBetween(null, null, 3);
const base = (id: string, groupId: string, pos: string, extra: Partial<Dial> = {}): Dial => ({
  id,
  groupId,
  title: id,
  url: `https://${id}.cz/`,
  pos,
  visits: 0,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const DIALS = [base('a', 'g1', k1), base('b', 'g1', k2), base('c', 'g1', k3), base('x', 'g2', k1)];

describe('createDial', () => {
  it('přidá na konec skupiny, titulek odvodí z URL', () => {
    const d = createDial(DIALS, { url: 'www.novinky.cz', groupId: 'g1' }, NOW, 'new')!;
    expect(d.url).toBe('https://www.novinky.cz/');
    expect(d.title).toBe('novinky.cz');
    expect(d.titleLocked).toBe(false);
    expect(sortByPos([...DIALS.filter((x) => x.groupId === 'g1'), d]).at(-1)!.id).toBe('new');
  });

  it('vlastní titulek se zamkne, neplatná URL vrátí null', () => {
    expect(createDial(DIALS, { url: 'https://x.cz', title: ' Moje ', groupId: 'g1' }, NOW, 'n')).toMatchObject({
      title: 'Moje',
      titleLocked: true,
    });
    expect(createDial(DIALS, { url: 'javascript:alert(1)', groupId: 'g1' }, NOW, 'n')).toBeNull();
  });
});

describe('editDial', () => {
  it('změna URL zahodí náhled a u nezamčeného titulku ho přepočítá', () => {
    const d = base('a', 'g1', k1, { thumb: { kind: 'logo', updatedAt: 1 }, title: 'a.cz' });
    const e = editDial(DIALS, d, { url: 'https://www.youtube.com' }, NOW)!;
    expect(e.thumb).toBeUndefined();
    expect(e.title).toBe('youtube.com');
  });

  it('zamčený titulek při změně URL zůstane', () => {
    const d = base('a', 'g1', k1, { title: 'Moje', titleLocked: true });
    expect(editDial(DIALS, d, { url: 'https://www.youtube.com' }, NOW)!.title).toBe('Moje');
  });

  it('prázdný titulek = odvodit z URL a odemknout', () => {
    const d = base('a', 'g1', k1, { title: 'Moje', titleLocked: true });
    expect(editDial(DIALS, d, { title: '  ' }, NOW)).toMatchObject({ title: 'a.cz', titleLocked: false });
  });

  it('přesun do jiné skupiny jde na konec', () => {
    const e = editDial(DIALS, DIALS[0], { groupId: 'g2' }, NOW)!;
    expect(e.groupId).toBe('g2');
    expect(e.pos > k1).toBe(true);
  });

  it('neplatná URL vrátí null', () => {
    expect(editDial(DIALS, DIALS[0], { url: 'ftp://x' }, NOW)).toBeNull();
  });
});

describe('posForIndex (přetahování)', () => {
  const g1 = sortByPos(DIALS.filter((d) => d.groupId === 'g1'));
  const order = (movingId: string, to: number) =>
    sortByPos(g1.map((d) => (d.id === movingId ? { ...d, pos: posForIndex(g1, movingId, to) } : d))).map((d) => d.id);

  it('přesune na začátek, doprostřed i na konec', () => {
    expect(order('c', 0)).toEqual(['c', 'a', 'b']);
    expect(order('a', 1)).toEqual(['b', 'a', 'c']);
    expect(order('a', 2)).toEqual(['b', 'c', 'a']);
    expect(order('b', 99)).toEqual(['a', 'c', 'b']);
  });
});

describe('createGroup', () => {
  it('nová skupina na konci, prázdný název odmítne', () => {
    const groups = [{ id: 'g1', title: 'Home', pos: k1, createdAt: 1, updatedAt: 1 }];
    const g = createGroup(groups, ' Nová ', NOW, 'g9')!;
    expect(g.title).toBe('Nová');
    expect(g.pos > k1).toBe(true);
    expect(createGroup(groups, '   ', NOW, 'x')).toBeNull();
  });
});

describe('rychlé přidání zvenku (menu prohlížeče)', () => {
  const ids = () => {
    let n = 0;
    return () => `q-${++n}`;
  };

  it('do otevřené skupiny, titulek ze stránky', () => {
    const groups = [createGroup([], 'Home', 1, 'g1')!, { ...createGroup([], 'Práce', 1, 'g2')!, pos: 'a5' }];
    const r = quickAdd(groups, [], { url: 'https://novinky.cz', title: 'Novinky.cz', activeGroupId: 'g2' }, 10, ids());
    expect(r.dial).toMatchObject({ groupId: 'g2', title: 'Novinky.cz', titleLocked: true, url: 'https://novinky.cz/' });
    expect(r.dials).toHaveLength(1);
  });

  it('bez skupin založí Domů, titulek stejný jako adresa se odvodí', () => {
    const r = quickAdd([], [], { url: 'https://www.windy.com/', title: 'https://www.windy.com/' }, 10, ids());
    expect(r.groups.map((g) => g.title)).toEqual(['Domů']);
    expect(r.dial).toMatchObject({ groupId: r.groups[0].id, titleLocked: false });
    expect(r.dial?.title).toBe(cleanTitle('https://www.windy.com/'));
  });

  it('duplicitní adresu nepřidá, neplatnou taky ne', () => {
    const g = createGroup([], 'Home', 1, 'g1')!;
    const first = quickAdd([g], [], { url: 'https://idnes.cz' }, 10, ids());
    const again = quickAdd(first.groups, first.dials, { url: 'http://www.idnes.cz/' }, 11, ids());
    expect(again.dial).toBeNull();
    expect(again.duplicateOf?.id).toBe(first.dial?.id);
    expect(quickAdd([g], [], { url: 'chrome://extensions' }, 12, ids()).dial).toBeNull();
  });
});
