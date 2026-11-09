import { detectSd2, importSd2 } from '../lib/import/sd2';
import { store } from '../lib/store.svelte';
import { runThumbJobs } from '../lib/thumb-jobs';
import { clearThumbs } from '../lib/thumbs';

/**
 * Jen pro `npm run dev`. Parametry v URL:
 * - `?seed=fixture` nahraje fixtures/sd2-sample.json
 * - `?wipe=1`       smaže všechna data i náhledy
 * - `&logos=0`      bez hledání log (jen iniciály)
 * Parametry se po použití z adresy odstraní.
 */
const SOURCES: Record<string, string> = {
  fixture: '/fixtures/sd2-sample.json',
};

export async function runDevSeed(): Promise<void> {
  const url = new URL(window.location.href);
  const seed = url.searchParams.get('seed');
  const wipe = url.searchParams.get('wipe');
  const logos = url.searchParams.get('logos') !== '0';
  if (!seed && !wipe) return;
  for (const p of ['seed', 'wipe', 'logos']) url.searchParams.delete(p);
  history.replaceState(null, '', url);

  if (wipe) {
    await clearThumbs();
    await store.wipe();
    console.info('[dev-seed] wiped');
  }
  if (!seed || !SOURCES[seed]) return;
  const json = await (await fetch(SOURCES[seed])).json();
  if (!detectSd2(json)) throw new Error(`[dev-seed] ${seed}: not an SD2 export`);
  const result = importSd2(json, { groups: [], dials: [] }, { mode: 'replace', cleanTitles: true });
  await clearThumbs();
  await store.wipe();
  await store.applyImport(result, `dev-seed-${seed}`);
  console.info('[dev-seed]', seed, result.stats);
  if (logos) {
    const r = await runThumbJobs(result.thumbJobs, (l) => console.debug('[resolver]', l.text));
    console.info('[dev-seed] thumbs', r);
  }
}
