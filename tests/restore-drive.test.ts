import { describe, expect, it } from 'vitest';
import { parseDriveFolderId } from '../src/lib/drive';
import type { Dial, Group } from '../src/lib/model';
import { defaultSettings, mergeSettings } from '../src/lib/model';
import { makeSnapshot, restoreFromSnapshot, snapshotCounts, snapshotLabel } from '../src/lib/snapshots';

const T0 = 1_700_000_000_000;
const g = (id: string, title: string, extra: Partial<Group> = {}): Group => ({
  id,
  title,
  pos: 'a0',
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const d = (id: string, title: string, extra: Partial<Dial> = {}): Dial => ({
  id,
  groupId: 'g1',
  title,
  url: `https://${id}.cz/`,
  pos: 'a0',
  visits: 1,
  visitsByDaypart: { morning: 1, afternoon: 0, evening: 0, night: 0 },
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

describe('obnova restore pointu', () => {
  const snap = makeSnapshot([g('g1', 'Home')], [d('a', 'A'), d('b', 'B'), d('c', 'C', { deletedAt: T0 })], 'daily', T0);

  it('vrátí změněné, obnoví smazané a smaže nové; nezměněné nechá být', () => {
    const now = T0 + 1000;
    const current = {
      groups: [g('g1', 'Home')],
      dials: [
        // stejné jako ve snapshotu, jen jiné pořadí klíčů a updatedAt
        { ...d('a', 'A'), updatedAt: T0 + 5 },
        d('b', 'B přejmenované', { updatedAt: T0 + 7 }),
        d('c', 'C', { updatedAt: T0 }),
        d('n', 'nový', { createdAt: T0 + 500, updatedAt: T0 + 500 }),
      ],
    };
    // smazané až po snapshotu
    current.dials[2] = { ...current.dials[2] };
    const r = restoreFromSnapshot(current, snap, now);
    const by = new Map(r.dials.map((x) => [x.id, x]));
    expect(by.get('a')?.updatedAt).toBe(T0 + 5);
    expect(by.get('b')).toMatchObject({ title: 'B', updatedAt: now });
    expect(by.get('n')).toMatchObject({ deletedAt: now, updatedAt: now });
    expect(by.get('c')?.deletedAt).toBe(T0);
  });

  it('odkaz smazaný po snapshotu se vrátí', () => {
    const current = { groups: [g('g1', 'Home')], dials: [d('a', 'A', { deletedAt: T0 + 9, updatedAt: T0 + 9 }), d('b', 'B')] };
    const r = restoreFromSnapshot(current, snap, T0 + 20);
    const a = r.dials.find((x) => x.id === 'a')!;
    expect(a.deletedAt).toBeUndefined();
    expect(a.updatedAt).toBe(T0 + 20);
    // c ve snapshotu je, v současném stavu ne: vrátí se taky (smazaný)
    expect(r.dials.find((x) => x.id === 'c')?.deletedAt).toBe(T0);
  });

  it('popisky a počty', () => {
    expect(snapshotLabel('daily')).toBe('denní');
    expect(snapshotLabel('import-replace')).toContain('importem');
    expect(snapshotLabel('dev-seed-real')).toBe('vývoj (real)');
    expect(snapshotLabel('neznámý')).toBe('neznámý');
    expect(snapshotCounts(snap)).toEqual({ groups: 1, dials: 2 });
  });
});

describe('Google Disk: odkaz na složku', () => {
  const ID = '10CS73txDwi0_7TUrr71Q5JdAoLGbrUi_';

  it('pozná sdílecí odkaz, odkaz s účtem, open?id= i holé id', () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/1/folders/${ID}`)).toBe(ID);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(parseDriveFolderId(`  ${ID}  `)).toBe(ID);
  });

  it('odmítne cizí adresy a nesmysly', () => {
    expect(parseDriveFolderId('')).toBeNull();
    expect(parseDriveFolderId('https://example.com/drive/folders/abcdefghijkl')).toBeNull();
    expect(parseDriveFolderId('https://drive.google.com/drive/my-drive')).toBeNull();
    expect(parseDriveFolderId('ahoj')).toBeNull();
  });

  it('odkaz se drží v nastavení a přežije sloučení s výchozími hodnotami', () => {
    const s = mergeSettings(defaultSettings(), { sync: { driveFolderUrl: `https://drive.google.com/drive/folders/${ID}` } });
    expect(s.sync.driveFolderUrl).toContain(ID);
    expect(defaultSettings().sync.driveFolderUrl).toBe('');
  });
});
