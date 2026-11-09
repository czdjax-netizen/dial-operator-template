<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { ui } from './ui.svelte';

  /** Skupina, nad kterou se zrovna drží přetahovaný odkaz. */
  let dropOn = $state<string | null>(null);

  function over(e: DragEvent, groupId: string) {
    if (!ui.dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropOn = groupId;
  }

  function drop(e: DragEvent, groupId: string, title: string) {
    const id = e.dataTransfer?.getData('application/x-dial-id') || ui.dragging;
    dropOn = null;
    if (!id) return;
    e.preventDefault();
    const dial = store.dialById(id);
    if (!dial || dial.groupId === groupId) return;
    store.moveDial(id, groupId);
    ui.dragging = null;
    ui.showToast(`Přesunuto: ${dial.title} do skupiny ${title}`);
  }

  function edit(e: MouseEvent, groupId: string) {
    e.preventDefault();
    ui.open({ kind: 'group', mode: 'edit', groupId });
  }
</script>

<nav class="tabs" aria-label="Skupiny">
  {#each store.liveGroups as group, i (group.id)}
    {@const active = group.id === store.activeGroup?.id}
    <button
      class="tab"
      class:active
      class:drop={dropOn === group.id}
      aria-current={active ? 'page' : undefined}
      title={`${i < 9 ? `Alt+${i + 1} · ` : ''}dvojklik = upravit`}
      onclick={() => store.setActiveGroup(group.id)}
      ondblclick={(e) => edit(e, group.id)}
      oncontextmenu={(e) => edit(e, group.id)}
      ondragover={(e) => over(e, group.id)}
      ondragleave={() => (dropOn = null)}
      ondrop={(e) => drop(e, group.id, group.title)}
    >
      <span class="name">{group.title}</span>
      <span class="count">{store.countByGroup.get(group.id) ?? 0}</span>
    </button>
  {/each}
  <button class="tab add" title="Nová skupina" onclick={() => ui.open({ kind: 'group', mode: 'add' })}>+</button>
</nav>

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 28px;
  }

  .tab {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 6px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .tab:hover {
    border-color: var(--border-strong);
  }

  .count {
    font-size: 12px;
    color: var(--text-muted);
  }

  .tab.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .tab.active .count {
    color: inherit;
    opacity: 0.8;
  }

  .tab.drop {
    border-color: var(--accent);
    border-style: dashed;
    background: var(--accent-soft);
  }

  .tab.add {
    padding: 4px 12px;
    color: var(--text-muted);
    font-size: 16px;
  }
  .tab.add:hover {
    color: var(--accent);
  }
</style>
