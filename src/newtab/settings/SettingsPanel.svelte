<script lang="ts">
  import { onMount } from 'svelte';
  import { APP_NAME } from '../../lib/brand';
  import type { DeepPartial, Settings } from '../../lib/model';
  import { cloneData } from '../../lib/model';
  import { store } from '../../lib/store.svelte';
  import { ui, type SettingsTab } from '../ui.svelte';
  import BackupSection from './BackupSection.svelte';
  import Seg from './Seg.svelte';
  import Slider from './Slider.svelte';
  import SyncSection from './SyncSection.svelte';
  import ThumbsSection from './ThumbsSection.svelte';
  import Toggle from './Toggle.svelte';

  interface Props {
    tab?: SettingsTab;
  }

  let { tab: initial }: Props = $props();
  // svelte-ignore state_referenced_locally
  if (initial) ui.settingsTab = initial;

  const TABS: { id: SettingsTab; label: string; reset?: (keyof Settings)[] }[] = [
    { id: 'look', label: 'vzhled', reset: ['theme', 'font', 'fontScale', 'background'] },
    { id: 'grid', label: 'mřížka', reset: ['layout'] },
    { id: 'behavior', label: 'chování', reset: ['behavior'] },
    { id: 'thumbs', label: 'náhledy' },
    { id: 'backup', label: 'zálohy' },
    { id: 'sync', label: 'sync' },
  ];

  const tab = $derived(ui.settingsTab);
  const current = $derived(TABS.find((t) => t.id === tab) ?? TABS[0]);
  const s = $derived(store.settings);
  let imageUrl = $state(store.settings.background.imageUrl ?? '');

  function set(patch: DeepPartial<Settings>, soon = false) {
    store.updateSettings(patch, soon);
  }

  function reset() {
    if (!current.reset) return;
    const before = cloneData(store.settings);
    store.resetSettings(current.reset);
    ui.showToast(`Výchozí hodnoty: ${current.label}`, () => store.updateSettings(before));
  }

  function close() {
    ui.close();
  }

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const pct = (v: number) => `${Math.round(v)} %`;
  const px = (v: number) => `${v} px`;
</script>

<div class="backdrop" role="presentation" onclick={close}></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Nastavení">
  <header>
    <h2>Nastavení</h2>
    <button class="close" type="button" onclick={close} aria-label="Zavřít">✕</button>
  </header>

  <nav class="tabs" aria-label="Sekce nastavení">
    {#each TABS as t (t.id)}
      <button type="button" class:on={t.id === tab} aria-current={t.id === tab ? 'page' : undefined} onclick={() => (ui.settingsTab = t.id)}
        >{t.label}</button
      >
    {/each}
  </nav>

  <div class="body">
    {#if tab === 'look'}
      <Seg
        label="Motiv"
        value={s.theme}
        options={[
          { value: 'auto', label: 'podle systému' },
          { value: 'light', label: 'světlý' },
          { value: 'dark', label: 'tmavý' },
        ]}
        onchange={(v) => set({ theme: v })}
      />
      <Seg
        label="Písmo"
        value={s.font}
        options={[
          { value: 'system', label: 'systémové' },
          { value: 'serif', label: 'patkové' },
          { value: 'mono', label: 'strojové' },
        ]}
        onchange={(v) => set({ font: v })}
      />
      <Slider
        label="Velikost písma titulků"
        value={Math.round(s.fontScale * 100)}
        min={60}
        max={140}
        step={5}
        format={pct}
        onchange={(v) => set({ fontScale: v / 100 }, true)}
      />
      <Seg
        label="Pozadí"
        value={s.background.kind}
        options={[
          { value: 'none', label: 'barva motivu' },
          { value: 'image', label: 'obrázek' },
        ]}
        onchange={(v) => set({ background: { kind: v } })}
      />
      {#if s.background.kind === 'image'}
        <label class="field">
          <span>Adresa obrázku</span>
          <input
            class="input"
            bind:value={imageUrl}
            spellcheck="false"
            placeholder="https://…"
            onchange={() => set({ background: { imageUrl: imageUrl.trim() } })}
          />
        </label>
        {#if !s.background.imageUrl}<p class="note">Bez adresy obrázku zůstane pozadí prázdné.</p>{/if}
        <Slider
          label="Viditelnost obrázku"
          value={Math.round(s.background.opacity * 100)}
          min={5}
          max={100}
          step={5}
          format={pct}
          onchange={(v) => set({ background: { opacity: v / 100 } }, true)}
        />
        <Seg
          label="Velikost obrázku"
          value={s.background.size}
          options={[
            { value: 'cover', label: 'vyplnit' },
            { value: 'contain', label: 'celý' },
            { value: 'auto', label: 'původní' },
          ]}
          onchange={(v) => set({ background: { size: v } })}
        />
      {/if}
    {:else if tab === 'grid'}
      <Slider label="Sloupce" value={s.layout.columns} min={1} max={12} onchange={(v) => set({ layout: { columns: v } }, true)} />
      <Slider
        label="Max. šířka"
        value={s.layout.maxWidth}
        min={640}
        max={3840}
        step={40}
        format={px}
        onchange={(v) => set({ layout: { maxWidth: v } }, true)}
      />
      <Slider label="Mezery" value={s.layout.gap} min={0} max={48} format={px} onchange={(v) => set({ layout: { gap: v } }, true)} />
      <div class="toggles">
        <Toggle label="Centrovat svisle" checked={s.layout.centered} onchange={(v) => set({ layout: { centered: v } })} />
        <Toggle label="Kompaktní rozvržení" checked={s.layout.compact} onchange={(v) => set({ layout: { compact: v } })} />
        <Toggle label="Titulky" checked={s.layout.showTitle} onchange={(v) => set({ layout: { showTitle: v } })} />
        <Toggle label="Počet návštěv" checked={s.layout.showVisits} onchange={(v) => set({ layout: { showVisits: v } })} />
        <Toggle label="Dlaždice + (přidat)" checked={s.layout.showAdd} onchange={(v) => set({ layout: { showAdd: v } })} />
        <Toggle label="Patička" checked={s.layout.showStatus} onchange={(v) => set({ layout: { showStatus: v } })} />
      </div>
      <Seg
        label="Zarovnání titulku"
        value={s.layout.alignTitle}
        options={[
          { value: 'left', label: 'vlevo' },
          { value: 'center', label: 'na střed' },
          { value: 'right', label: 'vpravo' },
        ]}
        onchange={(v) => set({ layout: { alignTitle: v } })}
      />
      <Seg
        label="Zaoblení rohů"
        value={s.layout.radius}
        options={[
          { value: 'none', label: 'žádné' },
          { value: 'small', label: 'malé' },
          { value: 'medium', label: 'střední' },
          { value: 'large', label: 'velké' },
        ]}
        onchange={(v) => set({ layout: { radius: v } })}
      />
      <Seg
        label="Okraj kolem obrázku"
        value={s.layout.padding}
        options={[
          { value: 'none', label: 'žádný' },
          { value: 'small', label: 'malý' },
          { value: 'medium', label: 'střední' },
          { value: 'large', label: 'velký' },
        ]}
        onchange={(v) => set({ layout: { padding: v } })}
      />
    {:else if tab === 'behavior'}
      <div class="toggles">
        <Toggle
          label="Otevírat v nové kartě"
          checked={s.behavior.openInNewTab}
          onchange={(v) => set({ behavior: { openInNewTab: v } })}
        />
        <Toggle
          label="Pamatovat si skupinu"
          note="Nová karta otevře naposledy zvolenou skupinu."
          checked={s.behavior.keepActiveGroup}
          onchange={(v) => set({ behavior: { keepActiveGroup: v } })}
        />
        <Toggle
          label="Soukromý režim"
          note="Dlaždice jsou rozmazané, dokud na ně nenajedeš."
          checked={s.behavior.privacy}
          onchange={(v) => set({ behavior: { privacy: v } })}
        />
        <Toggle
          label="Položka v menu prohlížeče"
          note={`„Přidat do: ${APP_NAME}“ po kliknutí pravým tlačítkem, funguje až v rozšíření.`}
          checked={s.behavior.contextMenu}
          onchange={(v) => set({ behavior: { contextMenu: v } })}
        />
      </div>
      <Seg
        label="Řazení odkazů"
        value={s.behavior.orderBy}
        options={[
          { value: 'manual', label: 'ručně' },
          { value: 'visits', label: 'návštěvy' },
          { value: 'title', label: 'název' },
          { value: 'created', label: 'nejnovější' },
        ]}
        note={s.behavior.orderBy === 'manual' ? undefined : 'Přetahovat v mřížce jde jen při řazení ručně.'}
        onchange={(v) => set({ behavior: { orderBy: v } })}
      />
      <Seg
        label="Řazení skupin"
        value={s.behavior.orderGroupsBy}
        options={[
          { value: 'manual', label: 'ručně' },
          { value: 'title', label: 'název' },
        ]}
        onchange={(v) => set({ behavior: { orderGroupsBy: v } })}
      />
    {:else if tab === 'thumbs'}
      <ThumbsSection />
    {:else if tab === 'backup'}
      <BackupSection />
    {:else if tab === 'sync'}
      <SyncSection />
    {/if}
  </div>

  {#if current.reset}
    <footer>
      <button class="btn" type="button" onclick={reset}>Výchozí hodnoty: {current.label}</button>
    </footer>
  {/if}
</div>

<style>
  /* průhledné pozadí: změny jsou hned vidět na mřížce */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
  }

  .panel {
    position: fixed;
    z-index: 21;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(440px, 100vw);
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    font-size: 14px;
    animation: panel-in 180ms ease-out;
  }

  @keyframes panel-in {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 18px 20px 10px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
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

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 16px 12px;
    border-bottom: 1px solid var(--border);
  }

  .tabs button {
    padding: 5px 10px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
  }

  .tabs button::first-letter {
    text-transform: uppercase;
  }

  .tabs button:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .tabs button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .body {
    flex: 1;
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 18px;
    padding: 18px 20px 24px;
  }

  .toggles {
    display: grid;
    gap: 6px;
  }

  footer {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border);
  }

  /* společné styly pro sekce (pole, poznámky, chyby, nadpisy) */
  .panel :global(.field) {
    display: grid;
    gap: 6px;
  }
  .panel :global(.field > span) {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .panel :global(.note) {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .panel :global(.error) {
    margin: 0;
    color: var(--danger);
    font-size: 13px;
  }
  .panel :global(.ok) {
    color: var(--ok);
  }
  .panel :global(.warn) {
    color: var(--warn);
  }
  .panel :global(h3) {
    margin: 6px 0 0;
    font-size: 15px;
    color: var(--text-strong);
  }
  .panel :global(.buttons) {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
