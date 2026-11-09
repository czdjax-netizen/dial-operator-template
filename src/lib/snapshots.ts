import type { Dial, Group, Snapshot } from './model';
import { cloneData, newId } from './model';

/** Restore points: lokální snapshoty skupin a odkazů (bez obrázků). */

export const MAX_SNAPSHOTS = 20;

export function makeSnapshot(groups: Group[], dials: Dial[], reason: string, now = Date.now()): Snapshot {
  return {
    id: newId(),
    createdAt: now,
    reason,
    groups: cloneData(groups),
    dials: cloneData(dials),
  };
}

/** Přidá snapshot na začátek a ořízne seznam na `max` nejnovějších. */
export function pushSnapshot(list: readonly Snapshot[], snap: Snapshot, max = MAX_SNAPSHOTS): Snapshot[] {
  return [snap, ...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}

/** Potřebuje se dnes udělat denní snapshot? */
export function needsDailySnapshot(list: readonly Snapshot[], now = Date.now()): boolean {
  const day = new Date(now).toDateString();
  return !list.some((s) => s.reason === 'daily' && new Date(s.createdAt).toDateString() === day);
}

const LABELS: Record<string, string> = {
  daily: 'denní',
  manual: 'ručně',
  'before-restore': 'před obnovením',
  'import-replace': 'před importem SD2 (nahradit)',
  'import-merge': 'před importem SD2 (sloučit)',
  'backup-replace': 'před obnovou zálohy (nahradit)',
  'backup-merge': 'před obnovou zálohy (sloučit)',
  'before-sync': 'před převzetím synchronizace',
};

/** Popisek důvodu snapshotu pro UI. */
export function snapshotLabel(reason: string): string {
  if (LABELS[reason]) return LABELS[reason];
  if (reason.startsWith('dev-seed')) return `vývoj (${reason.slice('dev-seed-'.length) || 'seed'})`;
  return reason;
}

/** Počet živých skupin a odkazů ve snapshotu. */
export function snapshotCounts(s: Snapshot): { groups: number; dials: number } {
  const groups = new Set(s.groups.filter((g) => !g.deletedAt).map((g) => g.id));
  return { groups: groups.size, dials: s.dials.filter((d) => !d.deletedAt && groups.has(d.groupId)).length };
}

/** JSON se seřazenými klíči a bez undefined (pořadí klíčů se v objektech může lišit). */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

/** Porovnání záznamů bez `updatedAt` (to se při obnově mění vždy). */
function sameRecord(a: object, b: object): boolean {
  return stable({ ...a, updatedAt: 0 }) === stable({ ...b, updatedAt: 0 });
}

function restoreList<T extends { id: string; updatedAt: number; deletedAt?: number }>(
  current: readonly T[],
  snap: readonly T[],
  now: number,
): T[] {
  const inSnap = new Map(snap.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const cur of current) {
    const old = inSnap.get(cur.id);
    if (!old) {
      // vzniklo až po snapshotu
      out.push(cur.deletedAt ? cur : { ...cur, deletedAt: now, updatedAt: now });
    } else {
      out.push(sameRecord(cur, old) ? cur : { ...cloneData(old), updatedAt: now });
      inSnap.delete(cur.id);
    }
  }
  for (const old of inSnap.values()) out.push({ ...cloneData(old), updatedAt: now });
  return out;
}

/**
 * Vrátí skupiny a odkazy do stavu ze snapshotu. Změněné záznamy dostanou `updatedAt = now`
 * a co vzniklo až po snapshotu, se měkce smaže. Při pozdější synchronizaci tak obnova vyhraje.
 */
export function restoreFromSnapshot(
  current: { groups: readonly Group[]; dials: readonly Dial[] },
  snap: Snapshot,
  now = Date.now(),
): { groups: Group[]; dials: Dial[] } {
  return {
    groups: restoreList(current.groups, snap.groups, now),
    dials: restoreList(current.dials, snap.dials, now),
  };
}
