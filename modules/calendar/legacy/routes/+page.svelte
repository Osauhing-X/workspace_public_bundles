<script>
  import { onMount } from 'svelte';
  import { labels as i18n } from '../../ui/labels.js';
  import { moduleRequest as fetch } from '../../ui/bridge.js';
  import CalendarBoard from './calendar-board.svelte';

  let events = $state([]);
  let loading = $state(true);
  let saving = $state(false);
  let message = $state(null);
  let error = $state(null);
  let selectedEvent = $state(null);
  let visibleMonth = $state(new Date());
  let selectedDate = $state(dateKey(new Date()));
  let view = $state('month');
  let reminder = $state({ title: '', starts_at: '', note: '' });
  let removeTarget = $state(null);

  const endpoint = () => 'module';
  const monthLabel = $derived(visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  const monthDays = $derived(calendarDays(visibleMonth));
  const monthWeeks = $derived(Array.from({ length: 6 }, (_item, index) => monthDays.slice(index * 7, index * 7 + 7)));
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  onMount(load);

  async function load() {
    loading = true;
    error = null;
    try {
    const res = await fetch(endpoint());
    const json = await res.json().catch(() => ({}));
    loading = false;

    if (!res.ok || json.error) {
      error = json.error ?? 'Calendar failed to load';
      return;
    }

    events = json.events ?? [];
    if (json.errors?.length) error = json.errors.join(' ');
    } catch (reason) { error = reason.message ?? 'Calendar failed to load'; }
    finally { loading = false; }
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDate(value, fallbackKey = '') {
    if (!value && fallbackKey) return new Date(`${fallbackKey}T00:00:00`);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(`${fallbackKey}T00:00:00`) : date;
  }

  function eventRange(event) {
    const start = parseDate(event.starts_at);
    const end = event.ends_at ? parseDate(event.ends_at) : start;
    return end < start ? { start, end: start } : { start, end };
  }

  function eventOverlapsDay(event, key) {
    const { start, end } = eventRange(event);
    const dayStart = new Date(`${key}T00:00:00`);
    const dayEnd = new Date(`${key}T23:59:59`);
    return start <= dayEnd && end >= dayStart;
  }

  function eventsForDay(key) {
    return events
      .filter((event) => eventOverlapsDay(event, key))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  }

  function calendarDays(source) {
    const year = source.getFullYear();
    const month = source.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - startOffset);
    const today = dateKey(new Date());

    return Array.from({ length: 42 }, (_item, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      return {
        key,
        date,
        muted: date.getMonth() !== month,
        past: key < today,
        events: eventsForDay(key)
      };
    });
  }

  function moveMonth(delta) {
    const next = new Date(visibleMonth);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    visibleMonth = next;
  }

  function moveCalendar(delta) {
    if (view === 'day') {
      setSelectedDay(delta);
      return;
    }

    moveMonth(delta);
  }

  function setSelectedDay(delta) {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + delta);
    selectedDate = dateKey(next);
    visibleMonth = next;
  }

  function goToday() {
    const today = new Date();
    selectedDate = dateKey(today);
    visibleMonth = today;
  }

  function selectDay(key) {
    selectedDate = key;
    const next = new Date(`${key}T12:00:00`);
    if (!Number.isNaN(next.getTime())) visibleMonth = next;
    view = 'day';
  }

  function weekEventBars(week) {
    const weekStart = week[0]?.key;
    const weekEnd = week[6]?.key;
    if (!weekStart || !weekEnd) return [];

    const bars = events
      .filter((event) => eventOverlapsDay(event, weekStart) || eventOverlapsDay(event, weekEnd) || (dateKey(eventRange(event).start) <= weekEnd && dateKey(eventRange(event).end) >= weekStart))
      .map((event) => {
        const { start, end } = eventRange(event);
        const startKey = dateKey(start) < weekStart ? weekStart : dateKey(start);
        const endKey = dateKey(end) > weekEnd ? weekEnd : dateKey(end);
        const startIndex = week.findIndex((day) => day.key === startKey);
        const endIndex = week.findIndex((day) => day.key === endKey);
        const safeStart = Math.max(0, startIndex);
        const safeEnd = Math.max(safeStart, endIndex);
        return {
          ...event,
          startIndex: safeStart,
          endIndex: safeEnd,
          lane: 0
        };
      })
      .sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);

    const lanes = [];
    return bars.map((bar) => {
      let lane = lanes.findIndex((end) => end < bar.startIndex);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(bar.endIndex);
      } else {
        lanes[lane] = bar.endIndex;
      }
      return { ...bar, lane };
    });
  }

  async function saveReminder(event) {
    event.preventDefault();
    saving = true;
    error = null;
    message = null;
    try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: reminder.id ? 'update_reminder' : 'reminder', reminder: { ...reminder, starts_at: new Date(reminder.starts_at).toISOString() } })
    });
    const json = await res.json().catch(() => ({}));
    saving = false;

    if (!res.ok || json.error) {
      error = json.error ?? 'Reminder failed to save';
      return;
    }

    reminder = { title: '', starts_at: '', note: '' };
    message = 'Reminder saved.';
    await load();
    selectedEvent = null;
    } catch (reason) { error = reason.message ?? 'Reminder failed to save'; }
    finally { saving = false; }
  }

  async function deleteReminder(id) {
    saving = true;
    error = null;
    message = null;
    try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_reminder', id })
    });
    const json = await res.json().catch(() => ({}));
    saving = false;

    if (!res.ok || json.error) {
      error = json.error ?? 'Reminder failed to remove';
      return;
    }

    selectedEvent = null;
    removeTarget = null;
    message = 'Reminder removed.';
    await load();
    } catch (reason) { error = reason.message ?? 'Reminder failed to remove'; }
    finally { saving = false; }
  }

  function formatDate(value) {
    if (!value) return 'No date';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function openEventModule() { error = 'This event source is not connected yet.'; }
  function editReminder(event) {
    const date = new Date(event.starts_at);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    reminder = { id: event.id, title: event.title, starts_at: local, note: event.note ?? '' };
  }
  function cancelEdit() { reminder = { title: '', starts_at: '', note: '' }; }
</script>


<main class="calendar-module grid gap _3">
  <p class="feed-notice">Saved reminders are available here. Booking and Rent feeds are not connected yet.</p>

  {#if error}<p role="alert" class="alert error">{error}</p>{/if}
  {#if message}<p role="status" class="alert success">{message}</p>{/if}
  {#if removeTarget}<div role="alertdialog" tabindex="-1" aria-label="Remove reminder" class="box _outer grid gap"><p>Remove this reminder permanently?</p><div class="flex gap"><button disabled={saving} onclick={() => deleteReminder(removeTarget)}>Remove reminder</button><button onclick={() => removeTarget = null}>Cancel</button></div></div>{/if}

  <CalendarBoard
    {i18n}
    {loading}
    {saving}
    bind:view
    bind:selectedDate
    bind:selectedEvent
    bind:reminder
    {monthLabel}
    {weekDays}
    {monthWeeks}
    {events}
    {weekEventBars}
    onMoveCalendar={moveCalendar}
    onGoToday={goToday}
    onSelectDay={selectDay}
    onOpenEventModule={openEventModule}
    onDeleteReminder={id => removeTarget = id}
    onEditReminder={editReminder}
    onCancelEdit={cancelEdit}
    onSaveReminder={saveReminder}
    {formatDate} />
</main>

<style>
  main { box-sizing: border-box; width: 100%; max-width: 1440px; margin-inline: auto; padding: clamp(16px, 2.4vw, 32px); }
  .alert { padding: 12px; border: 1px solid; border-radius: 6px; }
  .error { color: #912018; background: #fff4f2; }
  .success { color: #067647; background: #f6fef9; }
  :global(.calendar-module .calendar-panel) {
    padding: 18px;
  }

  :global(.calendar-module .view-switch) {
    min-height: 38px;
    display: inline-grid;
    grid-template-columns: repeat(2, minmax(68px, 1fr));
    align-items: center;
    padding: 4px;
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    background: #f9fafb;
    box-sizing: border-box;
  }

  :global(.calendar-module h2),
  :global(.calendar-module p) {
    margin: 0;
  }

  :global(.calendar-module h2) {
    font-size: 18px;
  }

  :global(.calendar-module p),
  :global(.calendar-module span) {
    color: #667085;
  }

  :global(.calendar-module .view-switch button) {
    min-height: 30px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--override-text, #344054);
    padding: 0 13px;
    font-weight: 720;
    white-space: nowrap;
    box-shadow: none;
  }

  :global(.calendar-module .view-switch button.active) {
    background: var(--override-primary-button, #101828);
    color: var(--override-primary-button-text, #fff);
    box-shadow: 0 1px 2px rgba(16, 24, 40, .16);
  }

  :global(.calendar-module button:disabled) {
    opacity: .55;
    cursor: not-allowed;
  }

  :global(.calendar-module .empty) {
    color: #667085;
  }

  :global(.calendar-module > .calender) {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
  }

  @media (max-width: 900px) {
    :global(.calendar-module > .calender) {
      grid-template-columns: 1fr;
    }
  }
  :global(.calendar-module .calendar-panel), :global(.calendar-module .side){min-width:0}

  @media (max-width: 640px) {
    :global(.calendar-module .calendar-panel) {
      overflow-x: auto;
    }

    :global(.calendar-module .calendar-panel header) {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
