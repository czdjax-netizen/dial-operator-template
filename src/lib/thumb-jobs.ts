import type { ThumbJob } from './import/sd2';
import { resolveImage, resolveLogo, runPool, type ResolveResult } from './logo-resolver';
import { platform } from './platform';
import { store } from './store.svelte';
import { getThumb, putThumb } from './thumbs';
import { hostOf } from './url';

export const RESOLVER_CONCURRENCY = 6;

let activeRuns = 0;

export interface JobLine {
  ok: boolean;
  text: string;
}

/** Úlohy pro všechny odkazy, které zatím nemají žádný náhled ani glyph. */
export function missingThumbJobs(): ThumbJob[] {
  return store.liveDials.filter((d) => !d.thumb).map((d) => ({ dialId: d.id, url: d.url }));
}

export interface RunOptions {
  /** Když se nic nenajde a odkaz už obrázek má, nechat ho (místo glyphu). */
  keepOnFail?: boolean;
}

/** Projde úlohy resolverem (souběh 6), uloží obrázky do IndexedDB a značky do stavu. */
export async function runThumbJobs(
  jobs: ThumbJob[],
  onLine?: (line: JobLine) => void,
  opts: RunOptions = {},
): Promise<{ logos: number; glyphs: number }> {
  let logos = 0;
  let glyphs = 0;
  if (!jobs.length) return { logos, glyphs };
  // víc běhů najednou (import + nově přidaný odkaz) sdílí jedno počítadlo
  activeRuns++;
  store.jobs = { done: store.jobs.done, total: store.jobs.total + jobs.length, running: true };
  await runPool(jobs, RESOLVER_CONCURRENCY, async (job) => {
    const host = hostOf(job.url);
    let result: ResolveResult | null = null;
    try {
      if (job.imageUrl) result = await resolveImage(platform, job.imageUrl);
      if (!result?.ok) result = await resolveLogo(platform, job.url);
    } catch (err) {
      result = { ok: false, reason: (err as Error)?.message ?? 'error' };
    }
    const now = Date.now();
    if (result.ok) {
      const kind = result.via === 'direct' && !result.square ? 'custom' : 'logo';
      await putThumb({ dialId: job.dialId, blob: result.blob, kind, source: result.source, updatedAt: now });
      store.setThumb(job.dialId, { kind, source: result.source, updatedAt: now });
      logos++;
      onLine?.({ ok: true, text: `OK      ${host} (${result.via}, ${result.width} px)` });
    } else if (opts.keepOnFail && hasImage(job.dialId)) {
      onLine?.({ ok: false, text: `PONECHÁNO ${host} (${result.reason}), původní obrázek zůstává` });
    } else {
      store.setThumb(job.dialId, { kind: 'glyph', updatedAt: now });
      glyphs++;
      onLine?.({ ok: false, text: `INICIÁLY ${host} (${result.reason})` });
    }
    store.jobs = { ...store.jobs, done: store.jobs.done + 1 };
  }).finally(() => {
    activeRuns--;
    if (activeRuns === 0) store.jobs = { done: 0, total: 0, running: false };
  });
  return { logos, glyphs };
}

function hasImage(dialId: string): boolean {
  const kind = store.dials.find((d) => d.id === dialId)?.thumb?.kind;
  return !!kind && kind !== 'glyph';
}

/**
 * Opraví náhledy, které mají značku obrázku, ale obrázek v IndexedDB chybí (např. po obnově
 * restore pointu ze stavu před importem): značky zahodí a pustí na ně resolver.
 * S `includeNone` projde resolver i odkazy, které náhled nemají vůbec.
 * Vrací počet odkazů předaných resolveru.
 */
export async function repairMissingThumbs(includeNone = false): Promise<number> {
  const broken: string[] = [];
  for (const d of store.liveDials) {
    if (!d.thumb || d.thumb.kind === 'glyph') continue;
    if (!(await getThumb(d.id))) broken.push(d.id);
  }
  if (broken.length) store.clearThumbRefs(broken);
  const set = new Set(broken);
  const jobs = missingThumbJobs().filter((j) => includeNone || set.has(j.dialId));
  if (jobs.length) void runThumbJobs(jobs);
  return jobs.length;
}

/**
 * Odkazy přidané mimo novou záložku (menu prohlížeče, popup) čekají ve frontě,
 * resolver potřebuje DOM a canvas, takže běží až tady.
 */
export function processThumbQueue(): number {
  const ids = new Set(store.takeThumbQueue());
  const jobs = store.liveDials.filter((d) => ids.has(d.id) && !d.thumb).map((d) => ({ dialId: d.id, url: d.url }));
  if (jobs.length) void runThumbJobs(jobs);
  return jobs.length;
}
