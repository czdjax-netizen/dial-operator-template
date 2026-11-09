<script lang="ts">
  import { APP_NAME } from '../lib/brand';
  import { store } from '../lib/store.svelte';
  import { syncEngine } from '../lib/sync-engine.svelte';
  import { odkazu } from './plural';

  /** Patička: počet odkazů, postup hledání log, stav synchronizace a verze. */
  interface Props {
    label: string;
    count: number;
  }

  let { label, count }: Props = $props();

  const SYNC_LABEL: Record<string, string> = {
    syncing: 'Synchronizuji…',
    ok: 'Synchronizováno',
    'needs-choice': 'Synchronizace čeká na volbu',
    quota: 'Synchronizace: plno',
    error: 'Chyba synchronizace',
  };
  const syncLabel = $derived(store.syncState.enabled ? (SYNC_LABEL[syncEngine.status] ?? '') : '');
  const syncBad = $derived(['needs-choice', 'quota', 'error'].includes(syncEngine.status));
</script>

<footer class="status">
  <span>{label}{label ? ' · ' : ''}{count} {odkazu(count)}</span>
  {#if store.jobs.running}
    <span class="jobs">Hledám loga {store.jobs.done}/{store.jobs.total}</span>
  {/if}
  <span class="spacer"></span>
  {#if syncLabel}
    <span class="sync" class:bad={syncBad} title={syncEngine.message}>{syncLabel}</span>
  {/if}
  <span class="ver">{APP_NAME} {__APP_VERSION__}</span>
</footer>

<style>
  .status {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 18px;
    height: 32px;
    padding: 0 18px;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    backdrop-filter: blur(4px);
    font-size: 12.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  .jobs {
    color: var(--warn);
  }

  .sync {
    color: var(--ok);
  }
  .sync.bad {
    color: var(--warn);
  }

  .ver {
    opacity: 0.7;
  }
</style>
