<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
    width?: string;
  }

  let { title, onclose, children, width = '560px' }: Props = $props();

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onclose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="modal" role="dialog" aria-modal="true" aria-label={title} style:width="min({width}, calc(100vw - 32px))">
  <header>
    <h2>{title}</h2>
    <button class="close" type="button" onclick={onclose} aria-label="Zavřít">✕</button>
  </header>
  {@render children()}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--overlay);
  }

  .modal {
    position: fixed;
    z-index: 21;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-height: calc(100vh - 80px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 22px 26px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    font-size: 14px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
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

  /* společné styly formulářů v dialozích */
  .modal :global(form) {
    display: grid;
    gap: 14px;
  }
  .modal :global(.field) {
    display: grid;
    gap: 6px;
  }
  .modal :global(.field > span) {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .modal :global(.field input),
  .modal :global(.field select) {
    width: 100%;
    padding: 9px 12px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-ui);
    color: var(--text-strong);
    outline: none;
  }
  .modal :global(.field input:focus),
  .modal :global(.field select:focus) {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .modal :global(.buttons) {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }
  .modal :global(.buttons .spacer) {
    flex: 1;
  }
  .modal :global(.error) {
    margin: 0;
    color: var(--danger);
  }
  .modal :global(.note) {
    margin: 0;
    color: var(--text-muted);
    font-size: 12.5px;
  }
</style>
