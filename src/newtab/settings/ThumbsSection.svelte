<script lang="ts">
  import { platform } from '../../lib/platform';
  import { store } from '../../lib/store.svelte';
  import { repairMissingThumbs, runThumbJobs } from '../../lib/thumb-jobs';
  import { odkazu } from '../plural';
  import { ui } from '../ui.svelte';

  const counts = $derived.by(() => {
    let images = 0;
    let glyphs = 0;
    let none = 0;
    for (const d of store.liveDials) {
      if (!d.thumb) none++;
      else if (d.thumb.kind === 'glyph') glyphs++;
      else images++;
    }
    return { images, glyphs, none };
  });
  const busy = $derived(store.jobs.running);
  // ve web buildu bez dev proxy většinu log zablokuje CORS (v rozšíření to vyřeší oprávnění)
  const corsNote = !import.meta.env.DEV && platform.kind === 'web';

  function retryGlyphs() {
    const jobs = store.liveDials.filter((d) => d.thumb?.kind === 'glyph').map((d) => ({ dialId: d.id, url: d.url }));
    if (!jobs.length) return;
    store.clearThumbRefs(jobs.map((j) => j.dialId));
    void runThumbJobs(jobs);
    ui.showToast(`Znovu hledám logo pro ${jobs.length} ${odkazu(jobs.length)}`);
  }

  function reloadAll() {
    const jobs = store.liveDials.map((d) => ({ dialId: d.id, url: d.url }));
    if (!jobs.length) return;
    void runThumbJobs(jobs, undefined, { keepOnFail: true });
    ui.showToast(`Hledám loga pro ${jobs.length} ${odkazu(jobs.length)}`);
  }

  async function fillMissing() {
    const n = await repairMissingThumbs(true);
    ui.showToast(n ? `Doplňuji loga pro ${n} ${odkazu(n)}` : 'Náhledy: nic nechybí');
  }
</script>

<p class="note">
  Loga a obrázky: <span class="ok">{counts.images}</span> · Iniciály: {counts.glyphs} · Bez náhledu:
  <span class:warn={counts.none > 0}>{counts.none}</span>
</p>
{#if busy}
  <p class="note warn">Hledám loga: {store.jobs.done}/{store.jobs.total}</p>
{/if}

<div class="buttons">
  <button class="btn" type="button" disabled={busy || !counts.glyphs} onclick={retryGlyphs}>
    Znovu zkusit iniciály ({counts.glyphs})
  </button>
  <button class="btn" type="button" disabled={busy || !counts.none} onclick={fillMissing}>
    Doplnit chybějící ({counts.none})
  </button>
  <button class="btn" type="button" disabled={busy || !store.liveDials.length} onclick={reloadAll}>
    Znovu najít všechna loga
  </button>
</div>
<p class="note">
  Znovu najít všechna loga stáhne ikony všech odkazů ještě jednou. Když se u odkazu nic nenajde, původní obrázek
  zůstane.
</p>
<p class="note">Jednotlivé logo jde obnovit z menu dlaždice (⋯ nebo pravé tlačítko).</p>
{#if corsNote}
  <p class="note warn">Ve webové verzi bez vývojového serveru většinu log zablokuje CORS. V rozšíření to fungovat bude.</p>
{/if}
