import type { Dial, Group, Settings, ThumbKind } from '../model';
import { cloneData } from '../model';
import { keyAfterLast, keysBetween, sortByPos } from '../order';
import { normalizeUrl, safeUrl } from '../url';

/**
 * Vlastní záloha aplikace (JSON včetně obrázků náhledů).
 * Stejný formát poslouží i jako obsah souboru pro synchronizaci přes Google Disk,
 * proto se zachovávají id, `updatedAt` a frakční pozice.
 */

export const BACKUP_FORMAT = 'dial-operator-backup';
export const BACKUP_VERSION = 1;

export interface BackupThumb {
  dialId: string;
  kind: Exclude<ThumbKind, 'glyph'>;
  source?: string;
  updatedAt: number;
  mime: string;
  /** Obsah obrázku v base64 (bez prefixu `data:`). */
  data: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  deviceId: string;
  groups: Group[];
  dials: Dial[];
  settings: Settings;
  thumbs: BackupThumb[];
}

export interface BackupSource {
  groups: readonly Group[];
  dials: readonly Dial[];
  settings: Settings;
  deviceId: string;
}

export interface BuildOptions {
  /** Přibalit i smazané záznamy (pro synchronizaci). Záloha pro člověka je bez nich. */
  includeDeleted?: boolean;
  now?: number;
}

/** Sestaví zálohu. Obrázky se přibalí jen k odkazům, které v záloze jsou. */
export function buildBackup(src: BackupSource, thumbs: readonly BackupThumb[], opts: BuildOptions = {}): BackupFile {
  const keep = <T extends { deletedAt?: number }>(x: T) => opts.includeDeleted || !x.deletedAt;
  const groups = src.groups.filter(keep);
  const groupIds = new Set(groups.map((g) => g.id));
  const dials = src.dials.filter((d) => keep(d) && groupIds.has(d.groupId));
  const dialIds = new Set(dials.map((d) => d.id));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: opts.now ?? Date.now(),
    deviceId: src.deviceId,
    groups: cloneData(groups),
    dials: cloneData(dials),
    settings: cloneData(src.settings),
    thumbs: thumbs.filter((t) => dialIds.has(t.dialId)).map((t) => ({ ...t })),
  };
}

export function detectBackup(json: unknown): json is BackupFile {
  const x = json as Partial<BackupFile> | null;
  return !!x && x.format === BACKUP_FORMAT && Array.isArray(x.groups) && Array.isArray(x.dials);
}

/** Název souboru zálohy, např. `zaloha-odkazu-2026-11-09.json`. */
export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `zaloha-odkazu-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Kopie záznamu bez `deletedAt` s novým `updatedAt`. */
function revive<T extends { deletedAt?: number; updatedAt: number }>(x: T, updatedAt: number): T {
  const out = { ...x, updatedAt };
  delete out.deletedAt;
  return out;
}

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ze souboru bere jen záznamy, které dávají smysl (soubor mohl někdo upravit ručně). */
function cleanGroup(g: Partial<Group>): Group | null {
  if (!str(g.id) || !str(g.title) || !str(g.pos)) return null;
  return {
    ...(g as Group),
    title: g.title.trim() || 'Bez názvu',
    createdAt: num(g.createdAt) ? g.createdAt : 0,
    updatedAt: num(g.updatedAt) ? g.updatedAt : 0,
  };
}

function cleanDial(d: Partial<Dial>): Dial | null {
  if (!str(d.id) || !str(d.groupId) || !str(d.url) || !str(d.pos)) return null;
  const u = safeUrl(d.url);
  if (!u) return null;
  return {
    ...(d as Dial),
    url: u.href,
    title: str(d.title) && d.title.trim() ? d.title : u.hostname,
    visits: num(d.visits) ? d.visits : 0,
    createdAt: num(d.createdAt) ? d.createdAt : 0,
    updatedAt: num(d.updatedAt) ? d.updatedAt : 0,
  };
}

export interface BackupSummary {
  version: number;
  exportedAt: number;
  deviceId: string;
  groups: number;
  dials: number;
  thumbs: number;
  /** Soubor je z novější verze aplikace, než je tahle. */
  tooNew: boolean;
}

export function summarizeBackup(b: BackupFile): BackupSummary {
  return {
    version: b.version,
    exportedAt: num(b.exportedAt) ? b.exportedAt : 0,
    deviceId: str(b.deviceId) ? b.deviceId : '',
    groups: b.groups.filter((g) => !g.deletedAt).length,
    dials: b.dials.filter((d) => !d.deletedAt).length,
    thumbs: Array.isArray(b.thumbs) ? b.thumbs.length : 0,
    tooNew: !num(b.version) || b.version > BACKUP_VERSION,
  };
}

export interface BackupImportResult {
  groups: Group[];
  dials: Dial[];
  /** Obrázky k uložení do IndexedDB (jen pro odkazy převzaté ze zálohy). */
  thumbs: BackupThumb[];
  /** Odkazy převzaté ze zálohy bez obrázku: projde je resolver. */
  thumbJobs: { dialId: string; url: string }[];
  stats: {
    groupsAdded: number;
    groupsMerged: number;
    dialsAdded: number;
    dialsUpdated: number;
    duplicatesSkipped: number;
    removed: number;
  };
}

/**
 * Převezme zálohu do stávajícího stavu.
 * - NAHRADIT: stav bude přesně podle zálohy. Co v ní není, se měkce smaže. Převzaté
 *   záznamy dostanou `updatedAt = now`, aby obnova vyhrála i při pozdější synchronizaci.
 * - SLOUČIT: stejné id rozhodne novější `updatedAt`, skupiny bez shody id se párují
 *   podle názvu a odkazy s už existující adresou se přeskočí. Nové se přidají na konec.
 */
export function importBackup(
  b: BackupFile,
  existing: { groups: readonly Group[]; dials: readonly Dial[] },
  opts: { mode: 'replace' | 'merge'; now?: number },
): BackupImportResult {
  const now = opts.now ?? Date.now();
  const stats: BackupImportResult['stats'] = {
    groupsAdded: 0,
    groupsMerged: 0,
    dialsAdded: 0,
    dialsUpdated: 0,
    duplicatesSkipped: 0,
    removed: 0,
  };
  const inGroups = sortByPos(
    b.groups
      .filter((g) => !g.deletedAt)
      .map(cleanGroup)
      .filter((g): g is Group => !!g),
  );
  const inGroupIds = new Set(inGroups.map((g) => g.id));
  const inDials = sortByPos(
    b.dials
      .filter((d) => !d.deletedAt)
      .map(cleanDial)
      .filter((d): d is Dial => !!d && inGroupIds.has(d.groupId)),
  );

  let groups = existing.groups.map((g) => ({ ...g }));
  let dials = existing.dials.map((d) => ({ ...d }));
  /** Odkazy převzaté ze zálohy (kvůli obrázkům). */
  const taken = new Set<string>();

  if (opts.mode === 'replace') {
    const ids = new Set(inDials.map((d) => d.id));
    stats.removed = dials.filter((d) => !d.deletedAt && !ids.has(d.id)).length;
    const soft = <T extends { deletedAt?: number; updatedAt: number }>(x: T): T =>
      x.deletedAt ? x : { ...x, deletedAt: now, updatedAt: now };
    groups = groups.filter((g) => !inGroupIds.has(g.id)).map(soft);
    dials = dials.filter((d) => !ids.has(d.id)).map(soft);
    for (const g of inGroups) {
      groups.push(revive(g, now));
      stats.groupsAdded++;
    }
    for (const d of inDials) {
      dials.push(revive(d, now));
      taken.add(d.id);
      stats.dialsAdded++;
    }
  } else {
    const live = <T extends { deletedAt?: number }>(arr: T[]) => arr.filter((a) => !a.deletedAt);
    // skupiny: id ze zálohy na id skupiny ve výsledku
    const groupMap = new Map<string, string>();
    /** Skupiny, které jsou tady smazané později, než vznikla záloha: jejich odkazy se nepřevezmou. */
    const deadGroups = new Set<string>();
    const appended: Group[] = [];
    for (const g of inGroups) {
      const i = groups.findIndex((e) => e.id === g.id);
      if (i >= 0) {
        if (g.updatedAt > groups[i].updatedAt) groups[i] = revive(g, g.updatedAt);
        if (groups[i].deletedAt) deadGroups.add(g.id);
        else stats.groupsMerged++;
        groupMap.set(g.id, g.id);
        continue;
      }
      const byTitle = live(groups).find((e) => e.title.trim().toLowerCase() === g.title.trim().toLowerCase());
      if (byTitle) {
        groupMap.set(g.id, byTitle.id);
        stats.groupsMerged++;
        continue;
      }
      appended.push(g);
    }
    const gKeys = keysBetween(live(groups).length ? keyAfterLast(live(groups)) : null, null, appended.length);
    appended.forEach((g, i) => {
      groups.push({ ...g, pos: gKeys[i], updatedAt: now });
      groupMap.set(g.id, g.id);
      stats.groupsAdded++;
    });

    const seen = new Set(live(dials).map((d) => normalizeUrl(d.url)));
    const toAdd = new Map<string, Dial[]>();
    for (const d0 of inDials) {
      const d = { ...d0, groupId: groupMap.get(d0.groupId) ?? d0.groupId };
      if (deadGroups.has(d.groupId)) continue;
      const i = dials.findIndex((e) => e.id === d.id);
      if (i >= 0) {
        if (d.updatedAt > dials[i].updatedAt) {
          dials[i] = revive(d, d.updatedAt);
          taken.add(d.id);
          stats.dialsUpdated++;
        }
        continue;
      }
      const key = normalizeUrl(d.url);
      if (seen.has(key)) {
        stats.duplicatesSkipped++;
        continue;
      }
      seen.add(key);
      const list = toAdd.get(d.groupId) ?? [];
      list.push(d);
      toAdd.set(d.groupId, list);
    }
    for (const [groupId, list] of toAdd) {
      const inGroup = live(dials).filter((e) => e.groupId === groupId);
      const keys = keysBetween(inGroup.length ? keyAfterLast(inGroup) : null, null, list.length);
      list.forEach((d, i) => {
        dials.push({ ...d, pos: keys[i], updatedAt: now });
        taken.add(d.id);
        stats.dialsAdded++;
      });
    }
  }

  // obrázky: k převzatým odkazům ze zálohy, bez obrázku je projde resolver
  const images = new Map((Array.isArray(b.thumbs) ? b.thumbs : []).map((t) => [t.dialId, t]));
  const thumbs: BackupThumb[] = [];
  const thumbJobs: BackupImportResult['thumbJobs'] = [];
  dials = dials.map((d) => {
    if (!taken.has(d.id)) return d;
    const img = images.get(d.id);
    if (img && str(img.data) && img.data) {
      thumbs.push(img);
      return { ...d, thumb: { kind: img.kind, source: img.source, updatedAt: img.updatedAt } };
    }
    if (d.thumb?.kind === 'glyph') return d;
    thumbJobs.push({ dialId: d.id, url: d.url });
    return { ...d, thumb: undefined };
  });

  return { groups, dials, thumbs, thumbJobs, stats };
}
