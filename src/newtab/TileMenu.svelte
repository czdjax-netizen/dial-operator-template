<script lang="ts">
  import { onMount } from 'svelte';
  import type { Dial } from '../lib/model';
  import { store } from '../lib/store.svelte';
  import { runThumbJobs } from '../lib/thumb-jobs';
  import { deleteThumb } from '../lib/thumbs';
  import { ui } from './ui.svelte';

  interface Props {
    dial: Dial;
    x: number;
    y: number;
  }

  let { dial, x, y }: Props = $props();
  let el: HTMLDivElement | undefined = $state();

  // nevylézt z okna
  const left = $derived(Math.min(x, window.innerWidth - 230));
  const top = $derived(Math.min(y, window.innerHeight - 200));

  function close() {
    ui.menu = null;
  }

  function edit() {
    ui.open({ kind: 'dial', mode: 'edit', dialId: dial.id });
  }

  function newTab() {
    void store.recordVisit(dial.id);
    window.open(dial.url, '_blank', 'noopener');
    close();
  }

  async function refresh() {
    close();
    await deleteThumb(dial.id);
    await runThumbJobs([{ dialId: dial.id, url: dial.url }]);
  }

  function remove() {
    const undo = store.removeDial(dial.id);
    close();
    ui.showToast(`Smazáno: ${dial.title}`, undo);
  }

  onMount(() => {
    el?.querySelector('button')?.focus();
    const away = (e: Event) => {
      if (el && !el.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
    };
  });
</script>

<div class="menu" role="menu" bind:this={el} style:left="{left}px" style:top="{top}px">
  <div class="head">{dial.title}</div>
  <button role="menuitem" onclick={newTab}>Otevřít v nové kartě</button>
  <button role="menuitem" onclick={edit}>Upravit <kbd>e</kbd></button>
  <button role="menuitem" onclick={refresh}>Znovu najít logo</button>
  <button role="menuitem" class="danger" onclick={remove}>Smazat <kbd>del</kbd></button>
</div>

<style>
  .menu {
    position: fixed;
    z-index: 30;
    min-width: 220px;
    display: grid;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    font-size: 14px;
  }

  .head {
    padding: 4px 10px 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }

  button {
    display: flex;
    align-items: baseline;
    gap: 0;
    padding: 7px 10px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    text-align: left;
    color: var(--text);
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    outline: none;
    background: var(--surface-2);
    color: var(--text-strong);
  }

  .danger {
    color: var(--danger);
  }

  kbd {
    margin-left: auto;
    padding-left: 16px;
    font: inherit;
    color: var(--text-muted);
    text-transform: none;
  }
</style>
