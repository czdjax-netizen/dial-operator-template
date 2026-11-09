import type { Dial, Group, Settings } from './model';
import { cloneData } from './model';
import { normalizeUrl } from './url';

/**
 * Synchronizace mezi počítači přes úložiště typu klíč/hodnota (chrome.storage.sync).
 * Čisté funkce bez úložiště, engine (`sync-engine.svelte.ts`) je jen volá.
 *
 * Položky v úložišti:
 * - `meta`: { format, epoch }. Epocha se mění, když jeden počítač přepíše všechny ostatní.
 * - `settings`: { updatedAt, value }.
 * - `g.<id>`: skupina, `d.<id>`: odkaz bez náhledu a návštěv (ty jsou lokální).
 * Slučuje se po záznamech: vyhraje novější `updatedAt`, smazání (`deletedAt`) se přenáší.
 */

export const SYNC_FORMAT = 1;
/** Smazané záznamy se ze synchronizace uklidí po 30 dnech. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 3600 * 1000;

const GROUP = 'g.';
const DIAL = 'd.';
const SETTINGS = 'settings';
const META = 'meta';

export type SyncDial = Omit<Dial, 'thumb' | 'visits' | 'visitsByDaypart'>;

export interface SyncMeta {
  format: number;
  epoch: string;
}

export interface SyncSettings {
  updatedAt: number;
  value: Settings;
}

export interface RemoteState {
  meta?: SyncMeta;
  groups: Group[];
  dials: SyncDial[];
  settings?: SyncSettings;
}

export function isSyncKey(key: string): boolean {
  return key === META || key === SETTINGS || key.startsWith(GROUP) || key.startsWith(DIAL);
}

export function toSyncDial(d: Dial): SyncDial {
  const out = cloneData(d) as Partial<Dial>;
  delete out.thumb;
  delete out.visits;
  delete out.visitsByDaypart;
  return out as SyncDial;
}

export interface LocalSyncState {
  groups: readonly Group[];
  dials: readonly Dial[];
  settings: Settings;
  settingsUpdatedAt: number;
}

/** Položky, které mají být ve sync úložišti (bez smazaných starších než 30 dní). */
export function buildSyncItems(local: LocalSyncState, meta: SyncMeta, now = Date.now()): Record<string, unknown> {
  const keep = (x: { deletedAt?: number }) => !x.deletedAt || now - x.deletedAt < TOMBSTONE_TTL_MS;
  const items: Record<string, unknown> = { [META]: { format: meta.format, epoch: meta.epoch } };
  for (const g of local.groups) if (keep(g)) items[GROUP + g.id] = cloneData(g);
  for (const d of local.dials) if (keep(d)) items[DIAL + d.id] = toSyncDial(d);
  items[SETTINGS] = { updatedAt: local.settingsUpdatedAt, value: cloneData(local.settings) };
  return items;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validRecord = (v: unknown): boolean =>
  isObj(v) && typeof v.id === 'string' && typeof v.pos === 'string' && typeof v.updatedAt === 'number';

/** Přečte položky ze sync úložiště. Neznámé a poškozené položky přeskočí. */
export function parseSyncItems(items: Record<string, unknown>): RemoteState {
  const out: RemoteState = { groups: [], dials: [] };
  for (const [key, value] of Object.entries(items)) {
    if (key === META && isObj(value) && typeof value.epoch === 'string') {
      out.meta = { format: Number(value.format) || 0, epoch: value.epoch };
    } else if (key === SETTINGS && isObj(value) && isObj(value.value) && typeof value.updatedAt === 'number') {
      out.settings = { updatedAt: value.updatedAt, value: value.value as unknown as Settings };
    } else if (key.startsWith(GROUP) && validRecord(value) && typeof (value as Group).title === 'string') {
      out.groups.push(value as unknown as Group);
    } else if (
      key.startsWith(DIAL) &&
      validRecord(value) &&
      typeof (value as SyncDial).url === 'string' &&
      typeof (value as SyncDial).groupId === 'string'
    ) {
      out.dials.push(value as unknown as SyncDial);
    }
  }
  return out;
}

export function isRemoteEmpty(r: RemoteState): boolean {
  return !r.meta && !r.groups.length && !r.dials.length;
}

export interface MergeResult {
  groups: Group[];
  dials: Dial[];
  changed: boolean;
  /** Odkazy nové nebo se změněnou adresou: potřebují náhled. */
  pulled: string[];
}

/** Sloučí stav ze synchronizace do lokálního: u stejného id vyhraje novější `updatedAt`. */
export function mergeRemote(local: { groups: readonly Group[]; dials: readonly Dial[] }, remote: RemoteState): MergeResult {
  let changed = false;
  const pulled: string[] = [];

  const groups = local.groups.map((g) => ({ ...g }));
  const gIndex = new Map(groups.map((g, i) => [g.id, i]));
  for (const r of remote.groups) {
    const i = gIndex.get(r.id);
    if (i === undefined) {
      groups.push(cloneData(r));
      changed = true;
    } else if (r.updatedAt > groups[i].updatedAt) {
      groups[i] = cloneData(r);
      changed = true;
    }
  }

  const dials = local.dials.map((d) => ({ ...d }));
  const dIndex = new Map(dials.map((d, i) => [d.id, i]));
  for (const r of remote.dials) {
    const i = dIndex.get(r.id);
    if (i === undefined) {
      dials.push({ ...cloneData(r), visits: 0 });
      if (!r.deletedAt) pulled.push(r.id);
      changed = true;
    } else if (r.updatedAt > dials[i].updatedAt) {
      const l = dials[i];
      const sameUrl = l.url === r.url;
      const next: Dial = { ...cloneData(r), visits: l.visits };
      if (l.visitsByDaypart) next.visitsByDaypart = l.visitsByDaypart;
      if (sameUrl && l.thumb) next.thumb = l.thumb;
      dials[i] = next;
      if (!sameUrl && !r.deletedAt) pulled.push(r.id);
      changed = true;
    }
  }
  return { groups, dials, changed, pulled };
}

export type FirstSyncPlan = 'push' | 'pull' | 'merge' | 'ask';

/**
 * Co udělat při prvním připojení počítače:
 * - `push`: ve synchronizaci nic není, nahrát tenhle počítač,
 * - `pull`: tenhle počítač je prázdný, převzít,
 * - `merge`: data mají společný původ (stejná id), normálně sloučit,
 * - `ask`: obojí má data jiného původu (např. dva samostatné importy SD2), musí rozhodnout člověk.
 */
export function planFirstSync(local: { groups: readonly Group[]; dials: readonly Dial[] }, remote: RemoteState): FirstSyncPlan {
  if (isRemoteEmpty(remote)) return 'push';
  const liveLocal = local.dials.some((d) => !d.deletedAt) || local.groups.some((g) => !g.deletedAt);
  if (!liveLocal) return 'pull';
  const remoteIds = new Set([...remote.groups.map((g) => g.id), ...remote.dials.map((d) => d.id)]);
  const overlap = local.groups.some((g) => remoteIds.has(g.id)) || local.dials.some((d) => remoteIds.has(d.id));
  return overlap ? 'merge' : 'ask';
}

/**
 * Převezme stav ze synchronizace místo lokálního (lokální záznamy jiného původu zmizí,
 * předtím se ukládá restore point). Návštěvy se zachovají podle adresy.
 */
export function adoptRemote(local: { dials: readonly Dial[] }, remote: RemoteState): { groups: Group[]; dials: Dial[] } {
  const visits = new Map<string, Dial>();
  for (const d of local.dials) if (!d.deletedAt) visits.set(normalizeUrl(d.url), d);
  return {
    groups: cloneData(remote.groups),
    dials: remote.dials.map((r) => {
      const old = visits.get(normalizeUrl(r.url));
      const d: Dial = { ...cloneData(r), visits: old?.visits ?? 0 };
      if (old?.visitsByDaypart) d.visitsByDaypart = old.visitsByDaypart;
      return d;
    }),
  };
}

const updatedAtOf = (v: unknown): number => (isObj(v) && typeof v.updatedAt === 'number' ? v.updatedAt : -1);

/**
 * Co zapsat do sync úložiště. Záznam se zapíše, jen když ve vzdáleném stavu chybí, nebo
 * je lokální novější (nikdy se nepřepíše novější vzdálený, ani stejný s jinou podobou,
 * aby se dva počítače nepřetahovaly). `meta` se zapíše při změně epochy.
 * Smažou se vzdálené klíče, které v požadovaném stavu nejsou (uklizená smazání).
 */
export function diffSyncItems(
  remote: Record<string, unknown>,
  desired: Record<string, unknown>,
): { set: Record<string, unknown>; remove: string[] } {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    const cur = remote[key];
    if (key === META) {
      if (!isObj(cur) || cur.epoch !== (value as SyncMeta).epoch) set[key] = value;
    } else if (cur === undefined || updatedAtOf(value) > updatedAtOf(cur)) {
      set[key] = value;
    }
  }
  const remove = Object.keys(remote).filter((k) => isSyncKey(k) && !(k in desired));
  return { set, remove };
}

/** Velikost položek tak, jak ji počítá chrome.storage.sync (klíč + JSON hodnoty, v bajtech). */
export function itemBytes(key: string, value: unknown): number {
  return new TextEncoder().encode(key + JSON.stringify(value)).length;
}

export function totalBytes(items: Record<string, unknown>): number {
  let n = 0;
  for (const [k, v] of Object.entries(items)) n += itemBytes(k, v);
  return n;
}
