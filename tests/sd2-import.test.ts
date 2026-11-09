import { describe, expect, it } from 'vitest';
import {
  detectSd2,
  importSd2,
  mapSd2Preferences,
  orderedSd2Dials,
  orderedSd2Groups,
  summarizeSd2,
  thumbState,
} from '../src/lib/import/sd2';
import type { Dial } from '../src/lib/model';
import { sortByPos } from '../src/lib/order';
import { fixture, seqIds } from './helpers';

const NOW = Date.UTC(2026, 10, 8, 12);

function inGroup(dials: Dial[], groupId: string) {
  return sortByPos(dials.filter((d) => d.groupId === groupId && !d.deletedAt));
}

describe('detekce a souhrn', () => {
  it('pozná export SD2 a odmítne cizí JSON', () => {
    expect(detectSd2(fixture())).toBe(true);
    expect(detectSd2({ groups: [], dials: [{ foo: 1 }] })).toBe(false);
    expect(detectSd2(null)).toBe(false);
  });

  it('souhrn ukázkového exportu', () => {
    const s = summarizeSd2(fixture());
    expect(s).toMatchObject({ groups: 5, dials: 22, deadThumbs: 9, liveThumbs: 2, emptyThumbs: 11, unsorted: 3, orphans: 0 });
    expect(s.duplicates).toBe(0);
    expect(s.machineTitles).toBe(16);
  });

  it('souhrn pozná duplicitní adresu (http a https)', () => {
    const x = fixture();
    const dup = { ...x, dials: [...x.dials, { ...x.dials[0], id: 999, url: 'http://cs.wikipedia.org/' }] };
    expect(summarizeSd2(dup).duplicates).toBe(1);
  });

  it('thumbState', () => {
    expect(thumbState('https://logo.clearbit.com/novinky.cz')).toBe('dead');
    expect(thumbState('http://i.forbesimg.com/x.png')).toBe('live');
    expect(thumbState('')).toBe('empty');
    expect(thumbState(null)).toBe('empty');
  });
});

describe('řazení', () => {
  it('skupiny podle position, ne podle id', () => {
    expect(orderedSd2Groups(fixture().groups).map((g) => g.title)).toEqual(['Domů', 'Videa', 'Počasí', 'Hry', 'Ostatní']);
  });

  it('999 nakonec, shodné pozice podle ts_created', () => {
    const x = fixture();
    const hry = orderedSd2Dials(x.dials.filter((d) => String(d.idgroup) === '4'));
    expect(hry.map((d) => String(d.id)).slice(0, 3)).toEqual(['12', '8', '11']);
    const pocasi = orderedSd2Dials(x.dials.filter((d) => String(d.idgroup) === '3'));
    expect(pocasi.slice(-2).every((d) => d.position === 999)).toBe(true);
  });
});

describe('import ukázkového exportu (NAHRADIT do prázdna)', () => {
  const x = fixture();
  const r = importSd2(x, { groups: [], dials: [] }, { mode: 'replace', cleanTitles: true, now: NOW, idGen: seqIds() });
  const groups = sortByPos(r.groups);

  it('5 skupin a 22 odkazů ve správném pořadí', () => {
    expect(groups.map((g) => g.title)).toEqual(['Domů', 'Videa', 'Počasí', 'Hry', 'Ostatní']);
    expect(r.dials).toHaveLength(22);
    expect(r.stats).toMatchObject({ groupsAdded: 5, dialsAdded: 22, duplicatesSkipped: 0, titlesCleaned: 16 });
  });

  it('Domů začíná jako v SD2 a strojové titulky jsou uklizené', () => {
    const home = inGroup(r.dials, groups[0].id);
    expect(home).toHaveLength(8);
    expect(home.slice(0, 5).map((d) => d.title)).toEqual(['Wikipedie', 'seznam.cz', 'mapy.cz', 'youtube.com', 'github.com']);
  });

  it('lidské titulky zůstanou a nezařazený jde nakonec', () => {
    const videa = inGroup(r.dials, groups[1].id);
    expect(videa[0].title).toBe('Kreslení');
    expect(videa.at(-1)!.title).toBe('Archiv');
  });

  it('převezme návštěvy, čas vytvoření a legacy id', () => {
    const wiki = r.dials.find((d) => d.legacyId === '7')!;
    const src = x.dials.find((d) => String(d.id) === '7')!;
    expect(wiki.visits).toBe(src.visits);
    expect(wiki.visitsByDaypart?.morning).toBe(src.visits_morning);
    expect(wiki.createdAt).toBe(src.ts_created! * 1000);
  });

  it('úlohy pro náhledy: všech 22, živé obrázky předané', () => {
    expect(r.thumbJobs).toHaveLength(22);
    expect(r.thumbJobs.filter((j) => j.imageUrl)).toHaveLength(2);
  });

  it('předvolby', () => {
    expect(r.settingsPatch).toMatchObject({
      theme: 'auto',
      fontScale: 0.8,
      layout: { columns: 4, maxWidth: 1280, gap: 16, centered: true, showTitle: true, showVisits: false, radius: 'large' },
      behavior: { openInNewTab: false, keepActiveGroup: true, orderBy: 'manual' },
    });
    expect(r.settingsPatch.background).toBeUndefined();
    // Roboto nemáme, zůstane výchozí písmo; neproporcionální písma ze SD2 jdou na „strojové“
    expect(r.settingsPatch.font).toBeUndefined();
    expect(mapSd2Preferences({ theme: { font: 'Source Code Pro' } }).font).toBe('mono');
  });
});

describe('SLOUČIT a NAHRADIT nad existujícími daty', () => {
  it('SLOUČIT přeskočí i duplicitu uvnitř exportu', () => {
    const x = fixture();
    const dup = { ...x, dials: [...x.dials, { ...x.dials[0], id: 999, url: 'http://cs.wikipedia.org/' }] };
    const r = importSd2(dup, { groups: [], dials: [] }, { mode: 'merge', cleanTitles: true, now: NOW, idGen: seqIds() });
    expect(r.stats).toMatchObject({ dialsAdded: 22, duplicatesSkipped: 1 });
  });

  it('druhý import v režimu SLOUČIT nic nepřidá', () => {
    const x = fixture();
    const first = importSd2(x, { groups: [], dials: [] }, { mode: 'replace', cleanTitles: true, now: NOW, idGen: seqIds('a') });
    const second = importSd2(x, first, { mode: 'merge', cleanTitles: true, now: NOW, idGen: seqIds('b') });
    expect(second.stats).toMatchObject({ dialsAdded: 0, groupsAdded: 0, groupsMerged: 5, duplicatesSkipped: 22 });
    expect(second.dials).toHaveLength(22);
  });

  it('SLOUČIT přidá nové odkazy na konec existující skupiny', () => {
    const x = fixture();
    const first = importSd2(x, { groups: [], dials: [] }, { mode: 'replace', cleanTitles: false, now: NOW, idGen: seqIds('a') });
    const home = first.groups.find((g) => g.title === 'Domů')!;
    const extra = { ...x, dials: [...x.dials, { ...x.dials[0], id: 9999, url: 'https://example.com/new', position: 0 }] };
    const second = importSd2(extra, first, { mode: 'merge', cleanTitles: false, now: NOW, idGen: seqIds('b') });
    expect(second.stats.dialsAdded).toBe(1);
    const list = inGroup(second.dials, home.id);
    expect(list.at(-1)!.url).toBe('https://example.com/new');
  });

  it('NAHRADIT měkce smaže staré záznamy', () => {
    const x = fixture();
    const first = importSd2(x, { groups: [], dials: [] }, { mode: 'replace', cleanTitles: true, now: NOW, idGen: seqIds('a') });
    const second = importSd2(x, first, { mode: 'replace', cleanTitles: true, now: NOW + 1, idGen: seqIds('b') });
    expect(second.dials.filter((d) => !d.deletedAt)).toHaveLength(22);
    expect(second.dials.filter((d) => d.deletedAt === NOW + 1)).toHaveLength(22);
    expect(second.stats.removed).toBe(22);
  });
});

describe('mapSd2Preferences', () => {
  it('neznámé a chybějící hodnoty vynechá', () => {
    expect(mapSd2Preferences(undefined)).toEqual({});
    const m = mapSd2Preferences({ columns: 99, theme: { theme: 'dark', font: 'Comic Sans' } });
    expect(m.layout?.columns).toBe(12);
    expect(m.theme).toBe('dark');
    expect(m.font).toBeUndefined();
  });
});

describe('obrázek pozadí ze SD2', () => {
  it('zapne obrázek pozadí s průhledností', () => {
    const m = mapSd2Preferences({ theme: { dark: { backgroundImage: 'https://example.com/pozadi.jpg', backgroundOpacity: '30' } } });
    expect(m.background).toMatchObject({ kind: 'image', imageUrl: 'https://example.com/pozadi.jpg', opacity: 0.3 });
  });
});
