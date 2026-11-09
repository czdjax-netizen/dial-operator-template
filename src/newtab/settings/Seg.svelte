<script lang="ts" generics="T extends string | number">
  /** Přepínač jedné volby z několika (segmentová lišta). */
  interface Props {
    label: string;
    value: T;
    options: { value: T; label: string; title?: string }[];
    onchange: (value: T) => void;
    note?: string;
  }

  let { label, value, options, onchange, note }: Props = $props();
</script>

<div class="row">
  <span class="label">{label}</span>
  <div class="seg" role="radiogroup" aria-label={label}>
    {#each options as o (o.value)}
      <button
        type="button"
        role="radio"
        aria-checked={o.value === value}
        class:on={o.value === value}
        title={o.title}
        onclick={() => onchange(o.value)}>{o.label}</button
      >
    {/each}
  </div>
  {#if note}<span class="note">{note}</span>{/if}
</div>

<style>
  .row {
    display: grid;
    gap: 6px;
  }

  .label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* segmentový přepínač: jedna lišta s volbami */
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    justify-self: start;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }

  button {
    padding: 5px 12px;
    background: transparent;
    border: 0;
    border-radius: 7px;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }

  button:hover {
    color: var(--text-strong);
  }

  button.on {
    background: var(--surface);
    color: var(--accent);
    font-weight: 600;
    box-shadow: var(--shadow);
  }

  .note {
    font-size: 12.5px;
    color: var(--text-muted);
  }
</style>
