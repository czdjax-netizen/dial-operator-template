<script lang="ts">
  interface Props {
    onimport: () => void;
    onadd: () => void;
  }
  let { onimport, onadd }: Props = $props();
</script>

<section class="empty">
  <h1>Zatím tu nic není</h1>
  <p>Přidej první odkaz, nebo naimportuj odkazy ze Speed Dial 2 či ze zálohy.</p>
  <p class="muted">Export ze Speed Dial 2: Preferences, System, Export settings.</p>
  <div class="buttons">
    <button class="btn primary" onclick={onadd}>Přidat odkaz</button>
    <button class="btn" onclick={onimport}>Importovat</button>
  </div>
</section>

<style>
  .empty {
    display: grid;
    justify-items: start;
    gap: 8px;
    max-width: 560px;
    margin: 12vh auto 0;
    padding: 28px 32px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  h1 {
    margin: 0 0 6px;
    font-size: 26px;
    color: var(--text-strong);
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--text-muted);
    font-size: 14px;
  }

  .buttons {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }
</style>
