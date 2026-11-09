import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  backupFileName,
  buildBackup,
  detectBackup,
  importBackup,
  summarizeBackup,
  type BackupThumb,
} from '../src/lib/import/backup';
import { importSd2 } from '../src/lib/import/sd2';
import type { Dial, Group } from '../src/lib/model';
import { defaultSettings } from '../src/lib/model';
import { keysBetween } from '../src/lib/order';
import { fixture, seqIds } from './helpers';

const T0 = 1_700_000_000_000;
const [p1, p2, p3] = keysBetween(null, null, 3);

const group = (id: string, title: string, pos: string, extra: Partial<Group> = {}): Group => ({
  id,
  title,
  pos,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const dial = (id: string, groupId: string, url: string, pos: string, extra: Partial<Dial> = {}): Dial => ({
  id,
  groupId,
  title: url,
  url,
  pos,
  visits: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const img = (dialId: string): BackupThumb => ({
  dialId,
  kind: 'logo',
  source: 'test',
  updatedAt: T0,
  mime: 'image/webp',
  data: 'AAAA',
});

function sampleState() {
  const groups = [group('g1', 'Home', p1), group('g2', 'Práce', p2), group('gx', 'Smazaná', p3, { deletedAt: T0 })];
  const dials = [
    dial('d1', 'g1', 'https://novinky.cz/', p1, { thumb: { kind: 'logo', updatedAt: T0 } }),
    dial('d2', 'g1', 'https://idnes.cz/', p2, { thumb: { kind: 'glyph', updatedAt: T0 } }),
    dial('d3', 'g2', 'https://github.com/', p1),
    dial('dx', 'g1', 'https://smazany.cz/', p3, { deletedAt: T0 }),
  ];
  return { groups, dials, settings: defaultSettings(), deviceId: 'dev-A' };
}

describe('záloha: sestavení', () => {
  it('bez smazaných záznamů a jen s obrázky k zálohovaným odkazům', () => {
    const b = buildBackup(sampleState(), [img('d1'), img('dx'), img('nikdo')], { now: T0 });
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(b.dials.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
    expect(b.thumbs.map((t) => t.dialId)).toEqual(['d1']);
    expect(detectBackup(b)).toBe(true);
    expect(detectBackup(fixture())).toBe(false);
  });

  it('pro synchronizaci jde přibalit i smazané', () => {
    const b = buildBackup(sampleState(), [], { includeDeleted: true });
    expect(b.dials.map((d) => d.id)).toContain('dx');
    expect(b.groups.map((g) => g.id)).toContain('gx');
  });

  it('souhrn a název souboru', () => {
    const b = buildBackup(sampleState(), [img('d1')], { now: new Date(2026, 10, 9, 8).getTime() });
    const s = summarizeBackup(b);
    expect(s).toMatchObject({ groups: 2, dials: 3, thumbs: 1, tooNew: false, deviceId: 'dev-A' });
    expect(summarizeBackup({ ...b, version: 99 }).tooNew).toBe(true);
    expect(backupFileName(b.exportedAt)).toBe('zaloha-odkazu-2026-11-09.json');
  });
});

describe('záloha: NAHRADIT', () => {
  it('stav bude přesně podle zálohy, ostatní se měkce smaže', () => {
    const backup = buildBackup(sampleState(), [img('d1')]);
    const local = {
      groups: [group('g1', 'Home', p1), group('g9', 'Lokální', p2)],
      dials: [dial('d1', 'g1', 'https://novinky.cz/', p1, { title: 'upraveno' }), dial('d9', 'g9', 'https://x.cz/', p1)],
    };
    const now = T0 + 5000;
    const r = importBackup(backup, local, { mode: 'replace', now });
    const live = r.dials.filter((d) => !d.deletedAt);
    expect(live.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
    expect(r.dials.find((d) => d.id === 'd9')?.deletedAt).toBe(now);
    expect(r.groups.find((g) => g.id === 'g9')?.deletedAt).toBe(now);
    // převzaté záznamy vyhrají i při pozdější synchronizaci
    expect(live.every((d) => d.updatedAt === now)).toBe(true);
    expect(r.dials.find((d) => d.id === 'd1')?.title).toBe('https://novinky.cz/');
    expect(r.stats).toMatchObject({ dialsAdded: 3, removed: 1 });
  });

  it('obrázky: se zálohou se obnoví, bez ní jde odkaz do resolveru, glyph zůstane', () => {
    const backup = buildBackup(sampleState(), [img('d1')]);
    const r = importBackup(backup, { groups: [], dials: [] }, { mode: 'replace', now: T0 });
    expect(r.thumbs.map((t) => t.dialId)).toEqual(['d1']);
    expect(r.dials.find((d) => d.id === 'd1')?.thumb?.kind).toBe('logo');
    expect(r.dials.find((d) => d.id === 'd2')?.thumb?.kind).toBe('glyph');
    expect(r.thumbJobs.map((j) => j.dialId)).toEqual(['d3']);
  });

  it('záloha bez obrázků: logo se najde znovu', () => {
    const backup = buildBackup(sampleState(), []);
    const r = importBackup(backup, { groups: [], dials: [] }, { mode: 'replace', now: T0 });
    expect(r.dials.find((d) => d.id === 'd1')?.thumb).toBeUndefined();
    expect(r.thumbJobs.map((j) => j.dialId).sort()).toEqual(['d1', 'd3']);
  });
});

describe('záloha: SLOUČIT', () => {
  it('stejné id: vyhraje novější updatedAt', () => {
    const backup = buildBackup(sampleState(), []);
    backup.dials[0] = { ...backup.dials[0], title: 'ze zálohy', updatedAt: T0 + 10 };
    backup.dials[1] = { ...backup.dials[1], title: 'stará záloha', updatedAt: T0 - 10 };
    const local = {
      groups: [group('g1', 'Home', p1), group('g2', 'Práce', p2)],
      dials: [
        dial('d1', 'g1', 'https://novinky.cz/', p1, { title: 'lokální' }),
        dial('d2', 'g1', 'https://idnes.cz/', p2, { title: 'lokální novější' }),
      ],
    };
    const r = importBackup(backup, local, { mode: 'merge', now: T0 + 100 });
    expect(r.dials.find((d) => d.id === 'd1')?.title).toBe('ze zálohy');
    expect(r.dials.find((d) => d.id === 'd2')?.title).toBe('lokální novější');
    expect(r.stats).toMatchObject({ dialsUpdated: 1, dialsAdded: 1, groupsMerged: 2 });
  });

  it('jiné id: skupina se spáruje podle názvu, adresa se nezdvojí', () => {
    const backup = buildBackup(sampleState(), []);
    const local = {
      groups: [group('L1', 'home', p1)],
      dials: [dial('L-d', 'L1', 'http://www.novinky.cz', p1)],
    };
    const r = importBackup(backup, local, { mode: 'merge', now: T0 });
    const live = r.dials.filter((d) => !d.deletedAt);
    expect(live.filter((d) => d.groupId === 'L1').map((d) => d.url)).toEqual([
      'http://www.novinky.cz',
      'https://idnes.cz/',
    ]);
    expect(r.groups.filter((g) => !g.deletedAt).map((g) => g.title)).toEqual(['home', 'Práce']);
    expect(r.stats).toMatchObject({ duplicatesSkipped: 1, groupsMerged: 1, groupsAdded: 1, dialsAdded: 2 });
    // přidané jdou za existující (pozice větší než poslední lokální)
    const idnes = live.find((d) => d.url === 'https://idnes.cz/')!;
    expect(idnes.pos > p1).toBe(true);
  });

  it('skupina smazaná tady později než záloha zůstane smazaná i s odkazy', () => {
    const backup = buildBackup(sampleState(), []);
    const local = { groups: [group('g2', 'Práce', p1, { deletedAt: T0 + 50, updatedAt: T0 + 50 })], dials: [] };
    const r = importBackup(backup, local, { mode: 'merge', now: T0 + 100 });
    expect(r.groups.find((g) => g.id === 'g2')?.deletedAt).toBe(T0 + 50);
    expect(r.dials.find((d) => d.id === 'd3')).toBeUndefined();
  });

  it('ručně poškozené záznamy se přeskočí', () => {
    const backup = buildBackup(sampleState(), []);
    (backup.dials as unknown[]).push({ id: 'zly', groupId: 'g1', url: 'javascript:alert(1)', pos: p3 }, { nic: 1 });
    const r = importBackup(backup, { groups: [], dials: [] }, { mode: 'replace', now: T0 });
    expect(r.dials.map((d) => d.id)).not.toContain('zly');
    expect(r.dials).toHaveLength(3);
  });
});

describe('záloha: tam a zpět s importem SD2', () => {
  it('fixtura, záloha a NAHRADIT do prázdna dá stejné odkazy ve stejném pořadí', () => {
    const imported = importSd2(fixture(), { groups: [], dials: [] }, { mode: 'replace', cleanTitles: true, idGen: seqIds() });
    const backup = JSON.parse(
      JSON.stringify(
        buildBackup({ groups: imported.groups, dials: imported.dials, settings: defaultSettings(), deviceId: 'x' }, []),
      ),
    );
    expect(detectBackup(backup)).toBe(true);
    const r = importBackup(backup, { groups: [], dials: [] }, { mode: 'replace', now: T0 });
    const key = (d: Dial) => `${d.groupId}|${d.pos}|${d.url}|${d.title}`;
    expect(r.dials.map(key).sort()).toEqual(imported.dials.map(key).sort());
    expect(r.groups.map((g) => g.title)).toEqual(imported.groups.map((g) => g.title));
  });
});
