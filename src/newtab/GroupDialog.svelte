<script lang="ts">
  import { store } from '../lib/store.svelte';
  import Modal from './Modal.svelte';
  import { odkazu } from './plural';
  import { ui } from './ui.svelte';

  interface Props {
    mode: 'add' | 'edit';
    groupId?: string;
  }

  let { mode, groupId }: Props = $props();

  // Dialog se při každém otevření vytváří znovu ({#key}), počáteční hodnoty stačí.
  // svelte-ignore state_referenced_locally
  const group = mode === 'edit' && groupId ? store.liveGroups.find((g) => g.id === groupId) : undefined;
  const count = group ? (store.countByGroup.get(group.id) ?? 0) : 0;
  let title = $state(group?.title ?? '');
  let error = $state('');

  function save(e: SubmitEvent) {
    e.preventDefault();
    const ok = group ? store.renameGroup(group.id, title) : !!store.addGroup(title);
    if (!ok) {
      error = 'Zadej název skupiny.';
      return;
    }
    ui.close();
  }

  function remove() {
    if (!group) return;
    const undo = store.removeGroup(group.id);
    ui.close();
    ui.showToast(`Smazána skupina ${group.title} (${count} ${odkazu(count)})`, undo);
  }
</script>

<Modal title={group ? 'Upravit skupinu' : 'Nová skupina'} onclose={() => ui.close()} width="460px">
  <form onsubmit={save}>
    <label class="field">
      <span>Název</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={title} autofocus required spellcheck="false" />
    </label>
    {#if group}
      <p class="note">Smazání skupiny smaže i jejích {count} {odkazu(count)}. Půjde to vrátit.</p>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
    <div class="buttons">
      <button class="btn primary" type="submit">Uložit</button>
      <button class="btn" type="button" onclick={() => ui.close()}>Zrušit</button>
      {#if group}
        <span class="spacer"></span>
        <button class="btn danger" type="button" onclick={remove}>Smazat skupinu</button>
      {/if}
    </div>
  </form>
</Modal>
