<script>
  let { i18n, event = null, saving = false, formatDate, onOpen, onDelete } = $props();
</script>

<article class="box _outer detail grid gap _3">
  <header class="flex gap _2 _space _center _y _wrap">
    <div>
      <span>{i18n.selected}</span>
      <h2>{event?.title ?? i18n.eventDetails}</h2>
    </div>
  </header>

  {#if event}
    <span class={`type ${event.type}`}>{event.type}</span>
    <p>{event.subtitle ?? event.note}</p>
    <div class="date-detail">
      <small>{i18n.start}</small>
      <b>{formatDate(event.starts_at)}</b>
      <small>{i18n.end}</small>
      <b>{event.ends_at ? formatDate(event.ends_at) : i18n.noEnd}</b>
    </div>
    {#if event.email}<small>{event.email}</small>{/if}
    <div class="detail-actions">
      {#if event.href}
        <button class="button _primary" onclick={() => onOpen?.(event.href)}>{i18n.openModule}</button>
      {/if}
      {#if event.type === 'reminder'}
        <button class="button _secondary" onclick={() => onDelete?.(event.id)} disabled={saving}>{i18n.remove}</button>
      {/if}
    </div>
  {:else}
    <p class="empty">{i18n.empty}</p>
  {/if}
</article>

<style>
  .detail {    padding: 18px;
  }

  .date-detail {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 7px 10px;
    border: 1px solid var(--override-border, #eaecf0);
    border-radius: 7px;
    background: var(--override-box, #fcfcfd);
    padding: 10px;
  }

  .type {
    width: fit-content;
    border-radius: 999px;
    background: #eef4ff;
    color: #3538cd;
    padding: 4px 9px;
  }

  .type.rent {
    background: #ecfdf3;
    color: #067647;
  }

  .type.reminder {
    background: #fffaeb;
    color: #b54708;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 18px;
  }

  p,
  small,
  span {
    color: #667085;
  }

  button:disabled {
    opacity: .55;
    cursor: not-allowed;
  }
</style>
