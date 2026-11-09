import { buildBackup, backupFileName, importBackup, type BackupFile, type BackupThumb } from './import/backup';
import { cloneData } from './model';
import { platform } from './platform';
import { store } from './store.svelte';
import { runThumbJobs } from './thumb-jobs';
import { base64ToBlob, blobToBase64, getAllThumbs, putThumb } from './thumbs';

/** Záloha do souboru a zpět: spojuje čistou logiku (import/backup.ts) se store a IndexedDB. */

export interface ExportInfo {
  name: string;
  bytes: number;
  groups: number;
  dials: number;
  thumbs: number;
}

/** Sestaví zálohu aktuálního stavu (volitelně s obrázky náhledů). */
export async function createBackup(withImages: boolean): Promise<BackupFile> {
  const thumbs: BackupThumb[] = [];
  if (withImages) {
    for (const r of await getAllThumbs()) {
      thumbs.push({
        dialId: r.dialId,
        kind: r.kind,
        source: r.source,
        updatedAt: r.updatedAt,
        mime: r.blob.type || 'image/webp',
        data: await blobToBase64(r.blob),
      });
    }
  }
  return buildBackup(
    {
      groups: cloneData(store.groups),
      dials: cloneData(store.dials),
      settings: cloneData(store.settings),
      deviceId: store.meta?.deviceId ?? '',
    },
    thumbs,
  );
}

/** Vytvoří zálohu a nabídne ji ke stažení. */
export async function downloadBackup(withImages: boolean): Promise<ExportInfo> {
  const file = await createBackup(withImages);
  const json = JSON.stringify(file);
  const blob = new Blob([json], { type: 'application/json' });
  const name = backupFileName(file.exportedAt);
  platform.saveFile(name, blob);
  return { name, bytes: blob.size, groups: file.groups.length, dials: file.dials.length, thumbs: file.thumbs.length };
}

/**
 * Převezme zálohu. Obrázky se zapíšou do IndexedDB dřív než do stavu, aby je dlaždice
 * hned našly. Odkazy bez obrázku projde resolver na pozadí.
 */
export async function restoreBackup(file: BackupFile, mode: 'replace' | 'merge', withSettings: boolean) {
  const result = importBackup(file, { groups: cloneData(store.groups), dials: cloneData(store.dials) }, { mode });
  for (const t of result.thumbs) {
    try {
      await putThumb({
        dialId: t.dialId,
        blob: base64ToBlob(t.data, t.mime),
        kind: t.kind,
        source: t.source,
        updatedAt: t.updatedAt,
      });
    } catch {
      // poškozený obrázek: odkaz dostane glyph přes resolver
      result.thumbJobs.push({ dialId: t.dialId, url: result.dials.find((d) => d.id === t.dialId)?.url ?? '' });
    }
  }
  await store.applyBackup(result, mode, withSettings && file.settings ? file.settings : undefined);
  const jobs = result.thumbJobs.filter((j) => j.url);
  if (jobs.length) {
    store.clearThumbRefs(jobs.map((j) => j.dialId));
    void runThumbJobs(jobs);
  }
  return { stats: result.stats, images: result.thumbs.length, jobs: jobs.length };
}
