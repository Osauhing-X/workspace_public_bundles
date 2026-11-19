/** Move only a card and column already present in this board set. */
export function relocatedCards(board, cardId, columnId, updatedAt = new Date().toISOString()) {
  if (!board?.boards?.some(column => column.id === columnId)) return null;
  const source = board.cards?.find(card => card.id === cardId);
  if (!source || source.board_id === columnId) return null;
  const orderOf = card => Number.isSafeInteger(card.order) && card.order >= 0 ? card.order : 0;
  const target = board.cards.filter(card => card.board_id === columnId).sort((a,b) => orderOf(a)-orderOf(b));
  const largest = target.reduce((maximum,card) => Math.max(maximum,orderOf(card)), -1);
  const reindexed = largest === Number.MAX_SAFE_INTEGER ? new Map(target.map((card,index) => [card.id,index])) : null;
  const order = reindexed ? target.length : largest + 1;
  return board.cards.map(card => card.id === cardId
    ? {...card,board_id:columnId,order,updated_at:updatedAt}
    : reindexed?.has(card.id) ? {...card,order:reindexed.get(card.id)} : card);
}

export function beginCardDrag(event, cardId, disabled = false) {
  if (disabled || !event.dataTransfer || event.target?.closest?.('button,input,select,textarea,a')) {
    event.preventDefault(); return null;
  }
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain',cardId);
  event.stopPropagation();
  return cardId;
}
