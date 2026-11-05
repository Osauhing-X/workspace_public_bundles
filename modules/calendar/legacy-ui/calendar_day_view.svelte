<script>
  import { onDestroy } from 'svelte';

  let {
    selectedDate = '',
    events = [],
    onDateChange,
    onSelectEvent
  } = $props();

  let dayScroller = $state();
  let shiftingDayScroll = false;
  let dayScrollTimer = null;
  let dayDrag = $state(null);
  let centeredDay = '';
  let hourStart = $state(0);
  let viewportWidth = $state(0);

  const DAY_HOUR_WIDTH = $derived(Math.max(52, viewportWidth / 24));
  const DAY_CENTER_HOUR = 8;

  const hours = $derived(Array.from({ length: 24 }, (_item, index) => hourStart + index));
  const dayEvents = $derived(layoutDayEvents(events));
  const timelineGutter = 0;
  const centerOffset = $derived(Math.max(0, Math.min(DAY_CENTER_HOUR * DAY_HOUR_WIDTH, DAY_CENTER_HOUR * DAY_HOUR_WIDTH + DAY_HOUR_WIDTH / 2 - viewportWidth / 2)));

  onDestroy(() => clearTimeout(dayScrollTimer));

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDate(value, fallbackKey = '', endOfDay = false) {
    if (!value && fallbackKey) return new Date(`${fallbackKey}T00:00:00`);
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) {
      return new Date(`${value}T23:59:59`);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(`${fallbackKey}T00:00:00`) : date;
  }

  function eventRange(event) {
    const start = parseDate(event.starts_at, selectedDate);
    const end = parseDate(event.ends_at || event.starts_at, selectedDate, !!event.ends_at);
    return { start, end: end < start ? start : end };
  }

  function visibleWindow() {
    const start = new Date(`${selectedDate}T00:00:00`);
    start.setHours(start.getHours() + hourStart);
    const end = new Date(start);
    end.setHours(end.getHours() + 24);
    return { start, end };
  }

  function layoutDayEvents(source) {
    const window = visibleWindow();
    const sorted = [...source]
      .map((event) => {
        const range = eventRange(event);
        if (range.end <= window.start || range.start >= window.end) return null;
        const displayStart = range.start < window.start ? window.start : range.start;
        const displayEnd = range.end > window.end ? window.end : range.end;
        return {
          ...event,
          _startMinute: Math.max(0, (displayStart - window.start) / 60000),
          _endMinute: Math.min(1440, Math.max((displayEnd - window.start) / 60000, (displayStart - window.start) / 60000 + 30))
        };
      })
      .filter(Boolean)
      .sort((a, b) => a._startMinute - b._startMinute);
    const lanes = [];

    return sorted.map((event) => {
      const start = event._startMinute;
      const end = Math.max(start + 30, event._endMinute);
      let column = lanes.findIndex((laneEnd) => laneEnd <= start);
      if (column === -1) {
        column = lanes.length;
        lanes.push(end);
      } else {
        lanes[column] = end;
      }

      return {
        ...event,
        column,
        columns: Math.max(1, lanes.length)
      };
    }).map((event, _index, all) => ({ ...event, columns: Math.max(1, ...all.map((item) => item.columns)) }));
  }

  function handleDayScroll() {
    if (!dayScroller || shiftingDayScroll || dayDrag) return;
    clearTimeout(dayScrollTimer);
    dayScrollTimer = setTimeout(settleDayScroll, 140);
  }

  function settleDayScroll() {
    if (!dayScroller || shiftingDayScroll) return;
    const centerLeft = centerOffset;
    const diff = dayScroller.scrollLeft - centerLeft;
    const steps = Math.round(diff / DAY_HOUR_WIDTH);
    if (!steps) {
      dayScroller.scrollLeft = centerLeft;
      return;
    }

    shiftingDayScroll = true;
    hourStart += steps;
    normalizeHourWindow();
    requestAnimationFrame(() => {
      if (dayScroller) dayScroller.scrollLeft = centerLeft;
      requestAnimationFrame(() => {
        shiftingDayScroll = false;
      });
    });
  }

  function shiftHourWindow(steps) {
    if (!dayScroller || !steps) return false;
    const centerLeft = centerOffset;
    hourStart += steps;
    normalizeHourWindow();
    dayScroller.scrollLeft = centerLeft;
    return true;
  }

  function normalizeHourWindow() {
    const centerHour = hourStart + DAY_CENTER_HOUR;
    const dayDelta = Math.floor(centerHour / 24);
    if (!dayDelta) return;

    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + dayDelta);
    const nextKey = dateKey(next);
    hourStart -= dayDelta * 24;
    centeredDay = nextKey;
    onDateChange?.(nextKey);
  }

  function beginDayDrag(event) {
    if (!dayScroller || event.button !== 0) return;
    clearTimeout(dayScrollTimer);
    dayDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      scrollLeft: dayScroller.scrollLeft
    };
    dayScroller.setPointerCapture?.(event.pointerId);
  }

  function moveDayDrag(event) {
    if (!dayScroller || !dayDrag) return;
    const centerLeft = centerOffset;
    const moved = event.clientX - dayDrag.x;
    dayScroller.scrollLeft = dayDrag.scrollLeft - moved;
    const steps = Math.trunc((dayScroller.scrollLeft - centerLeft) / DAY_HOUR_WIDTH);
    if (shiftHourWindow(steps)) {
      dayDrag = {
        ...dayDrag,
        x: event.clientX,
        scrollLeft: centerLeft
      };
    }
  }

  function endDayDrag(event) {
    if (!dayScroller || !dayDrag) return;
    clearTimeout(dayScrollTimer);
    dayScroller.releasePointerCapture?.(dayDrag.pointerId ?? event.pointerId);
    dayDrag = null;
    settleDayScroll();
  }

  function centerDayOnHour() {
    if (!dayScroller || centeredDay === selectedDate) return;
    const today = dateKey(new Date());
    const hour = selectedDate === today ? new Date().getHours() : 9;
    hourStart = hour - DAY_CENTER_HOUR;
    centeredDay = selectedDate;
    requestAnimationFrame(() => {
      if (!dayScroller) return;
      dayScroller.scrollLeft = centerOffset;
    });
  }
  $effect(() => { viewportWidth; if (dayScroller) dayScroller.scrollLeft = centerOffset; });

  $effect(centerDayOnHour);

  function eventStyle(event) {
    const hourWidth = DAY_HOUR_WIDTH;
    const left = (event._startMinute / 60) * hourWidth;
    const width = Math.max(54, ((event._endMinute - event._startMinute) / 60) * hourWidth);
    const row = event.column;
    return `left:calc(var(--timeline-gutter) + ${left}px);top:${8 + row * 42}px;width:${width}px;`;
  }

  function hourDate(hour) {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setHours(date.getHours() + hour);
    return date;
  }

  function hourStyle(index) {
    return `left:calc(var(--timeline-gutter) + ${index} * var(--hour-width));`;
  }

  function hourLabel(hour) {
    return hourDate(hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function isCurrentHour(hour) {
    const date = hourDate(hour);
    const now = new Date();
    return dateKey(date) === dateKey(now) && date.getHours() === now.getHours();
  }
</script>

<div
  class="day-view"
  style={`--hour-width:${DAY_HOUR_WIDTH}px`}
  class:dragging={!!dayDrag}
  role="region"
  aria-label="Scrollable day timeline"
  bind:this={dayScroller}
  bind:clientWidth={viewportWidth}
  onscroll={handleDayScroll}
  onpointerdown={beginDayDrag}
  onpointermove={moveDayDrag}
  onpointerup={endDayDrag}
  onpointercancel={endDayDrag}
>
  <div class="day-track" style={`--timeline-gutter:${timelineGutter}px;height:${Math.max(180, 64 + dayEvents.length * 44)}px;`}>
    <div class="time-column">
      {#each hours as hour, index}
        <span
          style={hourStyle(index)}
          class:current-hour={isCurrentHour(hour)}
          data-date={dateKey(hourDate(hour))}
          data-hour={hourDate(hour).getHours()}
        >{hourLabel(hour)}</span>
      {/each}
    </div>
    <div class="hour-grid">
      {#each hours as hour, index}
        <div
          class="hour-line"
          style={hourStyle(index)}
          data-date={dateKey(hourDate(hour))}
          data-hour={hourDate(hour).getHours()}
          aria-hidden="true"
        ></div>
      {/each}
      {#each dayEvents as event}
        <button class={`day-event ${event.type}`} style={eventStyle(event)} onclick={() => onSelectEvent?.(event)}>
          <b>{event.title}</b>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .day-view {
    --hour-width: 52px;
    position: relative;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--override-border, #eaecf0);
    border-radius: 8px;
    overflow: auto hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    cursor: grab;
    user-select: none;
  }

  .day-view::-webkit-scrollbar {
    display: none;
  }

  .day-view.dragging {
    cursor: grabbing;
    scroll-snap-type: none;
  }

  .day-track {
    position: relative;
    min-width: calc((24 * var(--hour-width)) + (2 * var(--timeline-gutter)));
    background: var(--override-section, #fff);
  }

  .time-column {
    position: relative;
    height: 40px;
    box-sizing: border-box;
    background: var(--override-box, #f9fafb);
    border-bottom: 1px solid var(--override-border, #eaecf0);
    min-width: calc((24 * var(--hour-width)) + (2 * var(--timeline-gutter)));
  }

  .time-column span {
    position: absolute;
    top: 0;
    width: var(--hour-width);
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    scroll-snap-align: center;
    box-sizing: border-box;
    padding: 0 4px;
    border-right: 1px solid var(--override-border, #eaecf0);
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time-column span.current-hour {
    background: #ecfdf3;
    color: #067647;
    font-weight: 800;
  }

  .hour-grid {
    position: relative;
    min-height: calc(100% - 40px);
    min-width: calc((24 * var(--hour-width)) + (2 * var(--timeline-gutter)));
  }

  .hour-line {
    position: absolute;
    top: 0;
    bottom: 0;
    box-sizing: border-box;
    width: var(--hour-width);
    border-right: 1px solid var(--override-border, #eaecf0);
  }

  .day-event {
    position: absolute;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    border: 1px solid #c7d7fe;
    border-radius: 6px;
    background: #eef4ff;
    color: #3538cd;
    padding: 8px 4px;
    overflow: visible;
    text-align: left;
    cursor: pointer;
  }

  .day-event.rent {
    border-color: #abefc6;
    background: #ecfdf3;
    color: #067647;
  }

  .day-event.reminder {
    border-color: #fedf89;
    background: #fffaeb;
    color: #b54708;
  }

  .day-event b {
    position: sticky;
    left: 6px;
    max-width: min(220px, calc(100vw - 120px));
    overflow: hidden;
    border-radius: 4px;
    background: inherit;
    padding: 0 6px;
    font-size: 12px;
    line-height: 1.15;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
