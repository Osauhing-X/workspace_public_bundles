<script>
  import CalendarEventDetail from '../ui/calendar_event_detail.svelte';
  import CalendarReminderForm from '../ui/calendar_reminder_form.svelte';
  import CalendarMonthView from '../ui/calendar_month_view.svelte';
  import CalendarDayView from '../ui/calendar_day_view.svelte';

  let {
    i18n,
    loading = false,
    saving = false,
    view = $bindable('month'),
    selectedDate = $bindable(''),
    selectedEvent = $bindable(null),
    reminder = $bindable(),
    monthLabel = '',
    weekDays = [],
    monthWeeks = [],
    events = [],
    weekEventBars,
    onMoveCalendar,
    onGoToday,
    onSelectDay,
    onOpenEventModule,
    onDeleteReminder,
    onEditReminder,
    onCancelEdit,
    onSaveReminder,
    formatDate
  } = $props();
</script>

<section class="calender grid gap _3">
  <article class="box _outer calendar-panel gap _3 grid">
    <header class="flex gap _2 _space _center _y _wrap">
      <div>
        <span>{view === 'month' ? i18n.month : i18n.day}</span>
        <h2>{view === 'month' ? monthLabel : new Date(`${selectedDate}T12:00:00`).toLocaleDateString()}</h2>
      </div>
      <div class="month-actions flex gap _2 _wrap">
        <div class="view-switch" role="tablist" aria-label="Calendar view">
          <button type="button" role="tab" aria-selected={view === 'month'} class:active={view === 'month'} onclick={() => view = 'month'}>{i18n.month}</button>
          <button type="button" role="tab" aria-selected={view === 'day'} class:active={view === 'day'} onclick={() => view = 'day'}>{i18n.day}</button>
        </div>
        <button class="button _secondary" onclick={() => onMoveCalendar?.(-1)}>{i18n.previous}</button>
        <button class="button _secondary" onclick={onGoToday}>{i18n.today}</button>
        <button class="button _secondary" onclick={() => onMoveCalendar?.(1)}>{i18n.next}</button>
      </div>
    </header>

    {#if loading}
      <p class="empty">{i18n.loading}</p>
    {:else if view === 'month'}
      <CalendarMonthView
        {weekDays}
        {monthWeeks}
        {selectedDate}
        {weekEventBars}
        onSelectDay={onSelectDay}
        onSelectEvent={(event) => selectedEvent = event}
      />
    {:else}
      <CalendarDayView
        {selectedDate}
        {events}
        onDateChange={onSelectDay}
        onSelectEvent={(event) => selectedEvent = event}
      />
    {/if}
  </article>

  <aside class="side gap _3 grid">
    <CalendarEventDetail
      {i18n}
      event={selectedEvent}
      {saving}
      {formatDate}
      onOpen={onOpenEventModule}
      onDelete={onDeleteReminder}
      onEdit={onEditReminder}
    />
    <CalendarReminderForm {i18n} bind:reminder {saving} onSave={onSaveReminder} onCancel={onCancelEdit} />
  </aside>
</section>
