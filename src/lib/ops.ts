import type { Dial, Group } from './model';
import { keyAfterLast, keyBetween } from './order';
import { orderGroups } from './state-utils';
import { cleanTitle } from './titles';
import { normalizeUrl, safeUrl } from './url';

/**
 * Čisté operace nad skupinami a odkazy (bez úložiště, testovatelné).
 * Store je volá a výsledek uloží.
 */

const live = <T extends { deletedAt?: number }>(items: readonly T[]) => items.filter((x) => !x.deletedAt);

export interface DialInput {
  url: string;
  /** Prázdný = odvodí se z URL a nebude zamčený. */
  title?: string;
  groupId: string;
}

export function createDial(dials: readonly Dial[], input: DialInput, now: number, id: string): Dial | null {
  const u = safeUrl(input.url);
  if (!u) return null;
  const title = input.title?.trim() ?? '';
  return {
    id,
    groupId: input.groupId,
    url: u.href,
    title: title || cleanTitle(u.href),
    titleLocked: !!title,
    pos: keyAfterLast(live(dials).filter((d) => d.groupId === input.groupId)),
    visits: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface DialPatch {
  url?: string;
  title?: string;
  groupId?: string;
}

/** Vrátí upravenou kopii odkazu, nebo null při neplatné URL. */
export function editDial(dials: readonly Dial[], dial: Dial, patch: DialPatch, now: number): Dial | null {
  const next: Dial = { ...dial, updatedAt: now };
  if (patch.url !== undefined) {
    const u = safeUrl(patch.url);
    if (!u) return null;
    if (u.href !== dial.url) {
      next.url = u.href;
      next.thumb = undefined; // nová adresa = nové logo
    }
  }
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    next.title = t || cleanTitle(next.url);
    next.titleLocked = !!t;
  } else if (!dial.titleLocked && next.url !== dial.url) {
    next.title = cleanTitle(next.url);
  }
  if (patch.groupId && patch.groupId !== dial.groupId) {
    next.groupId = patch.groupId;
    next.pos = keyAfterLast(live(dials).filter((d) => d.groupId === patch.groupId && d.id !== dial.id));
  }
  return next;
}

/**
 * Klíč pro umístění položky na index `to` v seřazeném seznamu (počítáno bez ní samotné).
 * Pro přetahování: ostatní položky se nepřečíslují.
 */
export function posForIndex<T extends { id: string; pos: string }>(sorted: readonly T[], movingId: string, to: number): string {
  const others = sorted.filter((x) => x.id !== movingId);
  const i = Math.max(0, Math.min(to, others.length));
  return keyBetween(others[i - 1]?.pos ?? null, others[i]?.pos ?? null);
}

export function createGroup(groups: readonly Group[], title: string, now: number, id: string): Group | null {
  const t = title.trim();
  if (!t) return null;
  return { id, title: t, pos: keyAfterLast(live(groups)), createdAt: now, updatedAt: now };
}

export interface QuickAddInput {
  url: string;
  /** Titulek stránky; prázdný nebo stejný jako adresa = odvodit z adresy. */
  title?: string;
  /** Skupina, kterou má uživatel otevřenou (z `ui.activeGroupId`). */
  activeGroupId?: string | null;
  orderGroupsBy?: 'manual' | 'title';
}

export interface QuickAddResult {
  groups: Group[];
  dials: Dial[];
  /** Přidaný odkaz, nebo null (neplatná adresa nebo duplicita). */
  dial: Dial | null;
  /** Odkaz se stejnou adresou, který už existuje. */
  duplicateOf?: Dial;
}

/**
 * Přidání odkazu zvenku (menu prohlížeče): do otevřené skupiny, jinak do první,
 * a když žádná není, založí „Domů“. Adresa, která už v odkazech je, se nepřidá.
 */
export function quickAdd(
  groups: readonly Group[],
  dials: readonly Dial[],
  input: QuickAddInput,
  now: number,
  idGen: () => string,
): QuickAddResult {
  const u = safeUrl(input.url);
  if (!u) return { groups: [...groups], dials: [...dials], dial: null };
  const key = normalizeUrl(u.href);
  const duplicateOf = live(dials).find((d) => normalizeUrl(d.url) === key);
  if (duplicateOf) return { groups: [...groups], dials: [...dials], dial: null, duplicateOf };

  const outGroups = [...groups];
  const liveGroups = orderGroups(live(groups), input.orderGroupsBy ?? 'manual');
  let group = liveGroups.find((g) => g.id === input.activeGroupId) ?? liveGroups[0];
  if (!group) {
    group = createGroup(groups, 'Domů', now, idGen())!;
    outGroups.push(group);
  }
  const raw = (input.title ?? '').trim();
  const title = raw && raw !== input.url && raw !== u.href ? raw : '';
  const dial = createDial(dials, { url: u.href, title, groupId: group.id }, now, idGen());
  return { groups: outGroups, dials: dial ? [...dials, dial] : [...dials], dial };
}
