<script lang="ts">
  import { onMount } from 'svelte';
  import type { Dial } from '../lib/model';
  import { platform } from '../lib/platform';
  import { searchDials } from '../lib/state-utils';
  import { store } from '../lib/store.svelte';
  import { syncEngine } from '../lib/sync-engine.svelte';
  import { processThumbQueue } from '../lib/thumb-jobs';
  import { safeUrl } from '../lib/url';
  import { resolveTheme } from '../theme/theme';
  import EmptyState from './EmptyState.svelte';
  import Footer from './Footer.svelte';
  import Grid from './Grid.svelte';
  import GroupTabs from './GroupTabs.svelte';
  import Header from './Header.svelte';
  import DialDialog from './DialDialog.svelte';
  import GroupDialog from './GroupDialog.svelte';
  import ImportWizard from './ImportWizard.svelte';
  import SettingsPanel from './settings/SettingsPanel.svelte';
  import TileMenu from './TileMenu.svelte';
  import Toast from './Toast.svelte';
  import { ui } from './ui.svelte';

  let query = $state('');
  let prefersDark = $state(matchMedia('(prefers-color-scheme: dark)').matches);
  let header: { focus(): void } | undefined = $state();

  const theme = $derived(resolveTheme(store.settings.theme, prefersDark));
  const searching = $derived(query.trim().length > 0);
  const results = $derived(searching ? searchDials(store.liveDials, query) : []);
  const shown = $derived(searching ? results : store.activeDials);
  const groupTitles = $derived(new Map(store.liveGroups.map((g) => [g.id, g.title])));
  const looksLikeAddress = $derived(/^\S+\.\S{2,}$/.test(query.trim()) && !!safeUrl(query.trim()));
  const background = $derived(store.settings.background);

  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.font = store.settings.font;
    root.style.setProperty('--font-scale', String(store.settings.fontScale));
  });

  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (prefersDark = mq.matches);
    mq.addEventListener('change', onScheme);
    void (async () => {
      await store.init();
      if (import.meta.env.DEV) {
        const { runDevSeed } = await import('./dev-seed');
        await runDevSeed();
      }
      // odkazy přidané z menu prohlížeče nebo popupu čekají na logo, změny jdou do synchronizace
      store.onDataChange = (source) => {
        syncEngine.notify();
        if (source === 'external') processThumbQueue();
      };
      processThumbQueue();
      syncEngine.start();
    })();
    return () => mq.removeEventListener('change', onScheme);
  });

  async function openDial(dial: Dial, newTab: boolean) {
    await store.recordVisit(dial.id);
    if (newTab) window.open(dial.url, '_blank', 'noopener');
    else window.location.href = dial.url;
  }

  function submit(newTab: boolean) {
    const q = query.trim();
    if (results[0]) {
      void openDial(results[0], newTab);
    } else if (looksLikeAddress) {
      const url = safeUrl(q)!.href;
      if (newTab) window.open(url, '_blank', 'noopener');
      else window.location.href = url;
    } else {
      platform.search(q, newTab);
    }
  }

  function isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  /** Odkaz, na kterém je fokus klávesnice (Tab) nebo myš. */
  function focusedDialId(): string | null {
    const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-dial-id]')
      ?? document.querySelector<HTMLElement>('[data-dial-id]:hover');
    return el?.dataset.dialId ?? null;
  }

  function keydown(e: KeyboardEvent) {
    if (ui.dialog || ui.menu || isTyping(e)) return;
    // Alt+1..9: e.code, protože Alt na Macu mění e.key na speciální znaky
    const digit = e.code.match(/^Digit([1-9])$/);
    if (e.altKey && digit) {
      const g = store.liveGroups[Number(digit[1]) - 1];
      if (g) {
        e.preventDefault();
        store.setActiveGroup(g.id);
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' && store.activeGroup) {
      e.preventDefault();
      ui.open({ kind: 'dial', mode: 'add', groupId: store.activeGroup.id });
      return;
    }
    if (e.key === 'e' || e.key === 'Delete' || e.key === 'Backspace') {
      const id = focusedDialId();
      const dial = id ? store.dialById(id) : undefined;
      if (!dial) return;
      e.preventDefault();
      if (e.key === 'e') {
        ui.open({ kind: 'dial', mode: 'edit', dialId: dial.id });
      } else {
        const undo = store.removeDial(dial.id);
        ui.showToast(`Smazáno: ${dial.title}`, undo);
      }
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      header?.focus();
    } else if (e.key === ',') {
      e.preventDefault();
      ui.open({ kind: 'settings' });
    } else if (e.key === ']') {
      store.cycleGroup(1);
    } else if (e.key === '[') {
      store.cycleGroup(-1);
    }
  }

  /** Prázdný stav: první odkaz ručně (skupina „Domů“ se založí, když žádná není). */
  function addFirst() {
    const group = store.liveGroups[0] ?? store.addGroup('Domů');
    if (!group) return;
    store.setActiveGroup(group.id);
    ui.open({ kind: 'dial', mode: 'add', groupId: group.id });
  }
</script>

<svelte:window onkeydown={keydown} />

{#if background.kind === 'image' && background.imageUrl}
  <div
    class="bg-image"
    style:background-image="url({background.imageUrl})"
    style:background-size={background.size}
    style:background-position={background.position}
    style:background-repeat={background.repeat}
    style:opacity={background.opacity}
  ></div>
{/if}

<main
  class="shell"
  class:centered={store.settings.layout.centered}
  style:max-width="{store.settings.layout.maxWidth}px"
>
  <Header
    bind:this={header}
    bind:query
    first={results[0] ?? null}
    hint={looksLikeAddress ? `otevřít ${query.trim()}` : 'hledat na webu'}
    onsubmit={submit}
    onsettings={() => ui.open({ kind: 'settings' })}
  />

  {#if store.loaded}
    {#if !store.liveDials.length && !searching}
      <EmptyState onimport={() => ui.open({ kind: 'import' })} onadd={addFirst} />
    {:else}
      {#if searching}
        <div class="search-head">
          {results.length ? `Nalezeno ${results.length}` : 'Nic nenalezeno'} pro „{query.trim()}“ ve všech skupinách
        </div>
      {:else}
        <GroupTabs />
      {/if}
      <div class="stage">
        {#key searching ? 'search' : store.activeGroup?.id}
          <Grid
            dials={shown}
            groupTitles={searching ? groupTitles : undefined}
            selectedId={searching ? (results[0]?.id ?? null) : null}
            groupId={searching ? null : (store.activeGroup?.id ?? null)}
            onopen={openDial}
          />
        {/key}
      </div>
    {/if}
  {/if}
</main>

{#if store.settings.layout.showStatus}
  <Footer label={searching ? 'Hledání' : (store.activeGroup?.title ?? '')} count={shown.length} />
{/if}

{#if ui.dialog?.kind === 'import'}
  <ImportWizard onclose={() => ui.close()} />
{:else if ui.dialog?.kind === 'settings'}
  <SettingsPanel tab={ui.dialog.tab} />
{:else if ui.dialog?.kind === 'dial'}
  {#key ui.dialog}
    {#if ui.dialog.mode === 'edit'}
      <DialDialog mode="edit" dialId={ui.dialog.dialId} />
    {:else}
      <DialDialog mode="add" groupId={ui.dialog.groupId} initialUrl={ui.dialog.url} />
    {/if}
  {/key}
{:else if ui.dialog?.kind === 'group'}
  {#key ui.dialog}
    <GroupDialog mode={ui.dialog.mode} groupId={ui.dialog.mode === 'edit' ? ui.dialog.groupId : undefined} />
  {/key}
{/if}

{#if ui.menu}
  {#key ui.menu}
    <TileMenu dial={ui.menu.dial} x={ui.menu.x} y={ui.menu.y} />
  {/key}
{/if}

<Toast />

<style>
  .bg-image {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .shell {
    position: relative;
    z-index: 1;
    margin: 0 auto;
    padding: 28px 40px 72px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .stage {
    flex: 0 0 auto;
  }

  .shell.centered .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-bottom: 6vh;
  }

  .search-head {
    margin: 0 0 24px;
    padding: 4px 0 16px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 14px;
  }

  @media (max-width: 760px) {
    .shell {
      padding: 18px 16px 64px;
    }
  }
</style>
