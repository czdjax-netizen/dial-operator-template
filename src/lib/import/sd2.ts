import type { DeepPartial, Dial, FontName, Group, Settings, ThemeName } from '../model';
import { newId } from '../model';
import { keyAfterLast, keysBetween, sortByPos } from '../order';
import { tidyTitle, isMachineTitle } from '../titles';
import { normalizeUrl, safeUrl } from '../url';

/**
 * Import exportu Speed Dial 2 (Preferences → System → Export settings).
 * Formát: { groups[{id,title,position,color?}], dials[{id,idgroup,position,title,url,thumbnail,
 * ts_created,visits,visits_morning|afternoon|evening|night}], preferences{…} }.
 */

export interface Sd2Group {
  id: number | string;
  title: string;
  position: number;
  color?: string | null;
}

export interface Sd2Dial {
  id: number | string;
  idgroup: number | string;
  position: number;
  title: string;
  url: string;
  thumbnail?: string | null;
  ts_created?: number;
  visits?: number;
  visits_morning?: number;
  visits_afternoon?: number;
  visits_evening?: number;
  visits_night?: number;
}

export interface Sd2Export {
  groups: Sd2Group[];
  dials: Sd2Dial[];
  preferences?: Record<string, unknown>;
}

export const SD2_UNSORTED = 999;
const DEAD_THUMB_HOSTS = /(^|\.)logo\.clearbit\.com$/i;

export function detectSd2(json: unknown): json is Sd2Export {
  const x = json as Partial<Sd2Export> | null;
  return (
    !!x &&
    Array.isArray(x.groups) &&
    Array.isArray(x.dials) &&
    x.dials.every((d) => d && typeof d === 'object' && 'idgroup' in d && 'url' in d)
  );
}

export type ThumbState = 'live' | 'dead' | 'empty';

export function thumbState(thumbnail: string | null | undefined): ThumbState {
  if (!thumbnail || !thumbnail.trim()) return 'empty';
  const u = safeUrl(thumbnail);
  if (!u) return thumbnail.startsWith('data:image/') ? 'live' : 'empty';
  return DEAD_THUMB_HOSTS.test(u.hostname) ? 'dead' : 'live';
}

export interface Sd2Summary {
  groups: number;
  dials: number;
  liveThumbs: number;
  deadThumbs: number;
  emptyThumbs: number;
  machineTitles: number;
  unsorted: number;
  orphans: number;
  /** Odkazy, jejichž normalizovaná URL je v exportu víckrát (navíc ke první). */
  duplicates: number;
}

export function summarizeSd2(x: Sd2Export): Sd2Summary {
  const groupIds = new Set(x.groups.map((g) => String(g.id)));
  const s: Sd2Summary = {
    groups: x.groups.length,
    dials: x.dials.length,
    liveThumbs: 0,
    deadThumbs: 0,
    emptyThumbs: 0,
    machineTitles: 0,
    unsorted: 0,
    orphans: 0,
    duplicates: 0,
  };
  const urls = new Set<string>();
  for (const d of x.dials) {
    const key = normalizeUrl(d.url);
    if (urls.has(key)) s.duplicates++;
    urls.add(key);
    const t = thumbState(d.thumbnail);
    if (t === 'live') s.liveThumbs++;
    else if (t === 'dead') s.deadThumbs++;
    else s.emptyThumbs++;
    if (isMachineTitle(d.title ?? '', d.url)) s.machineTitles++;
    if (d.position === SD2_UNSORTED) s.unsorted++;
    if (!groupIds.has(String(d.idgroup))) s.orphans++;
  }
  return s;
}

/** Skupiny podle `position` (id v SD2 pořadí NEodpovídá), při shodě podle id. */
export function orderedSd2Groups(groups: readonly Sd2Group[]): Sd2Group[] {
  return [...groups].sort((a, b) => a.position - b.position || Number(a.id) - Number(b.id));
}

/** Odkazy podle (position, 999 nakonec, ts_created, id). */
export function orderedSd2Dials(dials: readonly Sd2Dial[]): Sd2Dial[] {
  const key = (p: number) => (p === SD2_UNSORTED ? Number.POSITIVE_INFINITY : p);
  return [...dials].sort(
    (a, b) =>
      key(a.position) - key(b.position) ||
      (a.ts_created ?? 0) - (b.ts_created ?? 0) ||
      Number(a.id) - Number(b.id),
  );
}

/** Písma SD2: neproporcionální jdou na `mono`, ostatní necháme výchozí. */
const FONTS: Record<string, FontName> = {
  'source code pro': 'mono',
  'jetbrains mono': 'mono',
  vt323: 'mono',
  'courier new': 'mono',
  georgia: 'serif',
  'times new roman': 'serif',
};

const RADIUS: Record<string, Settings['layout']['radius']> = {
  none: 'none',
  small: 'small',
  medium: 'medium',
  large: 'large',
};

function bool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  return v === true || v === 1 || v === '1' || v === 'true';
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Převod `preferences` ze SD2 na naše nastavení (barvy SD2 ignorujeme, máme motivy). Obrázek pozadí se zapne. */
export function mapSd2Preferences(prefs: Record<string, unknown> | undefined): DeepPartial<Settings> {
  if (!prefs) return {};
  const p = prefs as Record<string, any>;
  const bm = (p.bookmarks ?? {}) as Record<string, unknown>;
  const theme = (p.theme ?? {}) as Record<string, any>;
  const dark = (theme.dark ?? {}) as Record<string, unknown>;

  const columns = num(p.columns);
  const maxWidth = num(p.maxWidth);
  const spacing = num(p.spacing);
  const fontSize = num(theme.fontSize);
  const themeName: ThemeName | undefined =
    theme.theme === 'dark' ? 'dark' : theme.theme === 'light' ? 'light' : theme.theme === 'auto' ? 'auto' : undefined;
  const opacity = num(dark.backgroundOpacity);
  const image = typeof dark.backgroundImage === 'string' && safeUrl(dark.backgroundImage) ? dark.backgroundImage : undefined;

  return {
    theme: themeName,
    font: FONTS[String(theme.font ?? '').toLowerCase()],
    fontScale: fontSize ? Math.min(1.4, Math.max(0.6, fontSize / 100)) : undefined,
    layout: {
      columns: columns ? Math.min(12, Math.max(1, Math.round(columns))) : undefined,
      maxWidth: maxWidth ? Math.min(3840, Math.max(480, maxWidth)) : undefined,
      gap: spacing !== undefined ? Math.max(12, spacing * 2) : undefined,
      centered: bool(p.centeredLayout),
      showAdd: bool(p.showAddButton),
      showTitle: bool(bm.showTitle),
      showVisits: bool(bm.showVisits),
      alignTitle: ['left', 'center', 'right'].includes(String(bm.alignTitle))
        ? (bm.alignTitle as Settings['layout']['alignTitle'])
        : undefined,
      radius: RADIUS[String(bm.borderRadius)],
      padding: RADIUS[String(bm.padding)] as Settings['layout']['padding'] | undefined,
    },
    behavior: {
      openInNewTab: bool(p.openInNewTab),
      keepActiveGroup: bool(p.keepActiveGroup),
      orderBy: (['manual', 'visits', 'title', 'created'] as const).find((o) => o === p.orderBy),
      orderGroupsBy: p.orderGroupsBy === 'title' ? 'title' : p.orderGroupsBy === 'manual' ? 'manual' : undefined,
      contextMenu: bool(p.contextMenu),
    },
    background: image
      ? {
          kind: 'image',
          imageUrl: image,
          opacity: opacity !== undefined ? Math.min(1, Math.max(0, opacity / 100)) : undefined,
          size: typeof dark.backgroundSize === 'string' ? dark.backgroundSize : undefined,
          position: typeof dark.backgroundPosition === 'string' ? dark.backgroundPosition : undefined,
          repeat: typeof dark.backgroundRepeat === 'string' ? dark.backgroundRepeat : undefined,
        }
      : undefined,
  };
}

export interface ImportOptions {
  mode: 'replace' | 'merge';
  cleanTitles: boolean;
  now?: number;
  idGen?: () => string;
}

export interface ThumbJob {
  dialId: string;
  url: string;
  /** Živý obrázek ze SD2, zkusí se jako první. */
  imageUrl?: string;
}

export interface ImportResult {
  groups: Group[];
  dials: Dial[];
  settingsPatch: DeepPartial<Settings>;
  thumbJobs: ThumbJob[];
  stats: {
    groupsAdded: number;
    groupsMerged: number;
    dialsAdded: number;
    duplicatesSkipped: number;
    titlesCleaned: number;
    removed: number;
  };
}

/**
 * Vrátí nový kompletní stav skupin a odkazů.
 * - NAHRADIT: stávající záznamy se měkce smažou (deletedAt, kvůli pozdější synchronizaci)
 *   a export se převezme 1:1 včetně případných duplicit (jako v SD2).
 * - SLOUČIT: skupiny se párují podle názvu, odkazy s už existující normalizovanou URL
 *   (i duplicity uvnitř exportu) se přeskočí.
 */
export function importSd2(
  x: Sd2Export,
  existing: { groups: Group[]; dials: Dial[] },
  opts: ImportOptions,
): ImportResult {
  const now = opts.now ?? Date.now();
  const id = opts.idGen ?? newId;
  const stats: ImportResult['stats'] = {
    groupsAdded: 0,
    groupsMerged: 0,
    dialsAdded: 0,
    duplicatesSkipped: 0,
    titlesCleaned: 0,
    removed: 0,
  };

  let groups: Group[];
  let dials: Dial[];
  if (opts.mode === 'replace') {
    groups = existing.groups.map((g) => (g.deletedAt ? g : { ...g, deletedAt: now, updatedAt: now }));
    dials = existing.dials.map((d) => (d.deletedAt ? d : { ...d, deletedAt: now, updatedAt: now }));
    stats.removed = existing.dials.filter((d) => !d.deletedAt).length;
  } else {
    groups = existing.groups.map((g) => ({ ...g }));
    dials = existing.dials.map((d) => ({ ...d }));
  }

  const live = <T extends { deletedAt?: number }>(arr: T[]) => arr.filter((a) => !a.deletedAt);
  const seen = new Set(live(dials).map((d) => normalizeUrl(d.url)));
  const thumbJobs: ThumbJob[] = [];

  // Skupiny
  const sdGroups = orderedSd2Groups(x.groups);
  const groupMap = new Map<string, Group>();
  const toAppend: Sd2Group[] = [];
  for (const g of sdGroups) {
    const match =
      opts.mode === 'merge'
        ? live(groups).find((e) => e.title.trim().toLowerCase() === g.title.trim().toLowerCase())
        : undefined;
    if (match) {
      groupMap.set(String(g.id), match);
      stats.groupsMerged++;
    } else {
      toAppend.push(g);
    }
  }
  const groupKeys = keysBetween(live(groups).length ? keyAfterLast(live(groups)) : null, null, toAppend.length);
  toAppend.forEach((g, i) => {
    const created: Group = {
      id: id(),
      title: g.title.trim() || 'Bez názvu',
      color: g.color || undefined,
      pos: groupKeys[i],
      createdAt: now,
      updatedAt: now,
      legacyId: String(g.id),
    };
    groups.push(created);
    groupMap.set(String(g.id), created);
    stats.groupsAdded++;
  });

  // Odkazy po skupinách (sirotci jdou do první skupiny)
  const fallbackGroup = groupMap.get(String(sdGroups[0]?.id));
  const byGroup = new Map<string, Sd2Dial[]>();
  for (const d of x.dials) {
    const target = groupMap.get(String(d.idgroup)) ?? fallbackGroup;
    if (!target) continue;
    const list = byGroup.get(target.id) ?? [];
    list.push(d);
    byGroup.set(target.id, list);
  }

  for (const [groupId, list] of byGroup) {
    const accepted: Sd2Dial[] = [];
    for (const d of orderedSd2Dials(list)) {
      const url = safeUrl(d.url);
      if (!url) continue;
      if (opts.mode === 'merge') {
        const key = normalizeUrl(url.href);
        if (seen.has(key)) {
          stats.duplicatesSkipped++;
          continue;
        }
        seen.add(key);
      }
      accepted.push(d);
    }
    const inGroup = sortByPos(live(dials).filter((e) => e.groupId === groupId));
    const keys = keysBetween(inGroup.length ? inGroup[inGroup.length - 1].pos : null, null, accepted.length);
    accepted.forEach((d, i) => {
      const url = safeUrl(d.url)!.href;
      let title = (d.title ?? '').trim();
      if (opts.cleanTitles) {
        const t = tidyTitle(title, d.url);
        if (t.changed) stats.titlesCleaned++;
        title = t.title;
      }
      const created = d.ts_created ? d.ts_created * 1000 : now;
      const dial: Dial = {
        id: id(),
        groupId,
        title: title || url,
        // lidský titulek ze SD2 je zamčený, strojový se smí přepočítat z URL
        titleLocked: !isMachineTitle(d.title ?? '', d.url),
        url,
        pos: keys[i],
        visits: d.visits ?? 0,
        visitsByDaypart: {
          morning: d.visits_morning ?? 0,
          afternoon: d.visits_afternoon ?? 0,
          evening: d.visits_evening ?? 0,
          night: d.visits_night ?? 0,
        },
        createdAt: created,
        updatedAt: now,
        legacyId: String(d.id),
      };
      dials.push(dial);
      stats.dialsAdded++;
      const state = thumbState(d.thumbnail);
      thumbJobs.push({ dialId: dial.id, url, imageUrl: state === 'live' ? d.thumbnail! : undefined });
    });
  }

  return { groups, dials, settingsPatch: mapSd2Preferences(x.preferences), thumbJobs, stats };
}
