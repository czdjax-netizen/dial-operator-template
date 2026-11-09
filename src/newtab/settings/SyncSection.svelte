<script lang="ts">
  import { driveFolderLink, parseDriveFolderId } from '../../lib/drive';
  import { store } from '../../lib/store.svelte';
  import { syncEngine } from '../../lib/sync-engine.svelte';
  import { odkazu } from '../plural';
  import Toggle from './Toggle.svelte';

  let url = $state(store.settings.sync.driveFolderUrl);
  let error = $state('');
  const folderId = $derived(parseDriveFolderId(store.settings.sync.driveFolderUrl));
  const device = $derived(store.meta?.deviceId.slice(0, 8) ?? '-');
  const enabled = $derived(store.syncState.enabled);
  const last = $derived(
    store.syncState.lastSyncAt
      ? new Date(store.syncState.lastSyncAt).toLocaleString('cs-CZ', {
          day: 'numeric',
          month: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'zatím ne',
  );
  const usage = $derived(
    syncEngine.usage
      ? `${Math.ceil(syncEngine.usage.bytes / 1024)} kB z ${Math.round(syncEngine.usage.quota / 1024)} kB`
      : '',
  );
  const STATUS: Record<string, string> = {
    unavailable: 'není k dispozici',
    off: 'vypnuto',
    syncing: 'synchronizuji…',
    ok: 'OK',
    'needs-choice': 'čeká na rozhodnutí',
    quota: 'překročen limit',
    error: 'chyba',
  };

  function save() {
    const value = url.trim();
    if (value && !parseDriveFolderId(value)) {
      error = 'Tohle není odkaz na složku Google Disku (čekám drive.google.com/drive/folders/…).';
      return;
    }
    error = '';
    store.updateSettings({ sync: { driveFolderUrl: value } });
  }

  function toggle(on: boolean) {
    if (on) syncEngine.enable();
    else syncEngine.disable();
  }
</script>

<h3>Synchronizace mezi počítači</h3>
{#if !syncEngine.available}
  <p class="note warn">Synchronizace tu není k dispozici. Funguje v rozšíření (a ve vývoji přes dev server).</p>
{:else}
  <p class="note">
    {#if syncEngine.kind === 'dev'}
      Vývoj: synchronizace jde přes paměť dev serveru (náhrada za účet v Chromu).
    {:else}
      Přes účet přihlášený v Chromu. Na všech počítačích musí být stejný účet se zapnutou synchronizací Chromu.
    {/if}
    Synchronizují se skupiny, odkazy a nastavení. Loga a počty návštěv zůstávají na každém počítači zvlášť.
  </p>
  <Toggle label="synchronizovat tento počítač" checked={enabled} onchange={toggle} />

  {#if enabled}
    <p class="note">
      Stav: <span class:ok={syncEngine.status === 'ok'} class:warn={syncEngine.status !== 'ok'}
        >{STATUS[syncEngine.status] ?? syncEngine.status}</span
      >
      · naposledy {last}{usage ? ` · ${usage}` : ''}
    </p>
    {#if syncEngine.message}<p class="error">{syncEngine.message}</p>{/if}

    {#if syncEngine.status === 'needs-choice' && syncEngine.remoteSummary}
      {@const r = syncEngine.remoteSummary}
      <div class="choice">
        <p class="note">
          Ve synchronizaci už jsou data z jiného počítače ({r.groups} skupin, {r.dials}
          {odkazu(r.dials)}) a tady jsou jiná ({store.liveGroups.length} skupin, {store.liveDials.length}
          {odkazu(store.liveDials.length)}). Co s tím?
        </p>
        <div class="buttons">
          <button class="btn primary" type="button" onclick={() => syncEngine.choose('remote')}>
            Převzít data ze synchronizace
          </button>
          <button class="btn" type="button" onclick={() => syncEngine.choose('local')}>
            Nahrát data z tohoto počítače
          </button>
        </div>
        <p class="note">
          Převzít: tento počítač se přepíše (restore point se uloží). Nahrát: přepíšou se ostatní počítače.
        </p>
      </div>
    {:else}
      <div class="buttons">
        <button class="btn" type="button" disabled={syncEngine.status === 'syncing'} onclick={() => syncEngine.syncNow()}>
          Synchronizovat teď
        </button>
      </div>
    {/if}
  {/if}
{/if}
<p class="note">Toto zařízení: {device}</p>

<h3>Google Disk</h3>
<p class="note">
  Složka pro zálohy. Synchronizace jde přes účet v Chromu, odkaz na složku se zatím jen pamatuje pro budoucí zálohy
  na Disk.
</p>
<form
  class="field"
  onsubmit={(e) => {
    e.preventDefault();
    save();
  }}
>
  <span>Odkaz na složku</span>
  <input
    class="input"
    bind:value={url}
    onchange={save}
    spellcheck="false"
    placeholder="https://drive.google.com/drive/folders/…"
    aria-label="Odkaz na složku Google Disku"
  />
</form>
{#if error}<p class="error">{error}</p>{/if}
{#if folderId}
  <p class="note">
    Složka: <span class="ok">{folderId}</span> ·
    <a href={driveFolderLink(folderId)} target="_blank" rel="noopener noreferrer">otevřít na Disku ↗</a>
  </p>
{/if}

<style>
  form {
    margin: 0;
  }

  a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .choice {
    display: grid;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--warn);
    border-radius: 10px;
    background: var(--surface-2);
  }
</style>
