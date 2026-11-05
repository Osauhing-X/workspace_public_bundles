<script>
  import { onMount } from 'svelte';
  import actionButtons from '../../ui/action_buttons.svg?raw';
  import { moduleRequest as fetch } from '../../ui/bridge.js';
  import { labels as i18n } from '../../ui/labels.js';
  import Toolbar from './toolbar.svelte';
  import EmptyBoard from './empty-board.svelte';
  import Board from './board.svelte';


  let loading = $state(true);
  let saving = $state(false);
  let error = $state(null);
  let message = $state(null);
  let settings = $state({ active_kanban_id: 'default', kanbans: [] });
  let exists = $state(false);
  let userEmail = $state('');
  let draggedCard = $state(null);
  let editingBoards = $state([]);
  let editingCards = $state([]);
  let editingKanban = $state(false);
  let editBaseline = $state(null);
  const editing = $derived(editBaseline !== null);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function canChange() {
    if (saving) return false;
    if (editing) { error = 'Save or cancel your current draft first.'; return false; }
    return true;
  }
  function beginEdit() {
    if (!canChange()) return false;
    editBaseline = copy(settings);
    return true;
  }
  function clearEdit() { editBaseline = null; editingKanban = false; editingBoards = []; editingCards = []; }
  function cancelEdit() {
    if (saving) return;
    if (editBaseline) settings = copy(editBaseline);
    clearEdit(); error = null;
  }
  async function change(mutate, success) {
    if (!canChange()) return;
    const previous = copy(settings);
    mutate();
    if (!await persist(success)) settings = previous;
  }
  async function selectKanban(id) {
    await change(() => settings.active_kanban_id = id, i18n.saved);
  }
  let fullscreen = $state(false);
  let mainElement = $state(null);
  let deletion = $state(null);
  function confirmDeletion(text) { return new Promise(resolve => { deletion = { text, resolve }; }); }
  function finishDeletion(answer) { deletion.resolve(answer); deletion = null; }

  const endpoint = () => 'module';
  const activeKanban = $derived(settings.kanbans?.find((kanban) => kanban.id === settings.active_kanban_id) ?? settings.kanbans?.[0]);

  onMount(() => {
    load();
    const syncFullscreen = () => {
      fullscreen = document.fullscreenElement === mainElement
        || document.webkitFullscreenElement === mainElement
        || document.mozFullScreenElement === mainElement
        || document.msFullscreenElement === mainElement;
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    document.addEventListener('mozfullscreenchange', syncFullscreen);
    document.addEventListener('MSFullscreenChange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      document.removeEventListener('mozfullscreenchange', syncFullscreen);
      document.removeEventListener('MSFullscreenChange', syncFullscreen);
    };
  });

  async function load() {
    loading = true;
    error = null;
    try {
    const res = await fetch(endpoint());
    const json = await res.json().catch(() => ({}));
    loading = false;
    if (!res.ok || json.error) {
      error = json.error ?? i18n.loadFailed;
      return;
    }
    settings = json.settings ?? settings;
    exists = !!json.exists;
    userEmail = json.user_email ?? '';
    } catch (reason) { error = reason.message ?? i18n.loadFailed; }
    finally { loading = false; }
  }

  async function post(body) {
    if (saving) return null;
    saving = true;
    error = null;
    message = null;
    try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    saving = false;
    if (!res.ok || json.error) {
      error = json.error ?? i18n.actionFailed;
      return null;
    }
    return json;
    } catch (reason) { error = reason.message ?? i18n.actionFailed; return null; }
    finally { saving = false; }
  }

  async function setup() {
    const result = await post({ action: 'setup' });
    if (result) {
      message = i18n.enabled;
      await load();
    }
  }

  async function persist(success = i18n.saved) {
    const result = await post({ action: 'settings', settings });
    if (!result) return false;
    settings = result.settings;
    message = success;
    return true;
  }

  function icon(id) {
    return `#${id}`;
  }

  function toggleFullscreen() {
    fullscreen = !fullscreen;
  }

  function addKanban() {
    if (!beginEdit()) return;
    const id = `kanban-${Date.now()}`;
    settings.kanbans = [
      ...(settings.kanbans ?? []),
      { id, name: i18n.newBoardSet, description: '', boards: [], cards: [] }
    ];
    settings.active_kanban_id = id;
    editingKanban = true;
  }

  async function saveKanbanMeta() {
    if (await persist(i18n.boardSetSaved)) clearEdit();
  }

  function startBoardEdit(id) {
    if (beginEdit()) editingBoards = [id];
  }

  function stopBoardEdit(id) {
    cancelEdit();
  }

  function startCardEdit(id) {
    if (beginEdit()) editingCards = [id];
  }

  function stopCardEdit(id) {
    cancelEdit();
  }

  function isBoardEditing(id) {
    return editingBoards.includes(id);
  }

  function isCardEditing(id) {
    return editingCards.includes(id);
  }

  function addBoard() {
    if (!activeKanban) return;
    if (!beginEdit()) return;
    const id = `board-${Date.now()}`;
    activeKanban.boards = [
      ...(activeKanban.boards ?? []),
      { id, name: i18n.newBoard, description: '', order: activeKanban.boards?.length ?? 0 }
    ];
    editingBoards = [id];
  }

  async function saveBoard(boardId) {
    if (await persist(i18n.boardSaved)) clearEdit();
  }

  async function deleteBoard(boardId) {
    if (!canChange()) return;
    if (!await confirmDeletion(i18n.deleteBoardConfirm)) return;
    await change(() => {
    activeKanban.cards = (activeKanban.cards ?? []).filter((card) => card.board_id !== boardId);
    activeKanban.boards = (activeKanban.boards ?? [])
      .filter((board) => board.id !== boardId)
      .map((board, index) => ({ ...board, order: index }));
    editingBoards = editingBoards.filter((item) => item !== boardId);
    }, i18n.boardDeleted);
  }

  function addCard(boardId) {
    if (!activeKanban) return;
    if (!beginEdit()) return;
    const id = `card-${Date.now()}`;
    activeKanban.cards = [
      ...(activeKanban.cards ?? []),
      {
        id,
        board_id: boardId,
        title: i18n.newTask,
        description: '',
        assigned: [],
        starts_at: '',
        ends_at: '',
        important: false,
        done: false,
        note: '',
        order: cardsFor(boardId).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    editingCards = [id];
  }

  async function saveCard(cardId) {
    const card = activeKanban?.cards?.find((item) => item.id === cardId);
    if (card) card.updated_at = new Date().toISOString();
    if (await persist(i18n.cardSaved)) clearEdit();
  }

  async function deleteCard(cardId) {
    if (!canChange()) return;
    if (!await confirmDeletion(i18n.deleteCardConfirm)) return;
    await change(() => {
    activeKanban.cards = (activeKanban.cards ?? []).filter((card) => card.id !== cardId);
    editingCards = editingCards.filter((item) => item !== cardId);
    }, i18n.cardDeleted);
  }

  async function toggleDone(card) {
    const success = !card.done ? i18n.cardCompleted : i18n.cardReopened;
    await change(() => {
    card.done = !card.done;
    card.updated_at = new Date().toISOString();
    }, success);
  }

  async function assign(card) {
    const email = String(userEmail ?? '').trim().toLowerCase();
    if (!email) { error = 'Your authenticated Core account has no email. Configure an administrator email before assigning tasks.'; return; }
    await change(() => card.assigned = [...new Set([...(card.assigned ?? []), email])], i18n.assignmentSaved);
  }

  async function unassign(card, email) {
    await change(() => card.assigned = (card.assigned ?? []).filter((item) => item !== email), i18n.assignmentRemoved);
  }

  function cardsFor(boardId, done = false) {
    return (activeKanban?.cards ?? [])
      .filter((card) => card.board_id === boardId && !!card.done === done)
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  }

  function boardProgress(boardId) {
    const cards = (activeKanban?.cards ?? []).filter((card) => card.board_id === boardId);
    if (!cards.length) return null;
    const done = cards.filter((card) => card.done).length;
    return { done, total: cards.length, percent: Math.round((done / cards.length) * 100) };
  }

  async function moveCard(card, boardId) {
    if (card.board_id === boardId) return;
    await change(() => {
    card.board_id = boardId;
    card.order = (activeKanban?.cards ?? []).filter((item) => item.board_id === boardId).length;
    card.updated_at = new Date().toISOString();
    }, i18n.cardMoved);
  }

  async function dropCard(boardId) {
    if (!draggedCard) return;
    const card = activeKanban?.cards?.find((item) => item.id === draggedCard);
    if (card) await moveCard(card, boardId);
    draggedCard = null;
  }
</script>

<div class="sprite grid gap" aria-hidden="true">{@html actionButtons}</div>


<main bind:this={mainElement} class:fullscreen class="kanban-module grid gap _3">

  {#if deletion}<div tabindex="-1" class="box _outer grid gap" role="alertdialog" aria-label="Confirm deletion"><p>{deletion.text}</p><div class="flex gap"><button onclick={() => finishDeletion(true)}>Delete</button><button onclick={() => finishDeletion(false)}>Cancel</button></div></div>{/if}
  {#if error}<p role="alert" class="alert error">{error}</p>{/if}
  {#if message}<p class="alert success">{message}</p>{/if}

  {#if loading}
    <section class="box _outer">{i18n.loading}</section>
  {:else if !exists}
    <section class="box _outer setup gap _2 grid">
      <h2>{i18n.enableTitle}</h2>
      <p>{i18n.enableDescription}</p>
      <button class="button _primary" onclick={setup} disabled={saving}>{saving ? i18n.enabling : i18n.enable}</button>
    </section>
  {:else}
    <Toolbar
      {i18n}
      bind:settings
      {activeKanban}
      {editingKanban}
      {fullscreen}
      {saving}
      {editing}
      onEditKanban={() => { if (beginEdit()) editingKanban = true; }}
      onCancelKanban={cancelEdit}
      onSelectKanban={selectKanban}
      onSaveKanban={saveKanbanMeta}
      onAddKanban={addKanban}
      onToggleFullscreen={toggleFullscreen} />

    {#if !activeKanban?.boards?.length}
      <EmptyBoard {i18n} onAddBoard={addBoard} />
    {:else}
      <Board
        {i18n}
        {activeKanban}
        {saving}
        {editing}
        bind:draggedCard
        onAddBoard={addBoard}
        onStartBoardEdit={startBoardEdit}
        onStopBoardEdit={stopBoardEdit}
        onSaveBoard={saveBoard}
        onDeleteBoard={deleteBoard}
        onAddCard={addCard}
        onStartCardEdit={startCardEdit}
        onStopCardEdit={stopCardEdit}
        onSaveCard={saveCard}
        onDeleteCard={deleteCard}
        onToggleDone={toggleDone}
        onAssign={assign}
        onUnassign={unassign}
        onMoveCard={moveCard}
        onDropCard={dropCard}
        {isBoardEditing}
        {isCardEditing}
        {cardsFor}
        {boardProgress} />
    {/if}
  {/if}
</main>

<style>
  main { width: 100%; margin: 0; padding: clamp(16px, 2.4vw, 32px); }
  .sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
  main.fullscreen { position: fixed; inset: 0; z-index: 50; overflow: auto; background: var(--x_light_1, #f6f7f9); }
  .setup { padding: 18px; }
  :global(.kanban-module.fullscreen .hero) {
    display: none;
  }

  :global(.kanban-module .hero),
  :global(.kanban-module .setup),
  :global(.kanban-module .empty),
  :global(.kanban-module .kanban-toolbar) {
    padding: 18px;
  }

  :global(.kanban-module .kanban-toolbar) {
    align-items: end;
    flex-wrap: wrap;
  }

  :global(.kanban-module .kanban-toolbar > div),
  :global(.kanban-module .kanban-toolbar label) {
    min-width: min(220px, 100%);
  }

  :global(.kanban-module .kanban-meta) {
    min-width: 220px;
  }

  :global(.kanban-module .toolbar-actions) {
    margin-left: auto;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  :global(.kanban-module .board-shell) {
    grid-auto-flow: column;
    grid-auto-columns: minmax(290px, 340px);
    overflow-x: auto;
    padding-bottom: 10px;
    scroll-snap-type: x proximity;
  }

  :global(.kanban-module.fullscreen .board-shell) {
    height: calc(100dvh - 116px);
    min-height: 0;
  }

  :global(.kanban-module .board),
  :global(.kanban-module .add-board) {
    scroll-snap-align: start;
  }

  :global(.kanban-module .board) {
    min-height: 380px;
    max-height: calc(100dvh - 230px);
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    padding: 0;
    overflow: hidden;
  }

  :global(.kanban-module .board > header) {
    padding: 14px;
    border-bottom: 1px solid var(--override-border, #d9dee7);
    background: color-mix(in srgb, var(--override-section, #fff) 97%, #101828 3%);
  }

  :global(.kanban-module .board details),
  :global(.kanban-module .card-details) {
    display: grid;
  }

  :global(.kanban-module .board details[open]),
  :global(.kanban-module .card-details[open]) {
    gap: 10px;
  }

  :global(.kanban-module .board > header summary),
  :global(.kanban-module .card-details summary) {
    cursor: pointer;
  }

  :global(.kanban-module .board > header summary div) {
    display: grid;
    gap: 2px;
  }

  :global(.kanban-module .progress) {
    height: 9px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--override-border, #d9dee7) 55%, #101828 45%);
    border-radius: 999px;
    background: color-mix(in srgb, var(--override-section, #fff) 60%, #101828 40%);
    box-shadow: inset 0 1px 2px rgba(16, 24, 40, .18);
  }

  :global(.kanban-module .progress span) {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--x_brand, #da3);
    box-shadow: 0 0 0 1px rgba(255,255,255,.28) inset;
  }

  :global(.kanban-module .edit-panel) {
    margin: 0 12px;
  }

  :global(.kanban-module .cards) {
    min-height: 0;
    align-content: start;
    overflow-y: auto;
    padding: 0 12px;
  }

  :global(.kanban-module .board-footer) {
    padding: 0 12px 12px;
  }

  :global(.kanban-module .done-section) {
    border-top: 1px solid var(--override-border, #d9dee7);
    padding: 10px 0 12px;
  }

  :global(.kanban-module .done-section > summary) {
    padding: 0 12px 8px;
    color: var(--override-muted, #667085);
    font-size: 13px;
    cursor: pointer;
  }

  :global(.kanban-module .task) {
    padding: 12px;
    transition: opacity .16s ease, transform .16s ease;
  }

  :global(.kanban-module .task.done:not(:hover)) {
    opacity: .7;
  }

  :global(.kanban-module .task.important) {
    border-color: #fedf89;
    background: #fffaeb;
  }

  :global(.kanban-module .card-details summary) {
    justify-content: flex-start;
  }

  :global(.kanban-module .card-grid) {
    grid-template-columns: 1fr 1fr;
  }

  :global(.kanban-module .board-actions),
  :global(.kanban-module .edit-actions),
  :global(.kanban-module .card-actions),
  :global(.kanban-module .quick-actions),
  :global(.kanban-module .chips) {
    flex-wrap: wrap;
    align-items: center;
  }

  :global(.kanban-module .board-actions),
  :global(.kanban-module .edit-actions) {
    justify-content: flex-end;
  }

  :global(.kanban-module .board-actions) {
    width: fit-content;
    margin-left: auto;
    border: 1px solid var(--override-border, #d9dee7);
    border-radius: 10px;
    background: var(--override-box, #fcfcfd);
    padding: 6px;
  }

  :global(.kanban-module .card-actions) {
    justify-content: space-between;
  }

  :global(.kanban-module .icon-button) {
    width: 40px;
    height: 40px;
    display: inline-grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
  }

  :global(.kanban-module .icon-button._secondary) {
    border-color: var(--override-border, #d0d5dd);
    background: var(--override-secondary-button, #f2f4f7);
    color: var(--override-secondary-button-text, #344054);
  }

  :global(.kanban-module .icon-button._danger) {
    background: #b42318;
    color: #fff;
  }

  :global(.kanban-module .icon-button svg) {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }

  :global(.kanban-module .chip),
  :global(.kanban-module .badge) {
    min-height: 30px;
    border: 1px solid var(--override-border, #d9dee7);
    border-radius: 999px;
    background: var(--override-section, #fff);
    color: var(--override-text, #344054);
    padding: 0 10px;
  }

  :global(.kanban-module .badge) {
    align-items: center;
    background: #fffaeb;
    color: #b54708;
    font-size: 12px;
  }

  :global(.kanban-module .add-board) {
    min-height: 160px;
    place-items: center;
    padding: 18px;
  }

  :global(.kanban-module label) {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  :global(.kanban-module .toggle) {
    align-items: center;
  }

  :global(.kanban-module h1),
  :global(.kanban-module h2),
  :global(.kanban-module p) {
    margin: 0;
  }

  :global(.kanban-module p) {
    line-height: 1.5;
  }

  :global(.kanban-module span),
  :global(.kanban-module small),
  :global(.kanban-module .muted) {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  :global(.kanban-module .note) {
    border-left: 3px solid var(--override-border, #d9dee7);
    padding-left: 10px;
    color: var(--override-muted, #667085);
  }

  @media (max-width: 720px) {
    :global(.kanban-module .board-shell) {
      grid-auto-columns: minmax(86vw, 1fr);
    }

    :global(.kanban-module .kanban-toolbar) {
      align-items: stretch;
    }

    :global(.kanban-module .kanban-toolbar > *) {
      width: 100%;
    }

    :global(.kanban-module .toolbar-actions) {
      margin-left: 0;
      justify-content: flex-start;
    }
  }
</style>
