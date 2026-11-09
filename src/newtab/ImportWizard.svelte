<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { restoreBackup } from '../lib/backup-io';
  import { detectBackup, summarizeBackup, type BackupFile, type BackupSummary } from '../lib/import/backup';
  import { detectSd2, importSd2, summarizeSd2, type Sd2Export, type Sd2Summary } from '../lib/import/sd2';
  import { store } from '../lib/store.svelte';
  import { runThumbJobs } from '../lib/thumb-jobs';
  import { clearThumbs } from '../lib/thumbs';
  import { odkazu } from './plural';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  type Step = 'pick' | 'preview' | 'running' | 'done';
  const DEV = import.meta.env.DEV;

  let step = $state<Step>('pick');
  let error = $state('');
  let source = $state('');
  let data = $state.raw<Sd2Export | null>(null);
  let summary = $state<Sd2Summary | null>(null);
  /** Vlastní záloha aplikace (místo exportu SD2). */
  let backup = $state.raw<BackupFile | null>(null);
  let backupSummary = $state<BackupSummary | null>(null);
  let mode = $state<'replace' | 'merge'>(store.liveDials.length ? 'merge' : 'replace');
  let withSettings = $state(!store.liveDials.length);
  let cleanTitles = $state(true);
  let resolveLogos = $state(true);
  let lines = $state<{ ok: boolean; text: string }[]>([]);
  let dragging = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let logEl: HTMLDivElement | undefined = $state();

  function load(text: string, name: string) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      error = `CHYBA: ${name} není platný JSON.`;
      return;
    }
    data = null;
    summary = null;
    backup = null;
    backupSummary = null;
    if (detectBackup(json)) {
      backup = json;
      backupSummary = summarizeBackup(json);
    } else if (detectSd2(json)) {
      data = json;
      summary = summarizeSd2(json);
    } else {
      error =
        'Neznámý formát. Čekám zálohu z této aplikace, nebo export ze Speed Dial 2 (Preferences, System, Export settings).';
      return;
    }
    source = name;
    error = '';
    step = 'preview';
  }

  async function pickFile() {
    const file = fileInput?.files?.[0];
    if (file) load(await file.text(), file.name);
  }

  async function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) load(await file.text(), file.name);
  }

  async function devLoad(path: string) {
    const res = await fetch(path);
    load(await res.text(), path);
  }

  async function log(ok: boolean, text: string) {
    lines.push({ ok, text });
    await tick();
    logEl?.scrollTo({ top: logEl.scrollHeight });
  }

  async function executeBackup(file: BackupFile) {
    step = 'running';
    const hadData = store.liveDials.length > 0;
    const r = await restoreBackup(file, mode, withSettings);
    const s = r.stats;
    if (hadData) await log(true, 'Bod obnovy uložen');
    await log(true, `Skupiny: +${s.groupsAdded}${s.groupsMerged ? ` · sloučeno ${s.groupsMerged}` : ''}`);
    await log(
      true,
      `Odkazy: +${s.dialsAdded}${s.dialsUpdated ? ` · aktualizováno ${s.dialsUpdated}` : ''}${
        s.duplicatesSkipped ? ` · duplicity přeskočeny ${s.duplicatesSkipped}` : ''
      }${s.removed ? ` · odebráno ${s.removed}` : ''}`,
    );
    await log(true, `Obrázky ze zálohy: ${r.images}`);
    if (r.jobs) await log(true, `Loga se dohledají na pozadí: ${r.jobs} ${odkazu(r.jobs)} bez obrázku`);
    if (withSettings) await log(true, 'Nastavení převzato ze zálohy');
    await log(true, `Obnova hotová: ${s.dialsAdded + s.dialsUpdated} ${odkazu(s.dialsAdded + s.dialsUpdated)}`);
    step = 'done';
  }

  async function execute() {
    if (backup) return executeBackup(backup);
    if (!data) return;
    step = 'running';
    const hadData = store.dials.length > 0;
    const result = importSd2(
      data,
      { groups: $state.snapshot(store.groups), dials: $state.snapshot(store.dials) },
      { mode, cleanTitles },
    );
    if (mode === 'replace') await clearThumbs();
    await store.applyImport(result, `import-${mode}`);
    const s = result.stats;
    if (hadData) await log(true, 'Bod obnovy uložen');
    await log(true, `Skupiny: +${s.groupsAdded}${s.groupsMerged ? ` · sloučeno ${s.groupsMerged}` : ''}`);
    await log(
      true,
      `Odkazy: +${s.dialsAdded}${s.duplicatesSkipped ? ` · duplicity přeskočeny ${s.duplicatesSkipped}` : ''}${
        s.removed ? ` · nahrazeno ${s.removed}` : ''
      }`,
    );
    if (cleanTitles) await log(true, `Titulky uklizeny: ${s.titlesCleaned}`);
    if (resolveLogos && result.thumbJobs.length) {
      await log(true, `Hledám loga: ${result.thumbJobs.length} odkazů`);
      const r = await runThumbJobs(result.thumbJobs, (line) => void log(line.ok, line.text));
      await log(true, `Náhledy: ${r.logos} log a obrázků · ${r.glyphs} bez loga (iniciály)`);
    }
    await log(true, `Import hotový: ${s.dialsAdded} ${odkazu(s.dialsAdded)}`);
    step = 'done';
  }

  function close() {
    if (step !== 'running') onclose();
  }

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
</script>

<div class="backdrop" role="presentation" onclick={close}></div>

<div
  class="wizard"
  tabindex="-1"
  class:dragging
  role="dialog"
  aria-modal="true"
  aria-labelledby="import-title"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
>
  <header>
    <h2 id="import-title">Import: {backup ? 'záloha' : data ? 'Speed Dial 2' : 'záloha nebo Speed Dial 2'}</h2>
    {#if step !== 'running'}<button class="close" onclick={close} aria-label="Zavřít">✕</button>{/if}
  </header>

  {#if step === 'pick'}
    <p>Vyber zálohu z této aplikace (.json), nebo export ze Speed Dial 2 (Preferences, System, Export settings). Soubor jde i přetáhnout sem.</p>
    <div class="row">
      <button class="btn primary" onclick={() => fileInput?.click()}>Vybrat soubor .json</button>
      {#if DEV}
        <button class="btn" onclick={() => devLoad('/fixtures/sd2-sample.json')}>Vývoj: ukázková data</button>
      {/if}
    </div>
    <input bind:this={fileInput} type="file" accept=".json,application/json" class="sr-only" onchange={pickFile} />
  {:else if step === 'preview' && backupSummary}
    {@const b = backupSummary}
    <div class="report">
      <p class="ok">Záloha (formát v{b.version}): {b.groups} skupin · {b.dials} odkazů · {b.thumbs} obrázků</p>
      <p class="dim">Soubor: {source}</p>
      <p>
        Vytvořeno: {b.exportedAt ? new Date(b.exportedAt).toLocaleString('cs-CZ') : '?'} ·
        {b.deviceId && b.deviceId === store.meta?.deviceId ? 'z tohoto zařízení' : 'z jiného zařízení'}
      </p>
      {#if b.tooNew}
        <p class="warn">Pozor: záloha je z novější verze aplikace, něco se nemusí převzít.</p>
      {/if}
    </div>
    <fieldset>
      <legend>Režim</legend>
      <label><input type="radio" bind:group={mode} value="replace" /> Nahradit <span class="dim">(stav přesně podle zálohy, bod obnovy se uloží)</span></label>
      <label><input type="radio" bind:group={mode} value="merge" /> Sloučit <span class="dim">(novější změna vyhrává, duplicitní adresy přeskočit)</span></label>
    </fieldset>
    <fieldset>
      <legend>Volby</legend>
      <label><input type="checkbox" bind:checked={withSettings} /> Převzít nastavení ze zálohy <span class="dim">(motiv, mřížka…)</span></label>
    </fieldset>
    <div class="row">
      <button class="btn primary" onclick={execute}>Importovat</button>
      <button class="btn" onclick={() => (step = 'pick')}>Zpět</button>
    </div>
  {:else if step === 'preview' && summary}
    <div class="report">
      <p class="ok">Speed Dial 2: {summary.groups} skupin · {summary.dials} odkazů</p>
      <p class="dim">Soubor: {source}</p>
      <p>
        Náhledy: {summary.liveThumbs} funkčních · <span class="warn">{summary.deadThumbs} nefunkčních (clearbit)</span> ·
        {summary.emptyThumbs} prázdných
      </p>
      <p>Titulky: {summary.machineTitles} strojových (z adresy)</p>
      <p>Nezařazené: {summary.unsorted}{summary.orphans ? ` · bez skupiny: ${summary.orphans}` : ''}</p>
      {#if summary.duplicates}
        <p class="warn">Duplicitní adresy: {summary.duplicates} (při sloučení se přeskočí)</p>
      {/if}
    </div>
    <fieldset>
      <legend>Režim</legend>
      <label><input type="radio" bind:group={mode} value="replace" /> Nahradit <span class="dim">(vše současné pryč, bod obnovy se uloží)</span></label>
      <label><input type="radio" bind:group={mode} value="merge" /> Sloučit <span class="dim">(přidat, duplicitní adresy přeskočit)</span></label>
    </fieldset>
    <fieldset>
      <legend>Volby</legend>
      <label><input type="checkbox" bind:checked={cleanTitles} /> Uklidit strojové titulky ({summary.machineTitles})</label>
      <label><input type="checkbox" bind:checked={resolveLogos} /> Najít loga (chvíli to trvá)</label>
    </fieldset>
    <div class="row">
      <button class="btn primary" onclick={execute}>Importovat</button>
      <button class="btn" onclick={() => (step = 'pick')}>Zpět</button>
    </div>
  {:else}
    <div class="log" bind:this={logEl}>
      {#each lines as line, i (i)}
        <div class:ok={line.ok} class:glyph={!line.ok}>{line.text}</div>
      {/each}
      {#if step === 'running'}<div class="dim">Pracuji…</div>{/if}
    </div>
    <div class="row">
      {#if step === 'running'}
        <button class="btn" onclick={onclose}>Pokračovat na pozadí</button>
      {:else}
        <button class="btn primary" onclick={onclose}>Hotovo</button>
      {/if}
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--overlay);
  }

  .wizard {
    position: fixed;
    z-index: 21;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(720px, calc(100vw - 32px));
    max-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px 26px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    font-size: 14px;
  }

  .wizard.dragging {
    outline: 2px dashed var(--accent);
    outline-offset: 6px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text-strong);
  }

  .close {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
  }
  .close:hover {
    background: var(--surface-2);
    color: var(--text-strong);
  }

  p {
    margin: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .report {
    display: grid;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
  }

  .ok {
    color: var(--ok);
    font-weight: 600;
  }
  .warn {
    color: var(--warn);
  }
  .dim {
    color: var(--text-muted);
  }
  .error {
    color: var(--danger);
  }

  fieldset {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 6px;
    font-weight: 600;
    color: var(--text-muted);
  }

  label {
    display: flex;
    gap: 8px;
    align-items: baseline;
    cursor: pointer;
  }

  input[type='radio'],
  input[type='checkbox'] {
    accent-color: var(--accent);
  }

  .log {
    min-height: 200px;
    max-height: 50vh;
    overflow: auto;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    font-family: ui-monospace, Consolas, Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.55;
  }

  .log .ok {
    color: var(--text);
    font-weight: 400;
  }
  .log .glyph {
    color: var(--warn);
  }
</style>
