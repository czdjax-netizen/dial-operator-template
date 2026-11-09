import type { DeepPartial, Dial, Group, Meta, OrderBy, Settings, Snapshot } from './model';
import { SCHEMA_VERSION, defaultSettings, mergeSettings, newId } from './model';
import { compareKeys, sortByPos } from './order';

/** Klíče v úložišti (chrome.storage.local / localStorage s prefixem). */
export const STORAGE_KEYS = ['meta', 'groups', 'dials', 'settings', 'ui', 'snapshots', 'sync', 'thumbQueue'] as const;
export type StorageKey = (typeof STORAGE_KEYS)[number];

export interface UiState {
  activeGroupId: string | null;
}

/** Stav synchronizace tohoto počítače (lokální, nesynchronizuje se). */
export interface SyncState {
  enabled: boolean;
  /** Epocha synchronizace, ke které je počítač připojený (viz src/lib/sync.ts). */
  epoch?: string;
  lastSyncAt?: number;
}

export interface PersistedState {
  meta?: Meta;
  groups?: Group[];
  dials?: Dial[];
  settings?: DeepPartial<Settings>;
  ui?: Partial<UiState>;
  snapshots?: Snapshot[];
  sync?: Partial<SyncState>;
  /** Odkazy přidané mimo novou záložku (menu prohlížeče, popup), čekají na resolver log. */
  thumbQueue?: string[];
}

export interface AppData {
  meta: Meta;
  groups: Group[];
  dials: Dial[];
  settings: Settings;
  ui: UiState;
  snapshots: Snapshot[];
  sync: SyncState;
  thumbQueue: string[];
}

/**
 * Načte uložený stav a převede ho na aktuální schéma.
 * Nová verze schématu = nový krok migrace tady + test v tests/state-utils.test.ts.
 */
export function migrate(raw: PersistedState, now = Date.now()): AppData {
  const meta: Meta = raw.meta?.deviceId
    ? { ...raw.meta, schemaVersion: SCHEMA_VERSION }
    : { schemaVersion: SCHEMA_VERSION, deviceId: newId(), createdAt: now };
  return {
    meta,
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    dials: Array.isArray(raw.dials)
      ? raw.dials.map((d) => ({ ...d, visits: Number.isFinite(d.visits) ? d.visits : 0 }))
      : [],
    settings: mergeSettings(defaultSettings(), raw.settings),
    ui: { activeGroupId: raw.ui?.activeGroupId ?? null },
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    sync: {
      enabled: raw.sync?.enabled === true,
      epoch: typeof raw.sync?.epoch === 'string' ? raw.sync.epoch : undefined,
      lastSyncAt: typeof raw.sync?.lastSyncAt === 'number' ? raw.sync.lastSyncAt : undefined,
    },
    thumbQueue: Array.isArray(raw.thumbQueue) ? raw.thumbQueue.filter((x) => typeof x === 'string') : [],
  };
}

export function orderDials(dials: readonly Dial[], orderBy: OrderBy): Dial[] {
  switch (orderBy) {
    case 'visits':
      return [...dials].sort((a, b) => b.visits - a.visits || compareKeys(a.pos, b.pos));
    case 'title':
      return [...dials].sort((a, b) => a.title.localeCompare(b.title, 'cs') || compareKeys(a.pos, b.pos));
    case 'created':
      return [...dials].sort((a, b) => b.createdAt - a.createdAt || compareKeys(a.pos, b.pos));
    default:
      return sortByPos(dials);
  }
}

export function orderGroups(groups: readonly Group[], orderBy: 'manual' | 'title'): Group[] {
  return orderBy === 'title' ? [...groups].sort((a, b) => a.title.localeCompare(b.title, 'cs')) : sortByPos(groups);
}

/** Text pro hledání: malá písmena bez diakritiky. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Filtr pro terminál: všechna slova dotazu musí být v titulku nebo URL. */
export function searchDials(dials: readonly Dial[], query: string): Dial[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { d: Dial; score: number }[] = [];
  for (const d of dials) {
    const title = fold(d.title);
    const url = fold(d.url.replace(/^https?:\/\/(www\.)?/, ''));
    if (!words.every((w) => title.includes(w) || url.includes(w))) continue;
    const first = words[0];
    const score =
      (title.startsWith(first) ? 1000 : 0) + (url.startsWith(first) ? 500 : 0) + Math.min(d.visits, 499);
    scored.push({ d, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.d);
}
