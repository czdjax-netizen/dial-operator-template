<script lang="ts">
  /** Vypínač (switch) s popiskem a volitelnou poznámkou. */
  interface Props {
    label: string;
    checked: boolean;
    onchange: (checked: boolean) => void;
    note?: string;
    disabled?: boolean;
  }

  let { label, checked, onchange, note, disabled = false }: Props = $props();
</script>

<button type="button" class="toggle" role="switch" aria-checked={checked} {disabled} onclick={() => onchange(!checked)}>
  <span class="track" class:on={checked} aria-hidden="true"><span class="knob"></span></span>
  <span class="text">
    <span class="label">{label}</span>
    {#if note}<span class="note">{note}</span>{/if}
  </span>
</button>

<style>
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 4px 0;
    background: transparent;
    border: 0;
    text-align: left;
    color: var(--text);
    cursor: pointer;
  }

  .toggle:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .track {
    flex: none;
    position: relative;
    width: 36px;
    height: 20px;
    margin-top: 1px;
    border-radius: 999px;
    background: var(--border-strong);
    transition: background 0.15s;
  }
  .track.on {
    background: var(--accent);
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    transition: transform 0.15s;
  }
  .track.on .knob {
    transform: translateX(16px);
  }

  .text {
    display: grid;
    gap: 2px;
  }

  .label {
    display: block;
    font-size: 14px;
  }
  .label::first-letter {
    text-transform: uppercase;
  }

  .note {
    font-size: 12.5px;
    color: var(--text-muted);
  }
</style>
