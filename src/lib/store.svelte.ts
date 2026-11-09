import type { DeepPartial, Dial, Group, Meta, Settings, Snapshot, ThumbRef } from './model';
import { daypartOf, defaultSettings, mergeSettings, newId } from './model';
import { createDial, createGroup, editDial, posForIndex, type DialInput, type DialPatch } from './ops';
import { platform } from './platform';
import { makeSnapshot, needsDailySnapshot, pushSnapshot, restoreFromSnapshot } from './snapshots';
import type { BackupImportResult } from './import/backup';
import {
  STORAGE_KEYS,
  migrate,
  orderDials,
  orderGroups,
  type PersistedState,
  type StorageKey,
  type SyncState,
} from './state-utils';
import type { ImportResult } from './import/sd2';

/** Klíče s daty, která se synchronizují (změna = podnět pro synchronizaci). */
const DATA_KEYS = new Set<StorageKey>(['groups', 'dials', 'settings']);

/** Globální stav nové záložky (Svelte 5 runes). Zápis jde vždy přes metody. */
class Store {
  meta = $state<Meta | null>(null);
  groups = $state<Group[]>([]);
  dials = $state<Dial[]>([]);
  settings = $state<Settings>(defaultSettings());
  snapshots = $state<Snapshot[]>([]);
  syncState = $state<SyncState>({ enabled: false });
  /** Odkazy přidané mimo novou záložku, čekají na resolver log. */
  thumbQueue = $state<string[]>([]);
  activeGroupId = $state<string | null>(null);
  loaded = $state(false);
  /** Průběh resolveru náhledů (pro stavový řádek). */
  jobs = $state<{ done: number; total: number; running: boolean }>({ done: 0, total: 0, running: false });

  liveGroups = $derived(orderGroups(this.groups.filter((g) => !g.deletedAt), this.settings.behavior.orderGroupsBy));
  liveDials = $derived(this.dials.filter((d) => !d.deletedAt));
  activeGroup = $derived(this.liveGroups.find((g) => g.id === this.activeGroupId) ?? this.liveGroups[0] ?? null);
  activeDials = $derived(
    this.activeGroup
      ? orderDials(
          this.liveDials.filter((d) => d.groupId === this.activeGroup!.id),
          this.settings.behavior.orderBy,
        )
      : [],
  );
  countByGroup = $derived.by(() => {
    const m = new Map<string, number>();
    for (const d of this.liveDials) m.set(d.groupId, (m.get(d.groupId) ?? 0) + 1);
    return m;
  });

  private pending = new Set<StorageKey>();
  private pendingLoud = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Změnily se skupiny, odkazy nebo nastavení: `local` = v této stránce, `external` = jiná
   * karta, service worker nebo popup. Na to se věší synchronizace a fronta náhledů.
   */
  onDataChange: ((source: 'local' | 'external') => void) | null = null;

  async init(): Promise<void> {
    const raw = (await platform.kv.getMany([...STORAGE_KEYS])) as PersistedState;
    this.apply(raw, false);
    if (!raw.meta) await this.persist(['meta']);
    if (this.liveDials.length && needsDailySnapshot(this.snapshots)) {
      this.snapshots = pushSnapshot(this.snapshots, makeSnapshot(this.groups, this.dials, 'daily'));
      await this.persist(['snapshots']);
    }
    platform.kv.onExternalChange(async (keys) => {
      const fresh = (await platform.kv.getMany([...STORAGE_KEYS])) as PersistedState;
      this.apply(fresh, true);
      if (keys.some((k) => DATA_KEYS.has(k as StorageKey) || k === 'thumbQueue')) this.onDataChange?.('external');
    });
    this.loaded = true;
  }

  private apply(raw: PersistedState, external: boolean): void {
    const data = migrate(raw);
    this.meta = data.meta;
    this.groups = data.groups;
    this.dials = data.dials;
    this.settings = data.settings;
    this.snapshots = data.snapshots;
    this.syncState = data.sync;
    this.thumbQueue = data.thumbQueue;
    if (!external) this.activeGroupId = data.settings.behavior.keepActiveGroup ? data.ui.activeGroupId : null;
  }

  private value(key: StorageKey): unknown {
    switch (key) {
      case 'meta':
        return $state.snapshot(this.meta);
      case 'groups':
        return $state.snapshot(this.groups);
      case 'dials':
        return $state.snapshot(this.dials);
      case 'settings':
        return $state.snapshot(this.settings);
      case 'snapshots':
        return $state.snapshot(this.snapshots);
      case 'ui':
        return { activeGroupId: this.activeGroupId };
      case 'sync':
        return $state.snapshot(this.syncState);
      case 'thumbQueue':
        return $state.snapshot(this.thumbQueue);
    }
  }

  /** Uloží klíče. `silent` = nehlásit změnu dat (zápis výsledku synchronizace). */
  async persist(keys: StorageKey[], silent = false): Promise<void> {
    const items: Record<string, unknown> = {};
    for (const k of keys) items[k] = this.value(k);
    await platform.kv.set(items);
    if (!silent && keys.some((k) => DATA_KEYS.has(k))) this.onDataChange?.('local');
  }

  /** Odložený zápis pro časté drobné změny (náhledy během resolveru, posuvníky). */
  persistSoon(keys: StorageKey[], silent = false): void {
    for (const k of keys) this.pending.add(k);
    if (!silent) this.pendingLoud = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const ks = [...this.pending];
      const loud = this.pendingLoud;
      this.pending.clear();
      this.pendingLoud = false;
      void this.persist(ks, !loud);
    }, 400);
  }

  setActiveGroup(id: string): void {
    this.activeGroupId = id;
    if (this.settings.behavior.keepActiveGroup) void this.persist(['ui']);
  }

  cycleGroup(delta: number): void {
    const list = this.liveGroups;
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((g) => g.id === this.activeGroup?.id));
    this.setActiveGroup(list[(i + delta + list.length) % list.length].id);
  }

  async recordVisit(dialId: string): Promise<void> {
    const d = this.dials.find((x) => x.id === dialId);
    if (!d) return;
    const part = daypartOf(new Date());
    d.visits += 1;
    d.visitsByDaypart = { morning: 0, afternoon: 0, evening: 0, night: 0, ...d.visitsByDaypart };
    d.visitsByDaypart[part] += 1;
    // updatedAt se nemění: návštěvy jsou lokální počítadlo a nesmí přebít úpravu z jiného počítače
    await this.persist(['dials'], true);
  }

  setThumb(dialId: string, thumb: ThumbRef): void {
    const d = this.dials.find((x) => x.id === dialId);
    if (!d) return;
    // náhled je lokální (nesynchronizuje se), updatedAt se proto nemění
    d.thumb = thumb;
    this.persistSoon(['dials'], true);
  }

  /** Použije výsledek importu. Předtím vždy uloží restore point. */
  async applyImport(result: ImportResult, reason: string): Promise<void> {
    if (this.dials.length) {
      this.snapshots = pushSnapshot(this.snapshots, makeSnapshot(this.groups, this.dials, reason));
    }
    this.groups = result.groups;
    this.dials = result.dials;
    this.settings = mergeSettings(this.settings, result.settingsPatch);
    this.touchSettings();
    const first = orderGroups(result.groups.filter((g) => !g.deletedAt), this.settings.behavior.orderGroupsBy)[0];
    this.activeGroupId = first?.id ?? null;
    await this.persist(['groups', 'dials', 'settings', 'meta', 'snapshots', 'ui']);
  }

  // ------------------------------------------------------------ nastavení

  /**
   * Změní nastavení a uloží ho. `soon` = odložený zápis (posuvníky, psaní do pole),
   * změna se v UI projeví hned.
   */
  updateSettings(patch: DeepPartial<Settings>, soon = false): void {
    this.settings = mergeSettings(this.settings, patch);
    this.touchSettings();
    if (soon) this.persistSoon(['settings', 'meta']);
    else void this.persist(['settings', 'meta']);
  }

  /** Poznamená čas změny nastavení (při synchronizaci vyhrává novější). */
  private touchSettings(): void {
    if (this.meta) this.meta.settingsUpdatedAt = Date.now();
  }

  /** Vrátí vybrané části nastavení na výchozí hodnoty (synchronizace zůstane). */
  resetSettings(sections: (keyof Settings)[]): void {
    const defaults = defaultSettings();
    const patch: Record<string, unknown> = {};
    for (const s of sections) if (s !== 'sync') patch[s] = defaults[s];
    this.settings = mergeSettings(this.settings, patch as DeepPartial<Settings>);
    this.touchSettings();
    void this.persist(['settings', 'meta']);
  }

  // ------------------------------------------------------------ restore points a zálohy

  /** Ruční restore point. */
  createSnapshot(reason = 'manual'): void {
    this.snapshots = pushSnapshot(this.snapshots, makeSnapshot(this.groups, this.dials, reason));
    void this.persist(['snapshots']);
  }

  deleteSnapshot(id: string): void {
    this.snapshots = this.snapshots.filter((s) => s.id !== id);
    void this.persist(['snapshots']);
  }

  /** Vrátí smazaný snapshot zpět (VRÁTIT po smazání). */
  putSnapshot(snap: Snapshot): void {
    if (this.snapshots.some((s) => s.id === snap.id)) return;
    this.snapshots = pushSnapshot(this.snapshots, snap);
    void this.persist(['snapshots']);
  }

  /**
   * Obnoví skupiny a odkazy ze snapshotu. Současný stav předtím uloží jako restore point
   * a vrátí jeho id (pro VRÁTIT), nebo null, když snapshot neexistuje.
   */
  async restoreSnapshot(id: string): Promise<string | null> {
    const snap = this.snapshots.find((s) => s.id === id);
    if (!snap) return null;
    const target = $state.snapshot(snap) as Snapshot;
    const current = { groups: $state.snapshot(this.groups) as Group[], dials: $state.snapshot(this.dials) as Dial[] };
    const before = makeSnapshot(current.groups, current.dials, 'before-restore');
    this.snapshots = pushSnapshot(this.snapshots, before);
    const next = restoreFromSnapshot(current, target);
    this.groups = next.groups;
    this.dials = next.dials;
    this.fixActiveGroup();
    await this.persist(['groups', 'dials', 'snapshots', 'ui']);
    return before.id;
  }

  /** Použije výsledek importu zálohy. Předtím uloží restore point. */
  async applyBackup(result: BackupImportResult, mode: 'replace' | 'merge', settings?: Settings): Promise<void> {
    if (this.liveDials.length) {
      this.snapshots = pushSnapshot(this.snapshots, makeSnapshot(this.groups, this.dials, `backup-${mode}`));
    }
    this.groups = result.groups;
    this.dials = result.dials;
    if (settings) {
      this.settings = mergeSettings(defaultSettings(), settings);
      this.touchSettings();
    }
    this.fixActiveGroup();
    await this.persist(['groups', 'dials', 'settings', 'meta', 'snapshots', 'ui']);
  }

  // ------------------------------------------------------------ synchronizace a fronta náhledů

  setSyncState(patch: Partial<SyncState>): void {
    this.syncState = { ...this.syncState, ...patch };
    void this.persist(['sync']);
  }

  /**
   * Zapíše výsledek synchronizace (bez hlášení změny, aby se synchronizace nespouštěla
   * sama sebou). `reason` = před zápisem uložit restore point.
   */
  async applySynced(next: {
    groups: Group[];
    dials: Dial[];
    settings?: Settings;
    settingsUpdatedAt?: number;
    reason?: string;
  }): Promise<void> {
    if (next.reason && this.liveDials.length) {
      this.snapshots = pushSnapshot(this.snapshots, makeSnapshot(this.groups, this.dials, next.reason));
    }
    this.groups = next.groups;
    this.dials = next.dials;
    if (next.settings) {
      this.settings = mergeSettings(defaultSettings(), next.settings);
      if (this.meta) this.meta.settingsUpdatedAt = next.settingsUpdatedAt ?? Date.now();
    }
    this.fixActiveGroup();
    await this.persist(['groups', 'dials', 'settings', 'meta', 'snapshots', 'ui'], true);
  }

  /** Odkazy pro resolver v nové záložce (přidané v popupu). */
  async enqueueThumbs(ids: string[]): Promise<void> {
    this.thumbQueue = [...this.thumbQueue, ...ids];
    await this.persist(['thumbQueue'], true);
  }

  /** Vybere frontu odkazů čekajících na náhled a vyprázdní ji. */
  takeThumbQueue(): string[] {
    if (!this.thumbQueue.length) return [];
    const ids = [...this.thumbQueue];
    this.thumbQueue = [];
    void this.persist(['thumbQueue'], true);
    return ids;
  }

  /** Když aktivní skupina zmizela, přepne na první živou. */
  private fixActiveGroup(): void {
    const ids = new Set(this.groups.filter((g) => !g.deletedAt).map((g) => g.id));
    if (!this.activeGroupId || !ids.has(this.activeGroupId)) this.activeGroupId = this.liveGroups[0]?.id ?? null;
  }

  /** Zahodí značky náhledů (resolver je pak najde znovu). Nemění `updatedAt`. */
  clearThumbRefs(ids: readonly string[]): void {
    const set = new Set(ids);
    for (const d of this.dials) if (set.has(d.id)) delete d.thumb;
    this.persistSoon(['dials'], true);
  }

  // ------------------------------------------------------------ úpravy

  dialById(id: string): Dial | undefined {
    return this.dials.find((d) => d.id === id && !d.deletedAt);
  }

  addDial(input: DialInput): Dial | null {
    const dial = createDial($state.snapshot(this.dials), input, Date.now(), newId());
    if (!dial) return null;
    this.dials.push(dial);
    void this.persist(['dials']);
    return dial;
  }

  /** Vrátí false při neplatné URL. */
  updateDial(id: string, patch: DialPatch): boolean {
    const i = this.dials.findIndex((d) => d.id === id);
    if (i < 0) return false;
    const next = editDial($state.snapshot(this.dials), $state.snapshot(this.dials[i]), patch, Date.now());
    if (!next) return false;
    this.dials[i] = next;
    void this.persist(['dials']);
    return true;
  }

  /** Měkké smazání. Vrací funkci pro vrácení (toast UNDO). */
  removeDial(id: string): () => void {
    const d = this.dials.find((x) => x.id === id);
    if (!d) return () => {};
    const now = Date.now();
    d.deletedAt = now;
    d.updatedAt = now;
    void this.persist(['dials']);
    return () => {
      const back = this.dials.find((x) => x.id === id);
      if (!back) return;
      delete back.deletedAt;
      back.updatedAt = Date.now();
      void this.persist(['dials']);
    };
  }

  /** Přesun odkazu (přetažení): do skupiny `groupId` na index `index` (bez indexu = na konec). */
  moveDial(id: string, groupId: string, index?: number): void {
    const d = this.dials.find((x) => x.id === id);
    if (!d) return;
    const target = this.liveDials
      .filter((x) => x.groupId === groupId)
      .sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0));
    d.pos = posForIndex(target, id, index ?? target.length);
    d.groupId = groupId;
    d.updatedAt = Date.now();
    void this.persist(['dials']);
  }

  addGroup(title: string): Group | null {
    const g = createGroup($state.snapshot(this.groups), title, Date.now(), newId());
    if (!g) return null;
    this.groups.push(g);
    this.activeGroupId = g.id;
    void this.persist(['groups', 'ui']);
    return g;
  }

  renameGroup(id: string, title: string): boolean {
    const g = this.groups.find((x) => x.id === id);
    const t = title.trim();
    if (!g || !t) return false;
    g.title = t;
    g.updatedAt = Date.now();
    void this.persist(['groups']);
    return true;
  }

  /** Smaže skupinu i s jejími odkazy (měkce). Vrací funkci pro vrácení. */
  removeGroup(id: string): () => void {
    const g = this.groups.find((x) => x.id === id);
    if (!g) return () => {};
    const now = Date.now();
    const dialIds = this.liveDials.filter((d) => d.groupId === id).map((d) => d.id);
    g.deletedAt = now;
    g.updatedAt = now;
    for (const d of this.dials) {
      if (dialIds.includes(d.id)) {
        d.deletedAt = now;
        d.updatedAt = now;
      }
    }
    if (this.activeGroupId === id) this.activeGroupId = this.liveGroups[0]?.id ?? null;
    void this.persist(['groups', 'dials', 'ui']);
    return () => {
      const back = this.groups.find((x) => x.id === id);
      if (back) delete back.deletedAt;
      for (const d of this.dials) if (dialIds.includes(d.id)) delete d.deletedAt;
      this.activeGroupId = id;
      void this.persist(['groups', 'dials', 'ui']);
    };
  }

  /** Jen pro vývoj: smaže všechna data. */
  async wipe(): Promise<void> {
    await platform.kv.remove([...STORAGE_KEYS]);
    this.apply({}, false);
    await this.persist(['meta']);
  }
}

export const store = new Store();
