<svelte:options runes={false} />

<script>
  import { openAdminTab } from './context.js';

  export let data = {};

  let filter = 'all';

  const closedRequestStatuses = new Set(['done', 'closed', 'read', 'spam', 'archived']);
  const completedEventStatuses = new Set(['done', 'completed', 'cancelled', 'canceled']);

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function dateValue(value) {
    const parsed = new Date(value || 0);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  function dateLabel(value) {
    const date = dateValue(value);
    return date ? date.toLocaleString('et-EE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  function requestText(row = {}) {
    return row.subject || row.message || row.name || row.email || 'Kliendi päring';
  }

  function errorText(row = {}) {
    return row.msg_copy || row.description || row.meta?.reason || 'Tundmatu kliendipoolne viga';
  }

  function errorPath(row = {}) {
    return row.meta?.path || row.metadata?.path || '';
  }

  function groupedClientErrors(value = []) {
    const groups = new Map();
    for (const row of rows(value)) {
      const message = errorText(row);
      if (/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(message)) continue;
      const path = errorPath(row);
      const key = `${row.domain || 'unknown'}:${path}:${message}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        if ((dateValue(row.created_at)?.getTime() || 0) > (dateValue(existing.created_at)?.getTime() || 0)) existing.created_at = row.created_at;
      } else {
        groups.set(key, { ...row, count: 1, message, path });
      }
    }
    return [...groups.values()];
  }

  function calendarStatus(row = {}) {
    return String(row.status || row.metadata?.status || '').toLowerCase();
  }

  $: now = new Date();
  $: currentStaffId = data.staff_permissions?.current_user_id;
  $: currentStaffEmail = String(data.staff_permissions?.current_user_email || '').toLowerCase();
  $: requestTasks = rows(data.help_requests)
    .filter((row) => !closedRequestStatuses.has(String(row.status || '').toLowerCase()))
    .map((row) => ({
      id: `request:${row.id}`,
      kind: 'message',
      priority: ['urgent', 'high'].includes(String(row.priority || '').toLowerCase()) ? 'critical' : 'normal',
      title: requestText(row),
      detail: [row.email, row.portal_key || row.source, row.status || 'new'].filter(Boolean).join(' · '),
      date: row.last_message_at || row.updated_at || row.created_at,
      action: 'inbox',
      actionLabel: 'Ava päring'
    }));
  $: errorTasks = [
    ...rows(data.data_errors).map((row, index) => ({
      id: `source:${index}:${row.source}`,
      kind: 'error', priority: 'critical', title: `${row.source}: andmeallikas ei vasta`,
      detail: row.message || 'Andmete laadimine ebaõnnestus.', date: null,
      action: 'tasks', actionLabel: ''
    })),
    ...groupedClientErrors(data.client_errors).map((row) => ({
      id: `client:${row.id}`,
      kind: 'error', priority: 'critical', title: row.count > 1 ? `${row.message} (${row.count}×)` : row.message,
      detail: [row.domain, row.path].filter(Boolean).join(' · '),
      date: row.created_at, action: 'tasks', actionLabel: ''
    }))
  ];
  $: calendarTasks = rows(data.calendar_data)
    .filter((row) => {
      const due = dateValue(row.starts_at || row.metadata?.date);
      if (!due || due > now || completedEventStatuses.has(calendarStatus(row))) return false;
      const assigned = [row.assigned_to, ...(Array.isArray(row.metadata?.assigned_to) ? row.metadata.assigned_to : [])]
        .map((item) => String(item || '').toLowerCase());
      return !assigned.length || assigned.includes(String(currentStaffId || '').toLowerCase()) || assigned.includes(currentStaffEmail);
    })
    .map((row) => ({
      id: `calendar:${row.id}`,
      kind: 'calendar', priority: 'normal', title: row.title || 'Kalendri sündmus',
      detail: row.description || row.metadata?.type || 'Tähtaeg on saabunud.',
      date: row.starts_at || row.metadata?.date, action: 'calendar', actionLabel: 'Ava kalender'
    }));
  $: tasks = [...errorTasks, ...requestTasks, ...calendarTasks]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'critical' ? -1 : 1;
      return (dateValue(b.date)?.getTime() || 0) - (dateValue(a.date)?.getTime() || 0);
    });
  $: visibleTasks = filter === 'all' ? tasks : tasks.filter((task) => task.kind === filter);

  function openTask(task) {
    if (task.action && task.action !== 'tasks') openAdminTab(task.action);
  }
</script>

<section class="tasks-page grid gap _3" aria-labelledby="tasks-title">
  <header class="tasks-head flex gap _3 _space _center _y">
    <div class="grid gap">
      <small>Admin attention center</small>
      <h2 id="tasks-title">Ülesanded</h2>
      <p>Veateated, vastamata kliendikirjad ja saabunud kalendritähtajad ühes järjekorras.</p>
    </div>
    <strong>{tasks.length}</strong>
  </header>

  <nav class="task-filters flex gap" aria-label="Ülesannete filter">
    {#each [['all', 'Kõik'], ['error', 'Vead'], ['message', 'Kirjad'], ['calendar', 'Kalender']] as [id, label]}
      <button type="button" class:active={filter === id} on:click={() => filter = id}>
        {label}
        <span>{id === 'all' ? tasks.length : tasks.filter((task) => task.kind === id).length}</span>
      </button>
    {/each}
  </nav>

  <section class="admin-table-panel">
    <header class="table-title grid gap">
      <strong>Vajab tähelepanu</strong>
      <small>Kriitilised vead kuvatakse alati esimesena.</small>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tüüp</th><th>Ülesanne</th><th>Seos</th><th>Aeg</th><th></th></tr></thead>
        <tbody>
          {#each visibleTasks as task (task.id)}
            <tr class:critical={task.priority === 'critical'}>
              <td><span class="task-kind {task.kind}">{task.kind === 'error' ? 'Viga' : task.kind === 'message' ? 'Kiri' : 'Kalender'}</span></td>
              <td><strong>{task.title}</strong></td>
              <td>{task.detail || '—'}</td>
              <td>{dateLabel(task.date)}</td>
              <td>{#if task.actionLabel}<button type="button" on:click={() => openTask(task)}>{task.actionLabel}</button>{/if}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty">Selles vaates ei ole lahendamist ootavaid ülesandeid.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .tasks-page{width:100%}.tasks-page :is(h2,p){margin:0}.tasks-head{padding:18px;border:1px solid #222;border-radius:8px;background:#080808}.tasks-head p,.tasks-head small,.table-title small{color:#999}.tasks-head>strong{min-width:58px;min-height:58px;display:grid;place-items:center;border:1px solid #333;border-radius:8px;background:#111;font-size:24px}.task-filters{flex-wrap:wrap}.task-filters button{display:flex;align-items:center;gap:8px;border:1px solid #292929;border-radius:7px;background:#0a0a0a;color:#aaa;padding:9px 12px;cursor:pointer}.task-filters button.active{border-color:#66551d;background:#17130a;color:#fff}.task-filters span{border-radius:99px;background:#222;padding:2px 7px;font-size:11px}.admin-table-panel{overflow:hidden;border:1px solid #222;border-radius:8px;background:#050505}.table-title{padding:16px 18px;border-bottom:1px solid #222;background:#111}.table-wrap{overflow-x:auto}table{width:100%;min-width:820px;border-collapse:collapse}th,td{padding:12px 14px;border-bottom:1px solid #222;text-align:left;vertical-align:middle}th{color:#999;font-size:12px}tbody tr:hover{background:#121212}tr.critical{box-shadow:inset 3px 0 #d92d20}.task-kind{display:inline-flex;border-radius:999px;padding:4px 8px;background:#222;font-size:12px;font-weight:800}.task-kind.error{background:#351313;color:#fda29b}.task-kind.message{background:#102a1b;color:#75e0a7}.task-kind.calendar{background:#29220e;color:#f5d76e}td button{white-space:nowrap;border:1px solid #333;border-radius:6px;background:#151515;color:#eee;padding:7px 10px;cursor:pointer}.empty{padding:30px;text-align:center;color:#999}@media(max-width:700px){.tasks-head{align-items:stretch;flex-direction:column}.tasks-head>strong{width:58px}}
</style>
