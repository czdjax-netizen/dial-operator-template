<script lang="ts">
  import { ui } from './ui.svelte';

  function undo() {
    ui.toast?.undo?.();
    ui.toast = null;
  }
</script>

{#if ui.toast}
  {#key ui.toast.id}
    <div class="toast" role="status">
      <span>{ui.toast.text}</span>
      {#if ui.toast.undo}
        <button class="btn primary" onclick={undo}>Vrátit</button>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    z-index: 25;
    left: 50%;
    bottom: 46px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: calc(100vw - 32px);
    padding: 10px 14px 10px 18px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    font-size: 14px;
    color: var(--text-strong);
    animation: toast-in 180ms ease-out;
  }

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
