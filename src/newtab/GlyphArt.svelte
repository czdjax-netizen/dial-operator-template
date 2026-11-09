<script lang="ts">
  import { glyphHue, glyphInitials } from '../lib/glyph';

  /** Dlaždice bez loga: iniciály na barevném pozadí (barva podle domény). */
  interface Props {
    title: string;
    url: string;
  }

  let { title, url }: Props = $props();

  const hue = $derived(glyphHue(url));
  const initials = $derived(glyphInitials(title, url));
</script>

<div class="glyph" style:--hue={hue} aria-hidden="true">
  <span class="ini">{initials}</span>
</div>

<style>
  .glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: hsl(var(--hue) var(--tile-sat) var(--tile-light));
    border-radius: inherit;
  }

  .ini {
    font-size: clamp(26px, 3.2vw, 42px);
    font-weight: 700;
    color: #ffffff;
  }
</style>
