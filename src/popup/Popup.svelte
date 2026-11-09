<script lang="ts">
  import { APP_NAME } from '../lib/brand';
  import { onMount } from 'svelte';
  import { platform } from '../lib/platform';
  import { store } from '../lib/store.svelte';
  import { normalizeUrl, safeUrl } from '../lib/url';
  import { resolveTheme } from '../theme/theme';

  /**
   * Popup ikony rozšíření: přidá aktuální stránku do zvolené skupiny.
   * Logo dohledá nová záložka (fronta náhledů), popup se po přidání sám zavře.
   */

  let url = $state('');
  let title = $state('');
  let groupId = $state('');
  let error = $state('');
  let done = $state('');
  let ready = $state(false);

  const existing = $derived.by(() => {
    const u = safeUrl(url);
    if (!u) return null;
    const key = normalizeUrl(u.href);
    return store.liveDials.find((d) => normalizeUrl(d.url) === key) ?? null;
  });
  const existingGroup = $derived(existing ? store.liveGroups.find((g) => g.id === existing.groupId)?.title : '');

  onMount(async () => {
    await store.init();
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = resolveTheme(store.settings.theme, prefersDark);
    document.documentElement.dataset.font = store.settings.font;
    // ?url=&title= v adrese má přednost (test a ruční použití), jinak aktivní karta
    const p = new URL(location.href).searchParams;
    const tab = p.get('url') ? { url: p.get('url')!, title: p.get('title') ?? '' } : await platform.activeTab();
    if (tab) {
      url = tab.url;
      title = tab.title !== tab.url ? tab.title : '';
    }
    groupId = store.activeGroup?.id ?? store.liveGroups[0]?.id ?? '';
    if (tab && !safeUrl(tab.url)) error = 'Tuhle stránku přidat nejde (jen http a https).';
    ready = true;
  });

  async function add(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!groupId) {
      const g = store.addGroup('Domů');
      groupId = g?.id ?? '';
    }
    const d = store.addDial({ url, title, groupId });
    if (!d) {
      error = 'Neplatná adresa (jen http a https).';
      return;
    }
    await store.persist(['dials']);
    await store.enqueueThumbs([d.id]);
    const g = store.liveGroups.find((x) => x.id === groupId)?.title ?? '';
    done = `Přidáno do skupiny ${g}`;
    setTimeout(() => window.close(), 900);
  }
</script>

<main>
  <h1>Přidat do: {APP_NAME}</h1>
  {#if !ready}
    <p class="note">Načítám…</p>
  {:else if done}
    <p class="ok">{done}</p>
  {:else}
    <form onsubmit={add}>
      <label class="field">
        <span>Adresa</span>
        <input bind:value={url} required spellcheck="false" />
      </label>
      <label class="field">
        <span>Název</span>
        <input bind:value={title} spellcheck="false" placeholder="prázdné = podle adresy" />
      </label>
      <label class="field">
        <span>Skupina</span>
        <select bind:value={groupId}>
          {#each store.liveGroups as g (g.id)}
            <option value={g.id}>{g.title}</option>
          {/each}
          {#if !store.liveGroups.length}<option value="">Domů (nová)</option>{/if}
        </select>
      </label>
      {#if existing}
        <p class="warn">Tahle adresa už je ve skupině {existingGroup} jako „{existing.title}“.</p>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
      <div class="buttons">
        <button class="btn primary" type="submit">{existing ? 'Přidat i tak' : 'Přidat'}</button>
        <button class="btn" type="button" onclick={() => window.close()}>Zavřít</button>
      </div>
    </form>
  {/if}
</main>

<style>
  main {
    width: 380px;
    display: grid;
    gap: 12px;
    padding: 16px 18px 18px;
    font-size: 14px;
  }

  h1 {
    margin: 0;
    font-size: 16px;
    color: var(--text-strong);
  }

  form {
    display: grid;
    gap: 10px;
  }

  .field {
    display: grid;
    gap: 4px;
  }

  .field > span {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
  }

  input,
  select {
    width: 100%;
    padding: 7px 10px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-ui);
    color: var(--text-strong);
    font: inherit;
    outline: none;
  }

  input:focus,
  select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  p {
    margin: 0;
  }

  .note {
    color: var(--text-muted);
  }
  .ok {
    color: var(--ok);
  }
  .warn {
    color: var(--warn);
  }
  .error {
    color: var(--danger);
  }
</style>
