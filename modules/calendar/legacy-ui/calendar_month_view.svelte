<script>
  let {
    weekDays = [],
    monthWeeks = [],
    selectedDate = '',
    weekEventBars,
    onSelectDay,
    onSelectEvent
  } = $props();
</script>

<div class="month-shell grid">
  <div class="weekdays grid">
    {#each weekDays as day}
      <b>{day}</b>
    {/each}
  </div>

  <div class="month-board grid">
    {#each monthWeeks as week}
      <div class="week-row grid">
        <div class="week-days grid">
          {#each week as day}
            <button
              class:muted={day.muted}
              class:past={day.past}
              class:active={day.key === selectedDate}
              class="day-cell flex"
              onclick={() => onSelectDay?.(day.key)}
            >
              <b>{day.date.getDate()}</b>
              {#if day.events.length}<small>{day.events.length}</small>{/if}
            </button>
          {/each}
        </div>

        <div class="week-bars grid">
          {#each weekEventBars?.(week) ?? [] as event}
            <button
              class={`event-bar ${event.type}`}
              style={`grid-column:${event.startIndex + 1} / ${event.endIndex + 2};grid-row:${event.lane + 1};`}
              onclick={() => onSelectEvent?.(event)}
            >
              <span>{event.type}</span>
              <b>{event.title}</b>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .month-shell {
    gap: 0;
    min-width: 0;
  }

  .weekdays {    grid-template-columns: repeat(7, minmax(0, 1fr));
    border: 1px solid var(--override-border, #eaecf0);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: var(--override-box, #f9fafb);
  }

  .weekdays b {
    padding: 10px;
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  .month-board {    border-left: 1px solid var(--override-border, #eaecf0);
    border-top: 1px solid var(--override-border, #eaecf0);
  }

  .week-row {    min-height: 132px;
    border-bottom: 1px solid var(--override-border, #eaecf0);
    position: relative;
    overflow: hidden;
  }

  .week-days,
  .week-bars {
    grid-area: 1 / 1;    grid-template-columns: repeat(7, minmax(0, 1fr));
    height: 100%;
  }

  .week-days {
    align-items: stretch;
  }

  .day-cell {
    width: 100%;
    min-height: 132px;    justify-content: space-between;
    align-items: flex-start;
    border: 0;
    border-right: 1px solid var(--override-border, #eaecf0);
    border-radius: 0;
    background: var(--override-section, #fff);
    color: var(--override-heading, #101828);
    padding: 8px;
    cursor: pointer;
  }

  .day-cell.muted,
  .day-cell.past {
    background: var(--override-box, #f9fafb);
    color: var(--override-muted, #98a2b3);
    opacity: .74;
  }

  .day-cell.active {
    box-shadow: inset 0 0 0 2px var(--override-primary-button, #3538cd);
  }

  .day-cell small {
    min-width: 22px;
    min-height: 22px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--override-box, #eef4ff);
    color: var(--override-heading, #3538cd);
  }

  .week-bars {
    align-content: start;
    grid-template-rows: repeat(4, 22px);
    gap: 2px 0;
    padding: 32px 6px 6px;
    pointer-events: none;
    z-index: 2;
    overflow: hidden;
    box-sizing: border-box;
  }

  .event-bar {
    width: auto;
    min-width: 0;
    min-height: 22px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 1px;
    border: 1px solid #c7d7fe;
    border-radius: 5px;
    background: #eef4ff;
    color: #3538cd;
    padding: 0 7px;
    pointer-events: auto;
    text-align: left;
    box-sizing: border-box;
    cursor: pointer;
  }

  .event-bar.rent {
    border-color: #abefc6;
    background: #ecfdf3;
    color: #067647;
  }

  .event-bar.reminder {
    border-color: #fedf89;
    background: #fffaeb;
    color: #b54708;
  }

  .event-bar span,
  .event-bar b {
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-bar span {
    font-size: 10px;
    font-weight: 760;
    text-transform: uppercase;
  }

  .event-bar b {
    font-size: 12px;
    line-height: 1;
  }

  @media (max-width: 640px) {
    .month-board,
    .weekdays {
      min-width: 760px;
    }
  }
</style>
