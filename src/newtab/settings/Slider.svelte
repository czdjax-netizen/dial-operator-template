<script lang="ts">
  /** Posuvník s hodnotou vpravo. Změna se ukládá odloženě (`onchange` při každém posunu). */
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    format?: (v: number) => string;
    onchange: (value: number) => void;
  }

  let { label, value, min, max, step = 1, format = (v) => String(v), onchange }: Props = $props();
</script>

<label class="row">
  <span class="head">
    <span class="label">{label}</span>
    <span class="value">{format(value)}</span>
  </span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value))}
  />
</label>

<style>
  .row {
    display: grid;
    gap: 4px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .value {
    font-size: 13px;
    color: var(--text);
  }

  input {
    width: 100%;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
</style>
