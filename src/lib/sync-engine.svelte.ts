import type { Dial, Group } from './model';
import { newId } from './model';
import { platform, type SyncArea } from './platform';
import { store } from './store.svelte';
import {
  SYNC_FORMAT,
  adoptRemote,
  buildSyncItems,
  diffSyncItems,
  isRemoteEmpty,
  isSyncKey,
  itemBytes,
  mergeRemote,
  parseSyncItems,
  planFirstSync,
  totalBytes,
  type RemoteState,
} from './sync';
import { runThumbJobs } from './thumb-jobs';
import { getThumb, putThumb } from './thumbs';
import { normalizeUrl } from './url';

/**
 * Engine synchronizace: kdy synchronizovat a co udělat při prvním připojení.
 * Logika slučování je v `sync.ts` (čisté funkce s testy).
 *
 * Průběh jednoho kola: přečíst sync úložiště, sloučit do lokálního stavu (novější vyhrává),
 * zapsat zpět jen to, co je tady novější. Spouští se po startu, po změně dat na tomto
 * počítači (s odkladem 1,5 s) a po změně ve sync úložišti.
 */

export type SyncStatus = 'unavailable' | 'off' | 'syncing' | 'ok' | 'needs-choice' | 'quota' | 'error';

class SyncEngine {
  status = $state<SyncStatus>('off');
  message = $state('');
  /** Co je ve synchronizaci, když se musí rozhodnout člověk. */
  remoteSummary = $state<{ groups: number; dials: number } | null>(null);
  usage = $state<{ bytes: number; quota: number } | null>(null);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private again = false;
  private unsubscribe: (() => void) | null = null;

  get available(): boolean {
    return !!platform.syncArea;
  }

  get kind(): 'chrome' | 'dev' | null {
    return platform.syncArea?.kind ?? null;
  }

  /** Spustí synchronizaci, pokud je na tomto počítači zapnutá. */
  start(): void {
    if (!platform.syncArea) {
      this.status = 'unavailable';
      return;
    }
    if (!store.syncState.enabled) {
      this.status = 'off';
      return;
    }
    this.unsubscribe ??= platform.syncArea.onChange(() => this.schedule(400));
    this.schedule(0);
  }

  enable(): void {
    store.setSyncState({ enabled: true });
    this.start();
  }

  disable(): void {
    store.setSyncState({ enabled: false });
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearTimeout(this.timer);
    this.status = this.available ? 'off' : 'unavailable';
    this.message = '';
    this.remoteSummary = null;
  }

  /** Data se změnila na tomto počítači: odeslat s odkladem. */
  notify(): void {
    if (store.syncState.enabled && platform.syncArea) this.schedule(1500);
  }

  /** Rozhodnutí při prvním připojení: `remote` = převzít, `local` = přepsat ostatní počítače. */
  choose(choice: 'remote' | 'local'): Promise<void> {
    return this.run(choice);
  }

  syncNow(): Promise<void> {
    return this.run();
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async run(choice?: 'remote' | 'local'): Promise<void> {
    const area = platform.syncArea;
    if (!area || !store.syncState.enabled) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.status = 'syncing';
    try {
      await this.cycle(area, choice);
    } catch (err) {
      this.message = (err as Error)?.message ?? String(err);
      this.status = /quota/i.test(this.message) ? 'quota' : 'error';
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(300);
      }
    }
  }

  private local(): { groups: Group[]; dials: Dial[] } {
    return { groups: $state.snapshot(store.groups) as Group[], dials: $state.snapshot(store.dials) as Dial[] };
  }

  private async cycle(area: SyncArea, choice?: 'remote' | 'local'): Promise<void> {
    const raw = await area.getAll();
    const remote = parseSyncItems(raw);
    const known = store.syncState.epoch;
    let epoch: string;
    let overwrite = false;

    if (choice === 'local') {
      // tento počítač přepíše všechny ostatní: nová epocha
      epoch = newId();
      overwrite = true;
    } else if (isRemoteEmpty(remote)) {
      epoch = known ?? newId();
    } else if (remote.meta && remote.meta.epoch === known) {
      epoch = known;
      await this.merge(remote);
    } else {
      // první připojení tohoto počítače, nebo jiný počítač synchronizaci přepsal (nová epocha)
      const plan = choice === 'remote' || known ? 'pull' : planFirstSync(this.local(), remote);
      if (plan === 'ask') {
        this.remoteSummary = {
          groups: remote.groups.filter((g) => !g.deletedAt).length,
          dials: remote.dials.filter((d) => !d.deletedAt).length,
        };
        this.status = 'needs-choice';
        this.message = '';
        return;
      }
      if (plan === 'pull') await this.adopt(remote);
      else await this.merge(remote);
      epoch = remote.meta?.epoch ?? newId();
    }
    this.remoteSummary = null;

    const local = this.local();
    const desired = buildSyncItems(
      {
        groups: local.groups,
        dials: local.dials,
        settings: $state.snapshot(store.settings),
        settingsUpdatedAt: store.meta?.settingsUpdatedAt ?? 0,
      },
      { format: SYNC_FORMAT, epoch },
    );
    const bytes = totalBytes(desired);
    this.usage = { bytes, quota: area.quotaBytes };
    const big = Object.entries(desired).find(([k, v]) => itemBytes(k, v) > area.quotaPerItem);
    if (bytes > area.quotaBytes * 0.95 || big) {
      this.status = 'quota';
      this.message = big
        ? `Záznam ${big[0]} je větší než ${area.quotaPerItem} B.`
        : `Data mají ${Math.round(bytes / 1024)} kB, limit synchronizace je ${Math.round(area.quotaBytes / 1024)} kB.`;
      return;
    }
    const diff = overwrite
      ? { set: desired, remove: Object.keys(raw).filter((k) => isSyncKey(k) && !(k in desired)) }
      : diffSyncItems(raw, desired);
    if (diff.remove.length) await area.remove(diff.remove);
    if (Object.keys(diff.set).length) await area.set(diff.set);
    store.setSyncState({ epoch, lastSyncAt: Date.now() });
    this.status = 'ok';
    this.message = '';
  }

  /** Běžné sloučení: novější záznamy ze synchronizace do lokálního stavu. */
  private async merge(remote: RemoteState): Promise<void> {
    const before = this.local();
    const m = mergeRemote(before, remote);
    const newerSettings = !!remote.settings && remote.settings.updatedAt > (store.meta?.settingsUpdatedAt ?? 0);
    if (!m.changed && !newerSettings) return;
    await store.applySynced({
      groups: m.groups,
      dials: m.dials,
      settings: newerSettings ? remote.settings!.value : undefined,
      settingsUpdatedAt: remote.settings?.updatedAt,
    });
    await this.thumbsFor(m.pulled, before.dials);
  }

  /** Převzetí stavu ze synchronizace místo lokálního (s restore pointem). */
  private async adopt(remote: RemoteState): Promise<void> {
    const before = this.local();
    const next = adoptRemote(before, remote);
    await store.applySynced({
      groups: next.groups,
      dials: next.dials,
      settings: remote.settings?.value,
      settingsUpdatedAt: remote.settings?.updatedAt,
      reason: 'before-sync',
    });
    await this.thumbsFor(
      next.dials.filter((d) => !d.deletedAt).map((d) => d.id),
      before.dials,
    );
  }

  /**
   * Náhledy pro odkazy ze synchronizace. Obrázky se nesynchronizují: když tu byl odkaz
   * se stejnou adresou (třeba z vlastního importu SD2), převezme se jeho obrázek, jinak resolver.
   */
  private async thumbsFor(ids: string[], before: Dial[]): Promise<void> {
    if (!ids.length) return;
    const byUrl = new Map(before.filter((d) => d.thumb).map((d) => [normalizeUrl(d.url), d]));
    const jobs: { dialId: string; url: string }[] = [];
    for (const id of ids) {
      const d = store.dials.find((x) => x.id === id);
      if (!d || d.deletedAt || d.thumb) continue;
      const old = byUrl.get(normalizeUrl(d.url));
      if (old?.thumb?.kind === 'glyph') {
        store.setThumb(id, { kind: 'glyph', updatedAt: Date.now() });
        continue;
      }
      const rec = old && old.id !== id ? await getThumb(old.id) : undefined;
      if (rec) {
        await putThumb({ ...rec, dialId: id });
        store.setThumb(id, { kind: rec.kind, source: rec.source, updatedAt: rec.updatedAt });
      } else {
        jobs.push({ dialId: id, url: d.url });
      }
    }
    if (jobs.length) void runThumbJobs(jobs);
  }
}

export const syncEngine = new SyncEngine();
