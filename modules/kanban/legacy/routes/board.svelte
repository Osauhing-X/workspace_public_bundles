<script>
  import CardEditor from './card-editor.svelte';
  let {
    i18n,
    activeKanban,
    saving = false,
    editing = false,
    draggedCard = $bindable(null),
    onAddBoard,
    onStartBoardEdit,
    onStopBoardEdit,
    onSaveBoard,
    onDeleteBoard,
    onAddCard,
    onStartCardEdit,
    onStopCardEdit,
    onSaveCard,
    onDeleteCard,
    onToggleDone,
    onAssign,
    onUnassign,
    onMoveCard,
    onDropCard,
    isBoardEditing,
    isCardEditing,
    cardsFor,
    boardProgress
  } = $props();

  function icon(id) {
    return `#${id}`;
  }
</script>

<section class="board-shell gap _2 grid" aria-label={i18n.kanbanBoardLabel}>
  {#each activeKanban.boards as board}
    {@const progress = boardProgress(board.id)}
    <article
      class="board box _outer gap _2 grid"
      ondragover={(event) => event.preventDefault()}
      ondrop={() => onDropCard?.(board.id)}
    >
      <header class="grid gap _2">
        <details>
          <summary class="flex gap _2 _space _center _y">
            <div class="grid gap">
              <b>{board.name || i18n.untitledBoard}</b>
              <small>{cardsFor(board.id).length + cardsFor(board.id, true).length} {i18n.cards}</small>
            </div>
          </summary>
          {#if board.description}
            <p>{board.description}</p>
          {:else}
            <p class="muted">{i18n.noDescription}</p>
          {/if}
          <div class="board-actions gap _2 flex">
            <button class="icon-button _secondary" onclick={() => onStartBoardEdit?.(board.id)} aria-label={i18n.editBoard} title={i18n.editBoard}>
              <svg fill="currentColor"><use href={icon('edit')} /></svg>
            </button>
            <button class="icon-button _danger" onclick={() => onDeleteBoard?.(board.id)} aria-label={i18n.deleteBoard} title={i18n.deleteBoard}>
              <svg fill="currentColor"><use href={icon('delete')} /></svg>
            </button>
          </div>
        </details>
        {#if progress}
          <div class="progress grid gap" aria-label={`${progress.percent}% ${i18n.complete}`}>
            <span style={`width:${progress.percent}%`}></span>
          </div>
          <small>{progress.done}/{progress.total} {i18n.completed}</small>
        {/if}
      </header>

      {#if isBoardEditing(board.id)}
        <div class="edit-panel gap _2 grid">
          <label class="grid gap">{i18n.boardName} <input disabled={saving} bind:value={board.name}></label>
          <label class="grid gap">{i18n.descriptionLabel} <textarea disabled={saving} rows="2" bind:value={board.description}></textarea></label>
          <div class="edit-actions gap _2 flex">
            <button class="button _primary" onclick={() => onSaveBoard?.(board.id)} disabled={saving}>{saving ? i18n.saving : i18n.saveBoard}</button>
            <button class="button _secondary" disabled={saving} onclick={() => onStopBoardEdit?.(board.id)}>{i18n.cancel}</button>
          </div>
        </div>
      {/if}

      <div class="cards gap _2 grid">
        {#each cardsFor(board.id) as card}
          <div
            class="task box _inner grid gap"
            class:important={card.important}
            role="group"
            aria-label={`${i18n.cardLabel}: ${card.title}`}
            draggable={!saving && !editing}
            ondragstart={() => draggedCard = card.id}
            ondragend={() => draggedCard = null}
          >
            {#if isCardEditing(card.id)}
              <CardEditor {card} {i18n} {saving} {onSaveCard} {onStopCardEdit} />
            {:else}
              <details class="card-details">
                <summary class="flex gap _2 _space _center _y">
                  <input type="checkbox" checked={card.done} disabled={saving || editing} aria-label={i18n.markComplete} onclick={(event) => event.stopPropagation()} onchange={() => onToggleDone?.(card)}>
                  <b>{card.title || i18n.untitledCard}</b>
                  {#if card.important}<span class="badge flex">{i18n.important}</span>{/if}
                </summary>
                {#if card.description}<p>{card.description}</p>{/if}
                {#if card.starts_at || card.ends_at}
                  <small>{card.starts_at || i18n.noStart} - {card.ends_at || i18n.noEnd}</small>
                {/if}
                {#if card.note}<p class="note">{card.note}</p>{/if}
                {#if card.assigned?.length}
                  <div class="chips gap _2 flex">
                    {#each card.assigned as email}
                      <button class="chip" onclick={() => onUnassign?.(card, email)} title={i18n.removeAssignee}>{email}</button>
                    {/each}
                  </div>
                {/if}
                <div class="card-actions gap _2 flex">
                  <button class="button _secondary" onclick={() => onAssign?.(card)}>{i18n.assignMe}</button>
                  <span class="quick-actions gap _2 flex">
                    <button class="icon-button _secondary" onclick={() => onStartCardEdit?.(card.id)} aria-label={i18n.editCard} title={i18n.editCard}>
                      <svg fill="currentColor"><use href={icon('edit')} /></svg>
                    </button>
                    <button class="icon-button _danger" onclick={() => onDeleteCard?.(card.id)} aria-label={i18n.deleteCard} title={i18n.deleteCard}>
                      <svg fill="currentColor"><use href={icon('delete')} /></svg>
                    </button>
                  </span>
                </div>
                <label class="mobile-move grid gap">
                  {i18n.moveTo}
                  <select aria-label={i18n.moveTo} value={card.board_id} disabled={saving || editing} onchange={(event) => onMoveCard?.(card, event.currentTarget.value)}>
                    {#each activeKanban.boards as target}
                      <option value={target.id}>{target.name}</option>
                    {/each}
                  </select>
                </label>
              </details>
            {/if}
          </div>
        {/each}
      </div>

      <div class="board-footer gap _2 grid">
        <button class="button _secondary" onclick={() => onAddCard?.(board.id)}>{i18n.addCard}</button>
      </div>

      {#if cardsFor(board.id, true).length}
        <details class="done-section">
          <summary class="flex gap _2 _space _center _y">{i18n.completed} ({cardsFor(board.id, true).length})</summary>
          <div class="cards gap _2 grid">
            {#each cardsFor(board.id, true) as card}
              <div
                class="task done box _inner grid gap"
                role="group"
                aria-label={`${i18n.completedCardLabel}: ${card.title}`}
                draggable={!saving && !editing}
                ondragstart={() => draggedCard = card.id}
                ondragend={() => draggedCard = null}
              >
                {#if isCardEditing(card.id)}
                  <CardEditor {card} {i18n} {saving} {onSaveCard} {onStopCardEdit} />
                {:else}
                <details class="card-details">
                  <summary class="flex gap _2 _space _center _y">
                    <input type="checkbox" checked={card.done} disabled={saving || editing} aria-label={i18n.reopenCard} onclick={(event) => event.stopPropagation()} onchange={() => onToggleDone?.(card)}>
                    <b>{card.title || i18n.untitledCard}</b>
                  </summary>
                  {#if card.description}<p>{card.description}</p>{/if}
                  <div class="card-actions gap _2 flex">
                    <button class="button _secondary" onclick={() => onAssign?.(card)}>{i18n.assignMe}</button>
                    <span class="quick-actions gap _2 flex">
                      <button class="icon-button _secondary" onclick={() => onStartCardEdit?.(card.id)} aria-label={i18n.editCard} title={i18n.editCard}>
                        <svg fill="currentColor"><use href={icon('edit')} /></svg>
                      </button>
                      <button class="icon-button _danger" onclick={() => onDeleteCard?.(card.id)} aria-label={i18n.deleteCard} title={i18n.deleteCard}>
                        <svg fill="currentColor"><use href={icon('delete')} /></svg>
                      </button>
                    </span>
                  </div>
                  <label class="mobile-move grid gap">{i18n.moveTo}<select aria-label={i18n.moveTo} value={card.board_id} disabled={saving || editing} onchange={(event) => onMoveCard?.(card, event.currentTarget.value)}>{#each activeKanban.boards as target}<option value={target.id}>{target.name}</option>{/each}</select></label>
                </details>
                {/if}
              </div>
            {/each}
          </div>
        </details>
      {/if}
    </article>
  {/each}

  <article class="add-board box _outer gap _2 grid">
    <button class="button _primary" onclick={onAddBoard}>{i18n.addBoard}</button>
  </article>
</section>
