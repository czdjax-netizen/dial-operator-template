<script lang="ts">
  import { APP_NAME } from '../lib/brand';
  import type { Dial } from '../lib/model';

  interface Props {
    query: string;
    /** Co otevře Enter (první výsledek), nebo null = hledání na webu / adresa. */
    first: Dial | null;
    hint: string;
    onsubmit: (newTab: boolean) => void;
    onsettings: () => void;
  }

  let { query = $bindable(''), first, hint, onsubmit, onsettings }: Props = $props();
  let input: HTMLInputElement | undefined = $state();

  export function focus(): void {
    input?.focus();
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      onsubmit(e.metaKey || e.ctrlKey || e.shiftKey);
    } else if (e.key === 'Escape') {
      query = '';
      input?.blur();
    }
  }
</script>

<header class="top">
  <div class="brand">{APP_NAME}</div>

  <label class="search">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <input
      bind:this={input}
      bind:value={query}
      onkeydown={keydown}
      spellcheck="false"
      autocomplete="off"
      placeholder="Hledat v odkazech nebo zadat adresu (/)"
      aria-label="Hledat v odkazech"
    />
    {#if query.trim()}
      <span class="hint">{first ? first.title : hint} <kbd>Enter</kbd></span>
    {/if}
  </label>

  <nav class="actions">
    <button class="btn" onclick={onsettings} title="Nastavení, import a zálohy (,)">Nastavení</button>
  </nav>
</header>

<style>
  .top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    margin-bottom: 24px;
  }

  .brand {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-strong);
    user-select: none;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 9px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--shadow);
    cursor: text;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .icon {
    flex: none;
    width: 18px;
    height: 18px;
    color: var(--text-muted);
  }

  input {
    flex: 1;
    min-width: 60px;
    background: transparent;
    border: 0;
    outline: none;
    font-size: 15px;
    color: var(--text-strong);
  }

  input::placeholder {
    color: var(--text-muted);
  }

  .hint {
    max-width: 40%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-muted);
    font-size: 13px;
  }

  kbd {
    padding: 1px 6px;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    font: inherit;
    font-size: 11px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  @media (max-width: 760px) {
    .top {
      grid-template-columns: 1fr auto;
    }
    .search {
      grid-column: 1 / -1;
      order: 3;
    }
  }
</style>
