<script lang="ts">
  import { flip } from 'svelte/animate';
  import type { Dial } from '../lib/model';
  import { store } from '../lib/store.svelte';
  import Tile from './Tile.svelte';
  import { ui } from './ui.svelte';

  interface Props {
    dials: Dial[];
    /** Ve výsledcích hledání ukázat název skupiny (a nepřeskupovat). */
    groupTitles?: Map<string, string>;
    selectedId?: string | null;
    /** Skupina, do které jde přetahovat a přidávat (null = výsledky hledání). */
    groupId: string | null;
    onopen: (dial: Dial, newTab: boolean) => void;
  }

  let { dials, groupTitles, selectedId = null, groupId, onopen }: Props = $props();
  const layout = $derived(store.settings.layout);
  const PAD = { none: '0px', small: '6px', medium: '12px', large: '20px' } as const;
  const canReorder = $derived(!!groupId && store.settings.behavior.orderBy === 'manual');

  /** Kam se pustí přetahovaný odkaz: index v aktuálním seznamu (vložit před něj). */
  let dropAt = $state<number | null>(null);

  function over(e: DragEvent, i: number) {
    if (!canReorder || !ui.dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = e.clientX < r.left + r.width / 2 ? i : i + 1;
  }

  function drop(e: DragEvent) {
    const id = e.dataTransfer?.getData('application/x-dial-id') || ui.dragging;
    if (!id || dropAt === null || !groupId) return;
    e.preventDefault();
    const from = dials.findIndex((d) => d.id === id);
    // index v seznamu bez přetahované položky
    const to = from >= 0 && dropAt > from ? dropAt - 1 : dropAt;
    if (from !== to || from < 0) store.moveDial(id, groupId, to);
    dropAt = null;
    ui.dragging = null;
  }
</script>

<section
  class="grid"
  class:compact={layout.compact}
  style:--cols={layout.columns}
  style:--gap="{layout.gap}px"
  style:--radius="var(--radius-{layout.radius})"
  style:--pad={PAD[layout.padding]}
  ondragleave={(e) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropAt = null;
  }}
  ondrop={drop}
  role="list"
>
  {#each dials as dial, i (dial.id)}
    <div
      class="cell"
      class:drop-before={dropAt === i}
      class:drop-after={dropAt === i + 1 && i === dials.length - 1}
      role="listitem"
      ondragover={(e) => over(e, i)}
      animate:flip={{ duration: 220 }}
    >
      <Tile
        {dial}
        index={i}
        group={groupTitles?.get(dial.groupId)}
        selected={dial.id === selectedId}
        {onopen}
      />
    </div>
  {/each}
  {#if groupId && layout.showAdd}
    <div class="cell" role="listitem">
      <button
        class="add"
        style:--i={dials.length}
        onclick={() => ui.open({ kind: 'dial', mode: 'add', groupId })}
        title="Přidat odkaz [n]"
      >
        <span class="plate"><span class="plus">+</span></span>
        <span class="label">přidat</span>
      </button>
    </div>
  {/if}
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: calc(var(--gap) * 1.6) var(--gap);
    width: 100%;
  }

  .grid.compact {
    gap: calc(var(--gap) * 0.8) calc(var(--gap) * 0.6);
  }

  .cell {
    position: relative;
    min-width: 0;
  }

  /* svislá čára, kam se odkaz vloží */
  .cell.drop-before::before,
  .cell.drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 26px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .cell.drop-before::before {
    left: calc(var(--gap) / -2 - 1.5px);
  }
  .cell.drop-after::after {
    right: calc(var(--gap) / -2 - 1.5px);
  }

  .add {
    display: flex;
    flex-direction: column;
    gap: 9px;
    width: 100%;
    padding: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
    animation: add-in 250ms ease-out both;
    animation-delay: calc(min(var(--i), 24) * 12ms);
  }

  @keyframes add-in {
    from {
      opacity: 0;
    }
  }

  .add .plate {
    aspect-ratio: 16 / 10;
    display: grid;
    place-items: center;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius);
    background: transparent;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .plus {
    font-size: 40px;
    font-weight: 300;
    color: var(--text-muted);
    transition: color 0.15s;
  }

  .label {
    font-size: calc(14px * var(--font-scale));
    color: var(--text-muted);
  }

  .add:hover .plate,
  .add:focus-visible .plate {
    border-color: var(--accent);
  }
  .add:hover .plus,
  .add:focus-visible .plus,
  .add:hover .label {
    color: var(--accent);
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: repeat(min(var(--cols), 3), minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
