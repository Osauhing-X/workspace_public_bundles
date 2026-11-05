<svelte:options runes={false} />
<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import MetadataEdit from '$lib/paths/supabase/admin/metadata_edit.svelte';
  import { formatDate, timeAgo } from '$lib/assets/scripts/helpers';
  import {
    isStaffUser,
    staffOs,
    workedHours,
    sickDays,
    staffWorkItems,
    staffIncome
  } from './staff_utils.js';

  export let data = null;
  export let mode = 'team';

  $: adminData = { ...($page.data || {}), ...(data || {}) };

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  let users = [];
  let projects = [];
  let payments = [];
  let dbKanbanBoards = [];
  let dbCalendarEvents = [];
  let permissions = {};

  let selectedId = '';
  let scope = 'general';
  let status = '';
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDay = '';
  let eventDraft = { type: 'present', date: new Date().toISOString().slice(0, 10), hours: 8, note: '', assigned_to: [] };
  let eventAssignee = '';
  let inventoryDraft = { name: '', serial: '', status: 'assigned', note: '' };
  let noteDraft = '';
  let kanbanDraft = { title: '', status: 'todo', assigned_to: [], worklog_enabled: false };
  let editingCardId = '';
  let cardDraft = { title: '', description: '', status: 'todo', assigned_to: [], worklog_enabled: false };
  let draggedCardId = '';
  let dragTargetColumn = '';
  let sectionDraft = '';
  let now = new Date();
  let timerDraftId = '';
  let timerTitle = '';
  let timerProject = '';
  let timerNote = '';

  onMount(() => {
    const interval = setInterval(() => now = new Date(), 1000);
    return () => clearInterval(interval);
  });

  $: users = asArray(adminData.users_data?.users);
  $: projects = asArray(adminData.projekt_data?.length ? adminData.projekt_data : adminData.projects_data);
  $: payments = asArray(adminData.payments_data);
  $: dbKanbanBoards = asArray(adminData.kanban_data);
  $: dbCalendarEvents = asArray(adminData.calendar_data);
  $: permissions = adminData.staff_permissions || {};
  $: staffUsers = users.filter(isStaffUser);
  $: if (mode !== 'team' && !selectedId) selectedId = permissions.current_user_id || staffUsers[0]?.id || '';
  $: selected = staffUsers.find(user => user.id === selectedId) || (mode === 'team' && !selectedId ? null : staffUsers[0]);
  $: currentUser = staffUsers.find(user => user.id === permissions.current_user_id) || selected || staffUsers[0];
  $: target = scope === 'general' ? currentUser : selected;
  $: os = staffOs(target);
  $: canEditTarget = permissions.manage_staff || target?.id === permissions.current_user_id || import.meta.env.DEV;
  $: canSeeMoney = permissions.view_financials || import.meta.env.DEV;
  $: work = staffWorkItems(selected, projects, payments);
  $: general = staffOs(currentUser).general || { events: [], kanban: [], kanban_sections: [] };
  $: calendarOwnerId = scope === 'person' ? (selected?.id || selectedId || '') : '';
  $: dbEvents = dbCalendarEvents
    .map(normalizeDbEvent)
    .filter(event => event.scope === scope && String(event.owner_id || '') === String(calendarOwnerId || ''));
  $: events = mode === 'calendar' ? dbEvents : (scope === 'general' ? (general.events || []) : os.events);
  $: kanbanOwnerId = scope === 'person' ? (selected?.id || selectedId || '') : '';
  $: dbKanbanBoard = dbKanbanBoards.find(board => {
    const metadata = board.metadata || {};
    return metadata.scope === scope && String(metadata.owner_id || '') === String(kanbanOwnerId || '');
  });
  $: dbKanbanColumns = Array.isArray(dbKanbanBoard?.columns) && dbKanbanBoard.columns.length ? dbKanbanBoard.columns : ['todo', 'doing', 'done'];
  $: cards = mode === 'kanban' ? asArray(dbKanbanBoard?.cards) : (scope === 'general' ? (general.kanban || []) : os.kanban);
  $: activeTimer = os.active_timer || null;
  $: workLogs = asArray(os.work_logs);
  $: if (activeTimer && activeTimer.id !== timerDraftId) {
    timerDraftId = activeTimer.id;
    timerTitle = activeTimer.title || '';
    timerProject = activeTimer.project_id || '';
    timerNote = activeTimer.note || '';
  }
  $: kanbanSections = mode === 'kanban' ? dbKanbanColumns : scope === 'general'
    ? (Array.isArray(general.kanban_sections) && general.kanban_sections.length ? general.kanban_sections : ['todo', 'doing', 'done'])
    : (Array.isArray(os.kanban_sections) && os.kanban_sections.length ? os.kanban_sections : ['todo', 'doing', 'done']);
  $: calendarDays = buildCalendar(calendarMonth, events);
  $: monthLabel = calendarMonth.toLocaleDateString('et-EE', { month: 'long', year: 'numeric' });
  $: selectedDayEvents = events.filter(event => event.date === selectedDay);

  function normalizeDbEvent(row = {}) {
    const metadata = row.metadata || {};
    return {
      id: row.id,
      type: metadata.type || row.title || 'work',
      date: metadata.date || String(row.starts_at || row.created_at || '').slice(0, 10),
      hours: Number(metadata.hours || 0),
      note: row.description || metadata.note || row.title || '',
      assigned_to: Array.isArray(metadata.assigned_to) ? metadata.assigned_to : (row.assigned_to ? [row.assigned_to] : []),
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      scope: metadata.scope || 'general',
      owner_id: metadata.owner_id || '',
      raw: row
    };
  }

  function syncCalendarEvent(row) {
    if (!row.id) return;
    dbCalendarEvents = dbCalendarEvents.some(item => item.id === row.id)
      ? dbCalendarEvents.map(item => item.id === row.id ? row : item)
      : [row, ...dbCalendarEvents];
  }

  async function calendarRequest(method, body) {
    status = 'Saving...';
    const response = await fetch('/@_api/admin/calendar', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope,
        owner_id: calendarOwnerId,
        ...body
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      status = result.error || 'Calendar save failed';
      return null;
    }
    if (method === 'DELETE') {
      dbCalendarEvents = dbCalendarEvents.filter(item => item.id !== body.id);
    } else {
      syncCalendarEvent(result);
    }
    status = 'Saved';
    return result;
  }

  function assignedLabel(ids = []) {
    return ids
      .map(id => staffUsers.find(user => user.id === id)?.email)
      .filter(Boolean)
      .join(', ');
  }

  function toggleAssigned(id) {
    const current = eventDraft.assigned_to || [];
    eventDraft.assigned_to = current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id];
  }

  function addEventAssignee() {
    if (!eventAssignee || eventDraft.assigned_to.includes(eventAssignee)) return;
    eventDraft.assigned_to = [...(eventDraft.assigned_to || []), eventAssignee];
    eventAssignee = '';
  }

  function toggleKanbanAssigned(id) {
    const current = kanbanDraft.assigned_to || [];
    kanbanDraft.assigned_to = current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id];
  }

  function buildCalendar(monthDate, eventList = []) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: date.getDate(),
        muted: date.getMonth() !== monthDate.getMonth(),
        events: eventList.filter(event => event.date === key)
      };
    });
  }

  function durationMs(startedAt, stoppedAt = now) {
    const start = new Date(startedAt).getTime();
    const stop = new Date(stoppedAt).getTime();
    return Number.isFinite(start) && Number.isFinite(stop) ? Math.max(stop - start, 0) : 0;
  }

  function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}h ${String(rest).padStart(2, '0')}m`;
  }

  function projectLabel(id) {
    const project = projects.find(item => item.id === id);
    return project?.title || project?.name || id || 'Projektita';
  }

  function changeMonth(delta) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
  }

  function nextStaffOs(next, generalPatch = null) {
    if (scope !== 'general') return next;
    return {
      ...staffOs(currentUser),
      general: {
        ...(staffOs(currentUser).general || {}),
        ...generalPatch
      }
    };
  }

  async function saveFor(user, nextOs) {
    if (!user || !canEditTarget) return;

    const user_metadata = { ...(user.user_metadata || {}), staff_os: nextOs };
    status = 'Saving...';

    const res = await fetch('/@_supabase/our_domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'supabase',
        action: 'meta',
        data: { user: user.id, user_metadata }
      })
    });

    if (res.ok) {
      user.user_metadata = user_metadata;
      users = [...users];
      status = 'Saved';
    } else {
      status = 'Save failed';
    }
  }

  function save(nextOs, generalPatch = null) {
    saveFor(scope === 'general' ? currentUser : target, nextStaffOs(nextOs, generalPatch));
  }

  function syncKanbanBoard(board) {
    if (!board.id) return;
    dbKanbanBoards = dbKanbanBoards.some(item => item.id === board.id)
      ? dbKanbanBoards.map(item => item.id === board.id ? board : item)
      : [board, ...dbKanbanBoards];
  }

  async function kanbanRequest(method, body) {
    status = 'Saving...';
    const response = await fetch('/@_api/admin/kanban', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope,
        owner_id: kanbanOwnerId,
        columns: kanbanSections,
        ...body
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      status = result.error || 'Kanban save failed';
      return null;
    }
    syncKanbanBoard(result);
    status = 'Saved';
    return result;
  }

  async function addEvent() {
    const row = {
      id: crypto.randomUUID(),
      ...eventDraft,
      hours: Number(eventDraft.hours || 0),
      created_at: new Date().toISOString()
    };
    if (mode === 'calendar') {
      await calendarRequest('POST', row);
      return;
    }
    if (scope === 'general') save(os, { events: [...events, row] });
    else save({ ...os, events: [...os.events, row] });
  }

  async function removeEvent(id) {
    if (mode === 'calendar') {
      await calendarRequest('DELETE', { id });
      return;
    }
    if (scope === 'general') save(os, { events: events.filter(event => event.id !== id) });
    else save({ ...os, events: os.events.filter(event => event.id !== id) });
  }

  function addInventory() {
    if (!inventoryDraft.name) return;
    save({ ...os, inventory: [...os.inventory, { id: crypto.randomUUID(), ...inventoryDraft, assigned_at: new Date().toISOString() }] });
    inventoryDraft = { name: '', serial: '', status: 'assigned', note: '' };
  }

  function removeInventory(id) {
    save({ ...os, inventory: os.inventory.filter(item => item.id !== id) });
  }

  function addNote() {
    if (!noteDraft.trim()) return;
    save({ ...os, notes: [{ id: crypto.randomUUID(), text: noteDraft.trim(), created_at: new Date().toISOString() }, ...os.notes] });
    noteDraft = '';
  }

  async function addKanban() {
    if (!kanbanDraft.title.trim()) return;
    const row = { id: crypto.randomUUID(), ...kanbanDraft, created_at: new Date().toISOString() };
    if (mode === 'kanban') {
      const saved = await kanbanRequest('POST', { action: 'add_card', card: row });
      if (saved) kanbanDraft = { title: '', status: 'todo', assigned_to: [], worklog_enabled: false };
      return;
    }
    if (scope === 'general') save(os, { kanban: [...cards, row] });
    else save({ ...os, kanban: [...os.kanban, row] });
    kanbanDraft = { title: '', status: 'todo', assigned_to: [], worklog_enabled: false };
  }

  async function addKanbanSection() {
    const title = sectionDraft.trim();
    if (!title || kanbanSections.includes(title)) return;
    const next = [...kanbanSections, title];
    if (mode === 'kanban') {
      const saved = await kanbanRequest('PUT', { action: 'add_section', title, columns: next });
      if (saved) sectionDraft = '';
      return;
    }
    if (scope === 'general') save(os, { kanban_sections: next });
    else save({ ...os, kanban_sections: next });
    sectionDraft = '';
  }

  async function moveCard(card, nextStatus) {
    if (mode === 'kanban') {
      await kanbanRequest('PUT', { action: 'update_card', card: { ...card, status: nextStatus } });
      return;
    }
    const nextCards = cards.map(item => item.id === card.id ? { ...item, status: nextStatus } : item);
    if (scope === 'general') save(os, { kanban: nextCards });
    else save({ ...os, kanban: nextCards });
  }

  function cardAssignees(card = {}) {
    return Array.isArray(card.assigned_to) ? card.assigned_to : (Array.isArray(card.assigned) ? card.assigned : []);
  }

  function editCard(card) {
    editingCardId = card.id;
    cardDraft = {
      title: card.title || '',
      description: card.description || card.metadata?.description || '',
      status: card.status || kanbanSections[0] || 'todo',
      assigned_to: cardAssignees(card),
      worklog_enabled: Boolean(card.worklog_enabled || card.metadata?.worklog_enabled)
    };
  }

  function toggleCardDraftAssigned(id) {
    const current = cardDraft.assigned_to || [];
    cardDraft.assigned_to = current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id];
  }

  async function saveCardEdit(card) {
    if (!canEditTarget || !card?.id || !cardDraft.title.trim()) return;
    const next = {
      ...card,
      ...cardDraft,
      title: cardDraft.title.trim(),
      description: cardDraft.description.trim(),
      metadata: {
        ...(card.metadata || {}),
        worklog_enabled: Boolean(cardDraft.worklog_enabled)
      },
      updated_at: new Date().toISOString()
    };
    if (mode === 'kanban') {
      const saved = await kanbanRequest('PUT', { action: 'update_card', card: next });
      if (saved) editingCardId = '';
      return;
    }
    const nextCards = cards.map(item => item.id === card.id ? next : item);
    if (scope === 'general') save(os, { kanban: nextCards });
    else save({ ...os, kanban: nextCards });
    editingCardId = '';
  }

  function dropCard(nextStatus) {
    const card = cards.find(item => item.id === draggedCardId);
    draggedCardId = '';
    dragTargetColumn = '';
    if (card && card.status !== nextStatus) moveCard(card, nextStatus);
  }

  async function removeKanbanCard(card) {
    if (mode === 'kanban') {
      await kanbanRequest('DELETE', { card_id: card.id });
      return;
    }
    const nextCards = cards.filter(item => item.id !== card.id);
    if (scope === 'general') save(os, { kanban: nextCards });
    else save({ ...os, kanban: nextCards });
  }

  function startWorkTimer() {
    if (!canEditTarget || activeTimer) return;
    save({
      ...os,
      active_timer: {
        id: crypto.randomUUID(),
        title: timerTitle.trim() || 'Teenuse osutamine',
        project_id: timerProject || '',
        note: timerNote.trim(),
        started_at: new Date().toISOString()
      }
    });
  }

  function saveWorkTimerDraft() {
    if (!canEditTarget || !activeTimer) return;
    save({
      ...os,
      active_timer: {
        ...activeTimer,
        title: timerTitle.trim() || activeTimer.title || 'Teenuse osutamine',
        project_id: timerProject || '',
        note: timerNote.trim()
      }
    });
  }

  function stopWorkTimer() {
    if (!canEditTarget || !activeTimer) return;
    const stopped_at = new Date().toISOString();
    const row = {
      ...activeTimer,
      title: timerTitle.trim() || activeTimer.title || 'Teenuse osutamine',
      project_id: timerProject || '',
      note: timerNote.trim(),
      stopped_at,
      duration_hours: Number((durationMs(activeTimer.started_at, stopped_at) / 3600000).toFixed(2))
    };
    save({ ...os, active_timer: null, work_logs: [row, ...workLogs] });
    timerDraftId = '';
    timerTitle = '';
    timerProject = '';
    timerNote = '';
  }

  function removeWorkLog(id) {
    if (!canEditTarget) return;
    save({ ...os, work_logs: workLogs.filter(row => row.id !== id) });
  }
</script>

<section class="staff-workspace grid gap _3">
  <header class="title-row gap _2 flex _space">
    <div>
      <h2>{mode === 'personal' ? 'Minu töölaud' : mode === 'team' ? 'Töötajad' : mode === 'calendar' ? 'Calendar' : 'Kanboard'}</h2>
      <small>{scope === 'general' ? 'Üldine töölaud' : selected?.email}</small>
    </div>

    {#if mode === 'calendar' || mode === 'kanban'}
      <div class="scope-picker gap _2 flex">
        <select bind:value={scope}>
          <option value="general">Uldine</option>
          <option value="person">Individuaalne</option>
        </select>
        {#if scope !== 'general'}
          <select bind:value={selectedId}>
            {#each staffUsers as staff}
              <option value={staff.id}>{staff.user_metadata?.full_name || staff.email}</option>
            {/each}
          </select>
        {/if}
      </div>
    {/if}

    {#if status}<small>{status}</small>{/if}
  </header>

  {#if mode === 'team' && !selectedId}
    <section class="admin-table-panel team-table">
      <header class="table-title gap _2 flex">
        <div>
          <h3>Kõik töötajad</h3>
          <small>Vali töötaja, et avada sama tabi sees tema detailvaade.</small>
        </div>
      </header>
      <div overflow class="table-wrap">
        <table>
          <thead>
            <tr><th>Töötaja</th><th>Kohal</th><th>Haige</th><th>Projektid</th><th>Inventar</th></tr>
          </thead>
          <tbody>
            {#each staffUsers as staff}
              {@const staffWork = staffWorkItems(staff, projects, payments)}
              <tr on:click={() => selectedId = staff.id}>
                <td>
                  <b>{staff.user_metadata?.full_name || staff.email}</b>
                  <small>{staff.email}</small>
                </td>
                <td>{workedHours(staff)}h</td>
                <td>{sickDays(staff)}</td>
                <td>{staffWork.projects.length}</td>
                <td>{staffOs(staff).inventory.length}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {:else if mode === 'personal' || mode === 'team'}
    {#if mode === 'team'}
      <button type="button" class="back-btn" on:click={() => selectedId = ''}>Tagasi töötajate listi</button>
    {/if}

    <section class="metrics gap _2 grid">
      <article class="flex gap _2 _space"><small>Kohal</small><b>{workedHours(selected)}h</b></article>
      <article class="flex gap _2 _space"><small>Haige</small><b>{sickDays(selected)}</b></article>
      <article class="flex gap _2 _space"><small>Projektid</small><b>{work.projects.length}</b></article>
      <article class="flex gap _2 _space"><small>Panus</small><b>{canSeeMoney ? `${staffIncome(selected, projects, payments)}€` : 'Peidetud'}</b></article>
    </section>

    <section class="panel work-timer gap _3 grid">
      <div class="section-head gap _2 flex">
        <div>
          <h3>Teenuse ajajälgija</h3>
          <small>{activeTimer ? `Käib ${formatDuration(durationMs(activeTimer.started_at))}` : 'Start salvestab algusaja, stop teeb töölogi.'}</small>
        </div>
        {#if activeTimer}
          <strong>{formatDuration(durationMs(activeTimer.started_at))}</strong>
        {/if}
      </div>

      {#if canEditTarget}
        <div class="timer-grid gap _2 grid">
          <label class="grid gap"><span>Teenuse / töö pealkiri</span><input placeholder="Mida teenust osutad" bind:value={timerTitle}></label>
          <label class="grid gap"><span>Projekt</span><select bind:value={timerProject}>
            <option value="">Projektita töö</option>
            {#each projects as project}
              <option value={project.id}>{project.title || project.name || project.id}</option>
            {/each}
          </select></label>
          <label class="wide grid gap"><span>Mida tehti või mida töö sisaldas</span><textarea rows="3" placeholder="Lisa töö käigus märkmeid..." bind:value={timerNote}></textarea></label>
        </div>

        <div class="timer-actions gap _2 flex">
          {#if activeTimer}
            <button type="button" on:click={saveWorkTimerDraft}>Salvesta kirjeldus</button>
            <button type="button" class="stop" on:click={stopWorkTimer}>Stop</button>
          {:else}
            <button type="button" class="start" on:click={startWorkTimer}>Start</button>
          {/if}
        </div>
      {/if}

      <div class="timer-log gap _2 grid">
        {#each workLogs.slice(0, 5) as row}
          <article class="flex gap _2 _space">
            <div>
              <b>{row.title}</b>
              <small>{projectLabel(row.project_id)} · {formatDuration(durationMs(row.started_at, row.stopped_at))} · {formatDate(row.started_at)}</small>
              {#if row.note}<p>{row.note}</p>{/if}
            </div>
            {#if canEditTarget}<button type="button" on:click={() => removeWorkLog(row.id)}>X</button>{/if}
          </article>
        {:else}
          <small>Tööloge pole veel lisatud.</small>
        {/each}
      </div>
    </section>

    <section class="board gap _2 grid">
      <article class="panel gap _3 flex _space">
        <h3>{mode === 'personal' ? 'Minu sündmused' : 'Töötaja sündmused'}</h3>
        {#if canEditTarget}
          <div class="form-grid gap _2 grid">
            <label class="grid gap"><span>Tüüp</span><select bind:value={eventDraft.type}>
              <option value="present">Kohal</option>
              <option value="work">Töö</option>
              <option value="sick">Haige</option>
              <option value="vacation">Puhkus</option>
              <option value="other">Muu</option>
            </select></label>
            <label class="grid gap"><span>Kuupäev</span><input type="date" bind:value={eventDraft.date}></label>
            <label class="grid gap"><span>Tunnid</span><input type="number" min="0" step="0.25" bind:value={eventDraft.hours}></label>
            <label class="grid gap"><span>Märkus</span><input placeholder="Lühike selgitus" bind:value={eventDraft.note}></label>
            <button type="button" on:click={addEvent}>Lisa</button>
          </div>
        {/if}
        <ul class="grid gap _2">
          {#each os.events.slice().reverse() as event}
            <li class="flex gap _2">
              <div><b>{event.type}</b><small>{event.date} · {event.hours || 0}h · {event.note}</small></div>
              {#if canEditTarget}<button type="button" on:click={() => removeEvent(event.id)}>X</button>{/if}
            </li>
          {/each}
        </ul>
      </article>

      <article class="panel gap _3 flex _space">
        <h3>Inventar</h3>
        {#if canEditTarget}
          <div class="form-grid gap _2 grid">
            <label class="grid gap"><span>Ese</span><input placeholder="Sülearvuti, tööriist..." bind:value={inventoryDraft.name}></label>
            <label class="grid gap"><span>Seeria / ID</span><input placeholder="Inventari tunnus" bind:value={inventoryDraft.serial}></label>
            <label class="grid gap"><span>Staatus</span><select bind:value={inventoryDraft.status}>
              <option value="assigned">Töötaja kaes</option>
              <option value="storage">Laos</option>
              <option value="repair">Remondis</option>
            </select></label>
            <label class="grid gap"><span>Märkus</span><input placeholder="Lisainfo" bind:value={inventoryDraft.note}></label>
            <button type="button" on:click={addInventory}>Lisa</button>
          </div>
        {/if}
        <ul class="grid gap _2">
          {#each os.inventory as item}
            <li class="flex gap _2">
              <div><b>{item.name}</b><small>{item.serial || 'ID puudub'} · {item.status} · {item.note}</small></div>
              {#if canEditTarget}<button type="button" on:click={() => removeInventory(item.id)}>X</button>{/if}
            </li>
          {/each}
        </ul>
      </article>

      <article class="panel gap _3 flex _space">
        <h3>Markmed</h3>
        {#if canEditTarget}
          <div class="form-grid gap _2 grid">
            <label class="grid gap"><span>Märge</span><input placeholder="Lisa märge" bind:value={noteDraft}></label>
            <button type="button" on:click={addNote}>Lisa</button>
          </div>
        {/if}
        <ul class="grid gap _2">{#each os.notes as note}<li class="flex gap _2"><div><small>{timeAgo(note.created_at)}</small><p>{note.text}</p></div></li>{/each}</ul>
      </article>
    </section>

    <section class="panel admin-table-panel grid gap _3">
      <h3>Tehtud kirjed</h3>
      <div overflow>
        <table>
          <thead><tr><th>Arve</th><th>Kirjeldus</th><th>Kuupaev</th>{#if canSeeMoney}<th>Summa</th>{/if}</tr></thead>
          <tbody>
            {#each work.rows as row}
              <tr><td>{row.invoice}</td><td>{row.description}</td><td>{formatDate(row.date)}</td>{#if canSeeMoney}<td>{row.amount}€</td>{/if}</tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    {#if mode === 'team' && permissions.manage_staff}
      <details class="panel">
        <summary>Metadata</summary>
        <MetadataEdit users={staffUsers} />
      </details>
    {/if}
  {/if}

  {#if mode === 'calendar'}
    <section class="panel grid gap _3">
      <div class="calendar-head gap _2 flex">
        <div>
          <h3>{scope === 'general' ? 'General calendar' : 'Individual calendar'}</h3>
          <small>{monthLabel}</small>
        </div>
        <div class="month-actions gap _2 flex">
          <button type="button" on:click={() => changeMonth(-1)}>Eelmine</button>
          <button type="button" on:click={() => changeMonth(1)}>Jargmine</button>
        </div>
      </div>

      {#if canEditTarget}
        <div class="form-grid gap _2 grid">
          <select bind:value={eventDraft.type}>
            <option value="work">Töö</option>
            <option value="meeting">Koosolek</option>
            <option value="sick">Haige</option>
            <option value="other">Muu</option>
          </select>
          <input type="date" bind:value={eventDraft.date}>
          <input placeholder="Kirjeldus" bind:value={eventDraft.note}>
          <div class="assign-select gap _2 grid">
            <select bind:value={eventAssignee} on:change={addEventAssignee}>
              <option value="">Määra inimene</option>
              {#each staffUsers.filter(staff => !eventDraft.assigned_to.includes(staff.id)) as staff}
              <option value={staff.id}>{staff.user_metadata?.full_name || staff.email}</option>
              {/each}
            </select>
            <div class="assigned-chips gap flex">
              {#each eventDraft.assigned_to || [] as id}
                <button type="button" on:click={() => toggleAssigned(id)}>{staffUsers.find(user => user.id === id)?.email || 'töötaja'} ×</button>
              {/each}
            </div>
          </div>
          <button type="button" on:click={addEvent}>Lisa</button>
        </div>
      {/if}

      <div class="calendar-grid gap grid">
        {#each ['E', 'T', 'K', 'N', 'R', 'L', 'P'] as day}
          <strong>{day}</strong>
        {/each}
        {#each calendarDays as day}
          <button type="button" class="calendar-day gap grid" class:muted={day.muted} class:active={selectedDay === day.key} on:click={() => selectedDay = selectedDay === day.key ? '' : day.key}>
            <b>{day.label}</b>
            {#each day.events.slice(0, 3) as event}
              <small>{event.type} · {event.note}</small>
            {/each}
          </button>
        {/each}
      </div>

      {#if selectedDay}
        <section class="day-details gap _2 grid">
          <header class="flex gap _2 _space">
            <div>
              <h4>{selectedDay}</h4>
              <small>{selectedDayEvents.length} sündmust</small>
            </div>
          </header>
          {#if selectedDayEvents.length}
            <ul class="grid gap _2">
              {#each selectedDayEvents as event}
                <li class="flex gap _2">
                  <div>
                    <b>{event.type}</b>
                    <small>{event.note || 'Kirjeldus puudub'} · {assignedLabel(event.assigned_to)}</small>
                  </div>
                  {#if canEditTarget}<button type="button" on:click={() => removeEvent(event.id)}>X</button>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <small>Sellel päeval sündmusi pole.</small>
          {/if}
        </section>
      {/if}

    </section>
  {/if}

  {#if mode === 'kanban'}
    <section class="panel grid gap _3">
      <h3>{scope === 'general' ? 'General kanboard' : 'Individual kanboard'}</h3>
      {#if canEditTarget}
        <div class="form-grid gap _2 grid">
          <input placeholder="Task" bind:value={kanbanDraft.title}>
          <select bind:value={kanbanDraft.status}>
            {#each kanbanSections as section}
              <option value={section}>{section}</option>
            {/each}
          </select>
          <div class="assigned-chips picker gap flex">
            {#each staffUsers as staff}
              <button
                type="button"
                class:active={kanbanDraft.assigned_to.includes(staff.id)}
                on:click={() => toggleKanbanAssigned(staff.id)}>
                {staff.user_metadata?.full_name || staff.email}
              </button>
            {/each}
          </div>
          <label class="check grid gap"><input type="checkbox" bind:checked={kanbanDraft.worklog_enabled}> <span>Töölogi valikus</span></label>
          <button type="button" on:click={addKanban}>Lisa</button>
        </div>
        <div class="section-create gap _2 flex">
          <input placeholder="Uus sektsioon" bind:value={sectionDraft}>
          <button type="button" on:click={addKanbanSection}>Lisa sektsioon</button>
        </div>
      {/if}
      <div class="kanban gap _2 grid">
        {#each kanbanSections as column}
          <section
            role="list"
            class={`${dragTargetColumn === column && draggedCardId ? 'drop-target' : ''} grid gap _2`}
            aria-label={`Kanban ${column}`}
            on:dragover|preventDefault
            on:dragenter={() => dragTargetColumn = column}
            on:drop={() => dropCard(column)}>
            <h4>{column}</h4>
            {#each cards.filter(card => card.status === column) as card}
              <article
                draggable={canEditTarget}
                class:dragging={draggedCardId === card.id}
                class="flex gap _2 _space" on:dragstart={() => draggedCardId = card.id}
                on:dragend={() => { draggedCardId = ''; dragTargetColumn = ''; }}>
                {#if editingCardId === card.id}
                  <div class="grid gap _2">
                    <input bind:value={cardDraft.title} placeholder="Task">
                    <textarea rows="3" bind:value={cardDraft.description} placeholder="Kirjeldus"></textarea>
                    <select bind:value={cardDraft.status}>
                      {#each kanbanSections as section}
                        <option value={section}>{section}</option>
                      {/each}
                    </select>
                    <div class="assigned-chips picker gap flex">
                      {#each staffUsers as staff}
                        <button
                          type="button"
                          class:active={cardDraft.assigned_to.includes(staff.id)}
                          on:click={() => toggleCardDraftAssigned(staff.id)}>
                          {staff.user_metadata?.full_name || staff.email}
                        </button>
                      {/each}
                    </div>
                    <label class="check grid gap"><input type="checkbox" bind:checked={cardDraft.worklog_enabled}> <span>Töölogi valikus</span></label>
                    <div class="flex gap _2 _wrap">
                      <button type="button" on:click={() => saveCardEdit(card)}>Salvesta</button>
                      <button type="button" on:click={() => editingCardId = ''}>Tühista</button>
                    </div>
                  </div>
                {:else}
                  <b>{card.title}</b>
                  {#if card.description}<p>{card.description}</p>{/if}
                  <small>{assignedLabel(cardAssignees(card))}</small>
                {/if}
                {#if canEditTarget}
                  <div class="flex gap _2 _wrap">
                    <button type="button" on:click={() => editCard(card)}>Muuda</button>
                    <button type="button" on:click={() => removeKanbanCard(card)}>X</button>
                  </div>
                {/if}
              </article>
            {/each}
          </section>
        {/each}
      </div>
    </section>
  {/if}
</section>

<style>
  .staff-workspace {
    width: min(1200px, 100%);
    margin: 0 auto;    text-align: left;
  }

  .title-row,
  .section-head,
  .scope-picker,
  .calendar-head,
  .month-actions {    align-items: center;
    flex-wrap: wrap;
  }

  .title-row,
  .section-head,
  .calendar-head {
    justify-content: space-between;
  }

  .title-row h2,
  .section-head h3,
  .calendar-head h3 {
    margin: 0;
  }

  .metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .metrics article,
  .panel {
    padding: 14px;
    border: 1px solid #00000030;
    border-radius: 8px;
    background: var(--x_color_transparent_auto);
  }

  .metrics b {
    display: block;
    font-size: 24px;
    color: var(--reverse);
  }

  .board {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .form-grid {    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    align-items: center;
  }

  .work-timer .section-head strong {
    color: var(--x_color, #da3);
    font-size: 24px;
  }

  .timer-grid {    grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
  }

  .timer-grid label {
    display: grid;
    gap: 6px;
  }

  .timer-grid .wide {
    grid-column: 1 / -1;
  }

  .timer-actions {    flex-wrap: wrap;
  }

  .timer-actions .start {
    border-color: color-mix(in srgb, #20d66b 45%, transparent);
    background: color-mix(in srgb, #20d66b 18%, transparent);
  }

  .timer-actions .stop {
    border-color: color-mix(in srgb, #ff5b5b 45%, transparent);
    background: color-mix(in srgb, #ff5b5b 18%, transparent);
  }

  .timer-log article {    border: 1px solid #00000018;
    border-radius: 8px;
    background: #00000010;
    padding: 10px;
  }

  .timer-log p {
    margin: 4px 0 0;
  }

  .form-grid label span {
    color: var(--x_text_color);
    font-size: 12px;
  }

  .section-create {    flex-wrap: wrap;
  }

  .assign-select,
  .assigned-chips.picker {
    grid-column: 1 / -1;
  }

  .assigned-chips {    flex-wrap: wrap;
  }

  .assigned-chips button {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid #00000024;
    background: #00000010;
  }

  .assigned-chips button.active {
    border-color: color-mix(in srgb, var(--x_color) 60%, #00000020);
    background: color-mix(in srgb, var(--x_color) 18%, transparent);
  }

  ul {    list-style: none;
    padding: 0;
  }

  li {    justify-content: space-between;    padding: 8px;
    background: #00000018;
    border-radius: 5px;
  }

  li p {
    margin: 0;
  }

  table tbody tr {
    cursor: pointer;
  }
  .team-table{overflow:hidden;padding:0!important}.team-table>.table-title{margin:0;border-bottom:1px solid #222;background:#111;padding:16px 18px}.team-table>.table-wrap{border:0!important;border-radius:0}.team-table .table-title h3{margin:0}

  .table-wrap {
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
  }

  table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--reverse) 8%, transparent);
    text-align: left;
    white-space: nowrap;
  }

  table td:first-child {
    display: grid;
    gap: 2px;
  }

  .calendar-grid {    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .calendar-grid > strong {
    text-align: center;
    opacity: .75;
  }

  .calendar-day {
    min-height: 86px;    align-content: start;
    text-align: left;
    padding: 8px;
    border: 1px solid #00000020;
    border-radius: 6px;
    background: var(--x_body_background);
    cursor: pointer;
  }

  .calendar-day.muted {
    opacity: .45;
  }

  .calendar-day.active {
    outline: 2px solid var(--x_color);
  }

  .calendar-grid small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .day-details {    padding: 12px;
    border: 1px solid #00000020;
    border-radius: 8px;
    background: #00000010;
  }

  .day-details h4 {
    margin: 0;
  }

  .kanban {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .kanban section {    align-content: start;
    padding: 8px;
    background: #00000018;
    border-radius: 5px;
    transition: outline-color .12s ease, background .12s ease, transform .12s ease;
  }

  .kanban section.drop-target {
    outline: 2px solid color-mix(in srgb, var(--x_color, #da3) 70%, transparent);
    background: color-mix(in srgb, var(--x_color, #da3) 12%, transparent);
    transform: translateY(-1px);
  }

  .kanban article {
    display: grid;
    gap: 8px;
    padding: 8px;
    background: var(--x_body_background);
    border-radius: 5px;
  }

  .back-btn {
    width: max-content;
  }

  @media (max-width: 700px) {
    .calendar-grid {
    }

    .calendar-day {
      min-height: 62px;
      padding: 5px;
    }

    .calendar-grid small {
      display: none;
    }
  }
</style>
