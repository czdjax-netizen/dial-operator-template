import { describe, expect, it } from 'vitest';
import { importSd2 } from '../src/lib/import/sd2';
import type { Dial, Group } from '../src/lib/model';
import { defaultSettings } from '../src/lib/model';
import {
  SYNC_FORMAT,
  TOMBSTONE_TTL_MS,
  adoptRemote,
  buildSyncItems,
  diffSyncItems,
  mergeRemote,
  parseSyncItems,
  planFirstSync,
  totalBytes,
} from '../src/lib/sync';
import { fixture, seqIds } from './helpers';

const T0 = 1_700_000_000_000;
const META = { format: SYNC_FORMAT, epoch: 'E1' };
const g = (id: string, extra: Partial<Group> = {}): Group => ({ id, title: id, pos: 'a0', createdAt: T0, updatedAt: T0, ...extra });
const d = (id: string, extra: Partial<Dial> = {}): Dial => ({
  id,
  groupId: 'g1',
  title: id,
  url: `https://${id}.cz/`,
  pos: 'a0',
  visits: 5,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const local = (groups: Group[], dials: Dial[], settingsUpdatedAt = 0) => ({
  groups,
  dials,
  settings: defaultSettings(),
  settingsUpdatedAt,
});

describe('sync: položky', () => {
  it('odkaz jde bez náhledu a návštěv, staré smazání se uklidí', () => {
    const now = T0 + TOMBSTONE_TTL_MS + 10;
    const items = buildSyncItems(
      local(
        [g('g1')],
        [
          d('a', { thumb: { kind: 'logo', updatedAt: T0 }, visitsByDaypart: { morning: 1, afternoon: 0, evening: 0, night: 0 } }),
          d('old', { deletedAt: T0 }),
          d('fresh', { deletedAt: now - 1000 }),
        ],
      ),
      META,
      now,
    );
    expect(Object.keys(items).sort()).toEqual(['d.a', 'd.fresh', 'g.g1', 'meta', 'settings']);
    expect(items['d.a']).not.toHaveProperty('thumb');
    expect(items['d.a']).not.toHaveProperty('visits');
    expect(items['d.a']).not.toHaveProperty('visitsByDaypart');
    const back = parseSyncItems(JSON.parse(JSON.stringify({ ...items, 'x.cizí': 1, 'd.zly': { id: 1 } })));
    expect(back.meta).toEqual(META);
    expect(back.dials.map((x) => x.id).sort()).toEqual(['a', 'fresh']);
    expect(back.groups).toHaveLength(1);
    expect(back.settings?.value.theme).toBe('auto');
  });

  it('100 odkazů se vejde do limitu chrome.storage.sync', () => {
    const x = fixture();
    const many = {
      ...x,
      dials: Array.from({ length: 100 }, (_, i) => {
        const src = x.dials[i % x.dials.length];
        return { ...src, id: 1000 + i, url: `${src.url}${src.url.includes('?') ? '&' : '?'}n=${i}` };
      }),
    };
    const r = importSd2(many, { groups: [], dials: [] }, { mode: 'replace', cleanTitles: true, idGen: () => crypto.randomUUID() });
    expect(r.dials).toHaveLength(100);
    const items = buildSyncItems(local(r.groups, r.dials), META);
    const bytes = totalBytes(items);
    expect(bytes).toBeLessThan(102_400 * 0.5);
    for (const [k, v] of Object.entries(items)) expect(new TextEncoder().encode(k + JSON.stringify(v)).length).toBeLessThan(8192);
  });
});

describe('sync: sloučení', () => {
  it('novější vyhrává, náhled a návštěvy zůstanou lokální', () => {
    const loc = [d('a', { title: 'lokální', thumb: { kind: 'logo', updatedAt: T0 } }), d('b', { title: 'lokální novější', updatedAt: T0 + 50 })];
    const remote = parseSyncItems(
      buildSyncItems(local([g('g1')], [d('a', { title: 'vzdálený', updatedAt: T0 + 10 }), d('b', { title: 'starý', updatedAt: T0 + 5 }), d('c')]), META),
    );
    const m = mergeRemote({ groups: [g('g1')], dials: loc }, remote);
    const by = new Map(m.dials.map((x) => [x.id, x]));
    expect(by.get('a')).toMatchObject({ title: 'vzdálený', visits: 5, thumb: { kind: 'logo' } });
    expect(by.get('b')?.title).toBe('lokální novější');
    expect(by.get('c')).toMatchObject({ visits: 0 });
    expect(by.get('c')?.thumb).toBeUndefined();
    expect(m.pulled).toEqual(['c']);
    expect(m.changed).toBe(true);
  });

  it('změněná adresa zahodí náhled a jde do resolveru, smazání se přenese', () => {
    const remote = parseSyncItems(
      buildSyncItems(
        local([g('g1')], [d('a', { url: 'https://jinde.cz/', updatedAt: T0 + 1 }), d('b', { deletedAt: T0 + 2, updatedAt: T0 + 2 })]),
        META,
        T0 + 100,
      ),
    );
    const m = mergeRemote({ groups: [g('g1')], dials: [d('a', { thumb: { kind: 'logo', updatedAt: T0 } }), d('b')] }, remote);
    expect(m.dials.find((x) => x.id === 'a')?.thumb).toBeUndefined();
    expect(m.dials.find((x) => x.id === 'b')?.deletedAt).toBe(T0 + 2);
    expect(m.pulled).toEqual(['a']);
  });

  it('stejný stav nic nemění', () => {
    const state = local([g('g1')], [d('a'), d('b')]);
    const m = mergeRemote(state, parseSyncItems(buildSyncItems(state, META)));
    expect(m.changed).toBe(false);
  });
});

describe('sync: co zapsat', () => {
  it('jen chybějící a novější záznamy, meta při nové epoše, uklizené klíče pryč', () => {
    const remote = buildSyncItems(local([g('g1')], [d('a'), d('b', { updatedAt: T0 + 9 }), d('gc')]), META);
    const desired = buildSyncItems(local([g('g1')], [d('a', { updatedAt: T0 + 1 }), d('b'), d('n')]), META);
    const diff = diffSyncItems(remote, desired);
    expect(Object.keys(diff.set).sort()).toEqual(['d.a', 'd.n']);
    expect(diff.remove).toEqual(['d.gc']);
    const reset = diffSyncItems(remote, buildSyncItems(local([g('g1')], [d('a')]), { format: SYNC_FORMAT, epoch: 'E2' }));
    expect(reset.set).toHaveProperty('meta');
  });

  it('dva počítače se stejným stavem nic nezapisují (žádné přetahování)', () => {
    const state = local([g('g1')], [d('a'), d('b')], T0);
    const items = JSON.parse(JSON.stringify(buildSyncItems(state, META)));
    const diff = diffSyncItems(items, buildSyncItems(state, META));
    expect(diff.set).toEqual({});
    expect(diff.remove).toEqual([]);
  });

  it('cizí klíče ve sync úložišti nemaže', () => {
    const diff = diffSyncItems({ 'něco.jiného': 1 }, buildSyncItems(local([], []), META));
    expect(diff.remove).toEqual([]);
  });
});

describe('sync: první připojení', () => {
  const remote = parseSyncItems(buildSyncItems(local([g('g1')], [d('a')]), META));

  it('prázdná synchronizace = nahrát, prázdný počítač = převzít', () => {
    expect(planFirstSync({ groups: [g('x')], dials: [d('x')] }, parseSyncItems({}))).toBe('push');
    expect(planFirstSync({ groups: [], dials: [d('z', { deletedAt: T0 })] }, remote)).toBe('pull');
  });

  it('společný původ = sloučit, jiný původ = zeptat se', () => {
    expect(planFirstSync({ groups: [g('g1')], dials: [d('jiny')] }, remote)).toBe('merge');
    const ids = seqIds('L');
    expect(planFirstSync({ groups: [g(ids())], dials: [d(ids())] }, remote)).toBe('ask');
  });

  it('převzetí zachová návštěvy podle adresy', () => {
    const r = adoptRemote({ dials: [d('jine-id', { url: 'https://a.cz', visits: 42 })] }, remote);
    expect(r.dials).toHaveLength(1);
    expect(r.dials[0]).toMatchObject({ id: 'a', visits: 42 });
    expect(r.groups.map((x) => x.id)).toEqual(['g1']);
  });
});
