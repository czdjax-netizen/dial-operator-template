<script lang="ts">
  import type { Dial } from '../lib/model';
  import { store } from '../lib/store.svelte';
  import { thumbObjectUrl } from '../lib/thumbs';
  import GlyphArt from './GlyphArt.svelte';
  import { ui } from './ui.svelte';

  interface Props {
    dial: Dial;
    index: number;
    /** Název skupiny (ukazuje se ve výsledcích hledání). */
    group?: string;
    selected?: boolean;
    onopen: (dial: Dial, newTab: boolean) => void;
  }

  let { dial, index, group, selected = false, onopen }: Props = $props();

  let src = $state<string | null>(null);
  const layout = $derived(store.settings.layout);
  const imageKind = $derived(dial.thumb && dial.thumb.kind !== 'glyph' ? dial.thumb.kind : null);

  $effect(() => {
    const thumb = dial.thumb;
    if (!thumb || thumb.kind === 'glyph') {
      src = null;
      return;
    }
    let cancelled = false;
    thumbObjectUrl(dial.id, thumb.updatedAt).then((url) => {
      if (!cancelled) src = url;
    });
    return () => {
      cancelled = true;
    };
  });

  function click(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      // nová karta / okno: necháme na prohlížeči, jen započítáme návštěvu
      void store.recordVisit(dial.id);
      return;
    }
    e.preventDefault();
    onopen(dial, store.settings.behavior.openInNewTab);
  }

  function auxclick(e: MouseEvent) {
    if (e.button === 1) void store.recordVisit(dial.id);
  }

  function openMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fromButton = e.type === 'click';
    ui.menu = { dial, x: fromButton ? r.right - 8 : e.clientX, y: fromButton ? r.bottom + 4 : e.clientY };
  }

  function dragstart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('application/x-dial-id', dial.id);
    e.dataTransfer.setData('text/uri-list', dial.url);
    e.dataTransfer.effectAllowed = 'move';
    ui.dragging = dial.id;
  }
</script>

<a
  class="tile"
  class:selected
  href={dial.url}
  title={dial.url}
  style:--i={index}
  data-kind={dial.thumb?.kind ?? 'none'}
  data-dial-id={dial.id}
  class:dragging={ui.dragging === dial.id}
  class:privacy={store.settings.behavior.privacy}
  draggable="true"
  onclick={click}
  onauxclick={auxclick}
  oncontextmenu={openMenu}
  ondragstart={dragstart}
  ondragend={() => (ui.dragging = null)}
>
  <div class="plate">
    {#if imageKind && src}
      <img class="logo" class:custom={imageKind === 'custom' || imageKind === 'shot'} {src} alt="" draggable="false" />
    {:else}
      <GlyphArt title={dial.title} url={dial.url} />
    {/if}
    <button class="more" tabindex="-1" aria-label="Menu odkazu" onclick={openMenu}>⋯</button>
  </div>
  {#if layout.showTitle}
    <div class="title" style:text-align={layout.alignTitle}>{dial.title}</div>
  {/if}
  {#if group || layout.showVisits}
    <div class="meta" style:justify-content={layout.alignTitle === 'center' ? 'center' : 'flex-start'}>
      {#if group}<span class="group">{group}</span>{/if}
      {#if layout.showVisits}<span>{dial.visits}×</span>{/if}
    </div>
  {/if}
</a>

<style>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    outline: none;
    animation: tile-in 250ms ease-out both;
    animation-delay: calc(min(var(--i), 24) * 12ms);
  }

  @keyframes tile-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  .plate {
    position: relative;
    aspect-ratio: 16 / 10;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    transition:
      transform 0.15s,
      box-shadow 0.15s,
      border-color 0.15s;
  }

  .tile:hover .plate,
  .tile:focus-visible .plate {
    transform: translateY(-2px);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-hover);
  }

  .tile.selected .plate {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .tile:focus-visible .plate {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .tile.dragging {
    opacity: 0.35;
  }

  .logo {
    position: relative;
    z-index: 1;
    width: 42%;
    aspect-ratio: 1;
    object-fit: contain;
    border-radius: 18%;
  }

  /* vlastní obrázek nebo snímek přes celou dlaždici (s okrajem podle nastavení) */
  .logo.custom {
    position: absolute;
    inset: var(--pad, 0px);
    width: calc(100% - 2 * var(--pad, 0px));
    height: calc(100% - 2 * var(--pad, 0px));
    aspect-ratio: auto;
    object-fit: cover;
    border-radius: max(0px, calc(var(--radius) - var(--pad, 0px)));
  }

  .more {
    position: absolute;
    z-index: 3;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 24px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .tile:hover .more,
  .tile:focus-visible .more {
    opacity: 1;
  }
  .more:hover {
    border-color: var(--accent);
  }

  /* privacy mode: rozmazané, dokud na dlaždici nenajede myš nebo fokus */
  .tile.privacy :global(.glyph),
  .tile.privacy .logo,
  .tile.privacy .title,
  .tile.privacy .meta {
    transition: filter 0.2s;
  }
  .tile.privacy:not(:hover):not(:focus-visible) .logo {
    filter: blur(12px);
  }
  .tile.privacy:not(:hover):not(:focus-visible) :global(.glyph),
  .tile.privacy:not(:hover):not(:focus-visible) .title,
  .tile.privacy:not(:hover):not(:focus-visible) .meta {
    filter: blur(6px);
  }

  .title {
    font-size: calc(14px * var(--font-scale));
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px;
    transition: color 0.15s;
  }

  .tile:hover .title,
  .tile:focus-visible .title {
    color: var(--accent);
  }

  .meta {
    display: flex;
    gap: 10px;
    margin-top: -4px;
    font-size: calc(12px * var(--font-scale));
    color: var(--text-muted);
  }
</style>
