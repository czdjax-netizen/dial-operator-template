<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { runThumbJobs } from '../lib/thumb-jobs';
  import Modal from './Modal.svelte';
  import { ui } from './ui.svelte';

  interface Props {
    mode: 'add' | 'edit';
    dialId?: string;
    groupId?: string;
    initialUrl?: string;
  }

  let { mode, dialId, groupId: initialGroup, initialUrl = '' }: Props = $props();

  // Dialog se při každém otevření vytváří znovu ({#key}), počáteční hodnoty stačí.
  // svelte-ignore state_referenced_locally
  const editing = mode === 'edit' && dialId ? store.dialById(dialId) : undefined;
  // svelte-ignore state_referenced_locally
  let url = $state(editing?.url ?? initialUrl);
  let title = $state(editing?.title ?? '');
  // svelte-ignore state_referenced_locally
  let groupId = $state(editing?.groupId ?? initialGroup ?? store.activeGroup?.id ?? '');
  let error = $state('');

  function refreshLogo(id: string) {
    const d = store.dialById(id);
    if (d && !d.thumb) void runThumbJobs([{ dialId: d.id, url: d.url }]);
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!groupId) {
      error = 'Nejdřív vytvoř skupinu.';
      return;
    }
    if (editing) {
      // nezměněný nezamčený titulek se nepošle, ať se dál odvozuje z URL
      const titlePatch = !editing.titleLocked && title.trim() === editing.title ? undefined : title;
      if (!store.updateDial(editing.id, { url, title: titlePatch, groupId })) {
        error = 'Neplatná adresa (jen http/https).';
        return;
      }
      refreshLogo(editing.id);
    } else {
      const d = store.addDial({ url, title, groupId });
      if (!d) {
        error = 'Neplatná adresa (jen http/https).';
        return;
      }
      if (groupId !== store.activeGroup?.id) store.setActiveGroup(groupId);
      refreshLogo(d.id);
    }
    ui.close();
  }

  function remove() {
    if (!editing) return;
    const undo = store.removeDial(editing.id);
    ui.close();
    ui.showToast(`Smazáno: ${editing.title}`, undo);
  }
</script>

<Modal title={editing ? 'Upravit odkaz' : 'Nový odkaz'} onclose={() => ui.close()}>
  <form onsubmit={save}>
    <label class="field">
      <span>Adresa</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={url} autofocus required spellcheck="false" placeholder="https://…" />
    </label>
    <label class="field">
      <span>Název</span>
      <input bind:value={title} spellcheck="false" placeholder="prázdné = podle adresy" />
    </label>
    <label class="field">
      <span>Skupina</span>
      <select bind:value={groupId}>
        {#each store.liveGroups as g (g.id)}
          <option value={g.id}>{g.title}</option>
        {/each}
      </select>
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="buttons">
      <button class="btn primary" type="submit">Uložit</button>
      <button class="btn" type="button" onclick={() => ui.close()}>Zrušit</button>
      {#if editing}
        <span class="spacer"></span>
        <button class="btn danger" type="button" onclick={remove}>Smazat</button>
      {/if}
    </div>
  </form>
</Modal>
