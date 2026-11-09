<script lang="ts">
  import { downloadBackup } from '../../lib/backup-io';
  import type { Snapshot } from '../../lib/model';
  import { MAX_SNAPSHOTS, snapshotCounts, snapshotLabel } from '../../lib/snapshots';
  import { store } from '../../lib/store.svelte';
  import { repairMissingThumbs } from '../../lib/thumb-jobs';
  import { odkazu } from '../plural';
  import { ui } from '../ui.svelte';
  import Toggle from './Toggle.svelte';

  let withImages = $state(true);
  let exporting = $state(false);
  /** Snapshot, u kterého se čeká na potvrzení obnovy. */
  let confirmId = $state<string | null>(null);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const when = (t: number) =>
    new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function exportNow() {
    exporting = true;
    try {
      const r = await downloadBackup(withImages);
      const kb = Math.max(1, Math.round(r.bytes / 1024));
      ui.showToast(`Záloha: ${r.name} · ${r.dials} ${odkazu(r.dials)} · ${r.thumbs} obrázků · ${kb} kB`);
    } catch (err) {
      ui.showToast(`Chyba zálohy: ${(err as Error)?.message ?? err}`);
    } finally {
      exporting = false;
    }
  }

  function askRestore(id: string) {
    confirmId = id;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirmId = null), 5000);
  }

  async function restore(s: Snapshot) {
    confirmId = null;
    const before = await store.restoreSnapshot(s.id);
    if (!before) return;
    void repairMissingThumbs();
    ui.showToast(`Obnoveno: ${snapshotLabel(s.reason)} z ${when(s.createdAt)}`, () => {
      void store.restoreSnapshot(before).then(() => repairMissingThumbs());
    });
  }

  function remove(s: Snapshot) {
    store.deleteSnapshot(s.id);
    ui.showToast(`Smazán bod obnovy: ${when(s.createdAt)}`, () => store.putSnapshot(s));
  }
</script>

<h3>Import</h3>
<p class="note">
  Export ze Speed Dial 2 nebo záloha z této aplikace (soubor JSON). Před importem se uloží bod obnovy.
</p>
<div class="buttons">
  <button class="btn primary" type="button" onclick={() => ui.open({ kind: 'import' })}>Importovat ze souboru…</button>
</div>

<h3>Záloha do souboru</h3>
<p class="note">Skupiny, odkazy a nastavení v jednom souboru JSON. Hodí se pro přenos na jiný počítač.</p>
<Toggle label="včetně obrázků náhledů" note="bez nich je soubor menší, loga se po obnově najdou znovu" checked={withImages} onchange={(v) => (withImages = v)} />
<div class="buttons">
  <button class="btn primary" type="button" disabled={exporting || !store.liveDials.length} onclick={exportNow}>
    {exporting ? 'Ukládám…' : 'Stáhnout zálohu'}
  </button>
</div>

<h3>Body obnovy</h3>
<p class="note">
  Automaticky jednou denně a před každým importem, max. {MAX_SNAPSHOTS} nejnovějších. Jsou jen v tomhle prohlížeči a bez obrázků.
</p>
<div class="buttons">
  <button class="btn" type="button" disabled={!store.dials.length} onclick={() => store.createSnapshot('manual')}>
    Vytvořit teď
  </button>
</div>

{#if store.snapshots.length}
  <ul class="snaps">
    {#each store.snapshots as s (s.id)}
      {@const c = snapshotCounts(s)}
      <li>
        <span class="when">{when(s.createdAt)}</span>
        <span class="what">
          <span class="reason">{snapshotLabel(s.reason)}</span>
          <span class="count">{c.groups} sk. · {c.dials} {odkazu(c.dials)}</span>
        </span>
        {#if confirmId === s.id}
          <button class="btn primary" type="button" onclick={() => restore(s)}>Opravdu</button>
        {:else}
          <button class="btn" type="button" onclick={() => askRestore(s.id)}>Obnovit</button>
        {/if}
        <button class="btn del" type="button" title="Smazat bod obnovy" onclick={() => remove(s)}>×</button>
      </li>
    {/each}
  </ul>
{:else}
  <p class="note">Zatím žádný bod obnovy.</p>
{/if}

<style>
  .snaps {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 13px;
  }

  li:hover {
    border-color: var(--border-strong);
  }

  .when {
    color: var(--text-strong);
    white-space: nowrap;
  }

  .what {
    display: grid;
    min-width: 0;
  }

  .reason,
  .count {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .count {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  li .btn {
    padding: 3px 9px;
    font-size: 12.5px;
  }

  .del:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
