<script>
  let {
    i18n,
    settings = $bindable(),
    activeKanban = null,
    editingKanban = false,
    fullscreen = false,
    saving = false,
    editing = false,
    onCancelKanban,
    onSelectKanban,
    onEditKanban,
    onSaveKanban,
    onAddKanban,
    onToggleFullscreen
  } = $props();

  function icon(id) {
    return `#${id}`;
  }
</script>

<section class="kanban-toolbar box _outer gap _2 flex">
  <div class="grid gap">
    <span>{i18n.boardSet}</span>
    <select aria-label={i18n.boardSet} value={settings.active_kanban_id} disabled={saving || editing} onchange={(event) => onSelectKanban?.(event.currentTarget.value)}>
      {#each settings.kanbans ?? [] as kanban}
        <option value={kanban.id}>{kanban.name}</option>
      {/each}
    </select>
  </div>

  {#if activeKanban && editingKanban}
    <label class="grid gap">{i18n.name} <input disabled={saving} bind:value={activeKanban.name}></label>
    <label class="grid gap">{i18n.boardSetDescription} <input disabled={saving} bind:value={activeKanban.description}></label>
    <button class="button _primary" onclick={onSaveKanban} disabled={saving}>{saving ? i18n.saving : i18n.saveBoardSet}</button>
    <button class="button _secondary" onclick={onCancelKanban} disabled={saving}>{i18n.cancel}</button>
  {:else if activeKanban}
    <div class="kanban-meta grid gap">
      <b>{activeKanban.name}</b>
      <small>{activeKanban.description || i18n.noDescription}</small>
    </div>
  {/if}

  <div class="toolbar-actions gap _2 flex">
    {#if activeKanban && !editingKanban}
      <button class="icon-button _secondary" disabled={saving || editing} onclick={onEditKanban} aria-label={i18n.editBoardSet} title={i18n.editBoardSet}>
        <svg fill="currentColor"><use href={icon('edit')} /></svg>
      </button>
    {/if}
    <button class="icon-button _secondary" disabled={saving || editing} onclick={onAddKanban} aria-label={i18n.addBoardSet} title={i18n.addBoardSet}>
      <svg fill="currentColor"><use href={icon('add')} /></svg>
    </button>
    <button class="button _secondary" onclick={onToggleFullscreen}>{fullscreen ? i18n.exitFullScreen : i18n.fullScreen}</button>
  </div>
</section>
