<svelte:options runes={false} />

<script>
  import Users from '$lib/site/modules/admin/users.svelte';
  import Projects from '$lib/site/modules/admin/project/projects.svelte';
  import Companies from '$lib/site/modules/admin/companies.svelte';
  import Invoices from '$lib/site/modules/admin/invoices.svelte';
  import B2BServices from '$lib/site/modules/admin/b2b_services.svelte';
  import StaffWorkspace from '$lib/site/modules/admin/staff_workspace.svelte';
  import Inventory from '$lib/site/modules/admin/inventory.svelte';
  import EmailWorkbench from '$lib/site/modules/admin/email_workbench.svelte';
  import StripeAdmin from '$lib/site/modules/admin/stripe_admin.svelte';
  import HelpDesk from '$lib/site/modules/admin/help_desk.svelte';
  import WorkLog from '$lib/site/modules/admin/work_log.svelte';
  import MeDialog from '$lib/site/dns_route/our_domains/me_dialog.svelte';
  import Maintenance from '$lib/site/modules/admin/maintenance.svelte';
  import Tasks from '$lib/site/modules/admin/tasks.svelte';

  import { afterUpdate, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { admin_tab, admin_filter, openAdminTab } from '$lib/site/modules/admin/context.js';

  export let data = {};

  $: adminData = { ...($page.data || {}), ...(data || {}) };

  let activeRail = 'overview';
  let syncedTab = null;
  let pinnedTabs = [];
  let pinHoldTimer = null;
  let pinHoldCompleted = false;
  let localWorkLogs = [];
  let navNow = new Date();
  let navTimerNote = '';
  let navTimerId = null;
  let navTimerSaving = false;
  const pinnedTabsKey = 'extaas.admin.pinned_tabs';

  const railSections = [
    { id: 'overview', icon: 'dashboard', label: 'Overview', items: [['overview', 'Overview'], ['tasks', 'Ülesanded']] },
    { id: 'work', icon: 'work', label: 'Work', items: [['projekt', 'Projects'], ['worklog', 'Tee tööd'], ['arve', 'Invoices']] },
    { id: 'people', icon: 'group', label: 'People', items: [['kasutajad', 'Users'], ['ettevote', 'Companies'], ['b2b', 'B2B services']] },
    { id: 'billing', icon: 'tools', label: 'Billing', items: [['products', 'Products'], ['subscriptions', 'Subscriptions'], ['refunds', 'Refunds'], ['disputes', 'Disputes']] },
    { id: 'staff', icon: 'plant', label: 'Staff', items: [['my', 'My desk'], ['tiim', 'Team'], ['calendar', 'Calendar'], ['kanban', 'Kanban'], ['inventory', 'Inventory']] },
    { id: 'tools', icon: 'tools', label: 'Modules', items: [['resend', 'Email'], ['inbox', 'Päringud'], ['maintenance', 'Maintenance']] }
  ];
  let revenueCanvas;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function railForTab(tab) {
    return railSections.find((section) => section.items.some(([id]) => id === tab))?.id ?? 'overview';
  }

  function normalizeAdminTab(tab) {
    if (!tab) return 'overview';
    if (['transactions', 'maksed', 'payment_methods', 'terminal'].includes(tab)) return 'arve';
    if (['requests', 'help'].includes(tab)) return 'inbox';
    return tab;
  }

  function validTabIds() {
    return new Set(railSections.flatMap((section) => section.items.map(([id]) => id)));
  }

  function loadPinnedTabs() {
    if (!browser) return;
    const valid = validTabIds();
    try {
      pinnedTabs = JSON.parse(localStorage.getItem(pinnedTabsKey) || '[]').filter((id) => valid.has(id) && id !== 'overview');
    } catch {
      pinnedTabs = [];
    }
  }

  function togglePinnedTab(id, event) {
    event?.stopPropagation?.();
    if (!validTabIds().has(id) || id === 'overview') return;
    pinnedTabs = pinnedTabs.includes(id)
      ? pinnedTabs.filter((item) => item !== id)
      : [...pinnedTabs, id];
    if (browser) localStorage.setItem(pinnedTabsKey, JSON.stringify(pinnedTabs));
  }

  function isPinnedTab(id) {
    return pinnedTabs.includes(id);
  }

  function startPinHold(id) {
    cancelPinHold();
    if (id === 'overview') return;
    pinHoldTimer = setTimeout(() => {
      pinHoldCompleted = true;
      togglePinnedTab(id);
      pinHoldTimer = null;
    }, 3000);
  }

  function cancelPinHold() {
    if (!pinHoldTimer) return;
    clearTimeout(pinHoldTimer);
    pinHoldTimer = null;
  }

  function selectRail(id) {
    activeRail = id;
    if (browser && window.matchMedia('(max-width: 1200px)').matches) {
      document.getElementById('staff_nav_popover')?.showPopover?.();
    }
  }

  function closeMobileNav() {
    if (browser) document.getElementById('staff_nav_popover')?.hidePopover?.();
  }

  function chooseAdminTab(id) {
    const tab = normalizeAdminTab(id);
    activeRail = railForTab(tab);
    openAdminTab(tab);
    closeMobileNav();
  }

  function choosePinnedAware(id, event) {
    if (pinHoldCompleted) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      pinHoldCompleted = false;
      return;
    }
    chooseAdminTab(id);
  }

  function invoiceBalance(invoice) {
    return (invoice?.line_items ?? []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  function projectTitle(project) {
    return project.title || project.name || project.type || `Project ${project.id ?? ''}`.trim();
  }

  function invoiceTitle(invoice) {
    return invoice.arve_nr || invoice.invoice_nr || invoice.id || 'Invoice';
  }

  function monthKey(value) {
    const date = new Date(value || Date.now());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function euro(cents = 0) {
    return Number(cents || 0) / 100;
  }
  function normalizedEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function paymentKind(item = {}) {
    return String(item.kind || item.what || item.source || item.object?.object || '').toLowerCase();
  }

  function paymentStatus(item = {}) {
    return String(item.status || item.payment_status || item.object?.status || '').toLowerCase();
  }

  function actionablePayment(item = {}) {
    const kind = paymentKind(item);
    const status = paymentStatus(item);
    if (kind === 'checkout' && ['unpaid', 'expired', 'no_payment_required'].includes(status)) return false;
    if (['expired', 'canceled', 'cancelled', 'complete', 'paid', 'succeeded', 'refunded'].includes(status)) return false;
    return ['open', 'failed', 'requires_payment_method', 'requires_action', 'processing', 'unpaid'].includes(status);
  }

  function workTitle(row = {}) {
    return row.service || row.title || row.metadata?.title || 'Teenuse osutamine';
  }

  function workNote(row = {}) {
    return row.description || row.note || row.metadata?.note || '';
  }

  function workerMatchesCurrent(row = {}) {
    return row.worker_id === staffId ||
      normalizedEmail(row.worker_email) === normalizedEmail(staffEmail) ||
      (import.meta.env.DEV && normalizedEmail(row.worker_email) === 'admin');
  }

  function durationLabel(startedAt, stoppedAt = navNow) {
    const start = new Date(startedAt).getTime();
    const stop = new Date(stoppedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(stop)) return '0h 00m 00s';
    const seconds = Math.max(0, Math.floor((stop - start) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
  }

  function syncWorkLog(row) {
    if (!row?.id) return;
    localWorkLogs = [row, ...localWorkLogs.filter((item) => item.id !== row.id)];
  }

  async function navTimerAction(action) {
    if (!currentActiveTimer?.id) return;
    navTimerSaving = true;
    const note = navTimerNote || workNote(currentActiveTimer);
    const response = await fetch('/@_api/admin/worklog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentActiveTimer,
        id: currentActiveTimer.id,
        action,
        title: workTitle(currentActiveTimer),
        note,
        description: note,
        worker_id: currentActiveTimer.worker_id || staffId || null,
        worker_email: currentActiveTimer.worker_email || staffEmail || (import.meta.env.DEV ? 'admin' : ''),
        started_at: currentActiveTimer.started_at
      })
    });
    const row = await response.json().catch(() => null);
    navTimerSaving = false;
    if (response.ok && row) {
      syncWorkLog(row);
      await invalidateAll();
    }
  }

  function mergedCustomerCount(stripeRows = [], authRows = []) {
    const map = new Map();
    const rows = new Set();
    let anonymous = 0;

    function remember(row, keys = []) {
      rows.add(row);
      for (const key of keys.filter(Boolean)) map.set(key, row);
    }

    for (const customer of stripeRows) {
      const keys = [normalizedEmail(customer.email), customer.id ? `stripe:${customer.id}` : ''].filter(Boolean);
      const row = keys.map((key) => map.get(key)).find(Boolean) ?? { id: keys[0] || `stripe:${anonymous++}` };
      remember(row, keys.length ? keys : [row.id]);
    }

    for (const user of authRows) {
      const metadata = { ...(user.app_metadata || {}), ...(user.user_metadata || {}) };
      const keys = [
        normalizedEmail(user.email),
        metadata.stripe_customer ? `stripe:${metadata.stripe_customer}` : '',
        metadata.stripe_customer_id ? `stripe:${metadata.stripe_customer_id}` : ''
      ].filter(Boolean);
      const row = keys.map((key) => map.get(key)).find(Boolean) ?? { id: keys[0] || `auth:${anonymous++}` };
      remember(row, keys.length ? keys : [row.id]);
    }

    return rows.size;
  }

  $: payments = asArray(adminData.payments_data);
  $: baseWorkLogs = asArray(adminData.work_logs_data);
  $: workLogs = [
    ...localWorkLogs,
    ...baseWorkLogs.filter((row) => !localWorkLogs.some((item) => item.id && item.id === row.id))
  ];
  $: activeTimerRows = workLogs.filter((row) => !row.stopped_at);
  $: platformProjects = asArray(adminData.projects_data);
  $: adminProjects = asArray(adminData.projekt_data);
  $: invoices = asArray(adminData.arve_data);
  $: companies = asArray(adminData.ettevote_data);
  $: b2b = asArray(adminData.b2b_data);
  $: users = asArray(adminData.users_data?.users);
  $: customerUsers = asArray(adminData.customer_users_data?.users);
  $: stripeData = adminData.stripe_data || {};
  $: stripeCustomers = asArray(stripeData.customers);
  $: stripeInvoices = asArray(stripeData.invoices);
  $: stripeTransactions = asArray(stripeData.transactions);
  $: stripeSubscriptions = asArray(stripeData.subscriptions);
  $: stripeRefunds = asArray(stripeData.refunds);
  $: stripeDisputes = asArray(stripeData.disputes);
  $: helpRequests = asArray(adminData.help_requests);
  $: clientErrors = asArray(adminData.client_errors).filter((item) => !/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(String(item.msg_copy || item.description || item.meta?.reason || '')));
  $: dueCalendarTasks = asArray(adminData.calendar_data).filter((item) => {
    const due = new Date(item.starts_at || item.metadata?.date || 0);
    const status = String(item.status || item.metadata?.status || '').toLowerCase();
    return Number.isFinite(due.getTime()) && due <= navNow && !['done', 'completed', 'cancelled', 'canceled'].includes(status);
  });
  $: dataErrors = asArray(adminData.data_errors);
  $: staffEmail = adminData.staff_permissions?.current_user_email;
  $: staffId = adminData.staff_permissions?.current_user_id || adminData.staff_permissions?.requested_user_id;
  $: accessMode = adminData.staff_permissions?.access_mode;

  $: openInvoices = invoices.filter((invoice) => invoiceBalance(invoice) > 0);
  $: paidTotal = invoices.reduce((sum, invoice) => {
    return sum + Math.abs(Math.min(invoiceBalance(invoice), 0));
  }, 0);
  $: activeProjects = adminProjects.filter((project) => !['all done', 'cancelled', 'rejected'].includes(project.status));
  $: highlightedProjects = adminProjects.filter((project) => project.highlight);
  $: latestProjects = [...adminProjects]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 5);
  $: latestInvoices = [...invoices]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 5);
  $: overviewNotifications = [
    openInvoices.length ? { type: 'invoice', title: 'Open invoices', text: `${openInvoices.length} invoices have a positive balance.` } : null,
    highlightedProjects.length ? { type: 'project', title: 'Highlighted projects', text: `${highlightedProjects.length} projects are marked for focus.` } : null,
    b2b.length ? { type: 'service', title: 'B2B services', text: `${b2b.length} B2B service rows are connected.` } : null,
    payments.length ? { type: 'payment', title: 'Payment rows', text: `${payments.length} payment records are available for review.` } : null
  ].filter(Boolean);
  $: recentPayments = [...payments]
    .sort((a, b) => new Date(b.updated_at || b.created_at || b.date || 0) - new Date(a.updated_at || a.created_at || a.date || 0))
    .slice(0, 4);
  $: revenueMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    const key = monthKey(date);
    const amount = stripeTransactions
      .filter((item) => monthKey(item.created_at) === key)
      .filter((item) => ['paid', 'succeeded', 'complete'].includes(String(item.status || '').toLowerCase()))
      .reduce((sum, item) => sum + euro(item.amount), 0);
    return { key, label: date.toLocaleDateString('et-EE', { month: 'short' }), amount };
  });
  $: monthMax = Math.max(...revenueMonths.map((item) => item.amount), 1);
  $: weekStart = (() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date;
  })();
  $: thisWeekRevenue = stripeTransactions
    .filter((item) => new Date(item.created_at || 0) >= weekStart)
    .filter((item) => ['paid', 'succeeded', 'complete'].includes(String(item.status || '').toLowerCase()))
    .reduce((sum, item) => sum + euro(item.amount), 0);
  $: activeWorkers = new Set(
    activeProjects.flatMap((project) => Array.isArray(project.dev) ? project.dev : [])
  ).size;
  $: activeTimers = [
    ...activeTimerRows.map((row) => ({ id: row.worker_id || row.id, email: row.worker_email || row.worker_id || 'staff', active_timer: row })),
    ...users.filter((user) => user.user_metadata?.staff_os?.active_timer)
  ]
    .slice(0, 3);
  $: currentActiveTimer = activeTimerRows.find(workerMatchesCurrent) ||
    users.find((user) => user.id === staffId || normalizedEmail(user.email) === normalizedEmail(staffEmail))?.user_metadata?.staff_os?.active_timer ||
    null;
  $: if (currentActiveTimer && currentActiveTimer.id !== navTimerId) {
    navTimerId = currentActiveTimer.id;
    navTimerNote = workNote(currentActiveTimer);
  }
  $: if (!currentActiveTimer) {
    navTimerId = null;
    navTimerNote = '';
  }
  $: recentHelp = helpRequests
    .filter((item) => !['done', 'closed', 'read'].includes(String(item.status || '').toLowerCase()))
    .slice(0, 3);
  $: stripeCustomerEmails = new Set(stripeCustomers.map((item) => String(item.email || '').trim().toLowerCase()).filter(Boolean));
  $: authCustomerEmails = new Set(customerUsers.map((item) => String(item.email || '').trim().toLowerCase()).filter(Boolean));
  $: onlyStripeCustomers = [...stripeCustomerEmails].filter((email) => !authCustomerEmails.has(email)).length;
  $: onlyAuthCustomers = [...authCustomerEmails].filter((email) => !stripeCustomerEmails.has(email)).length;
  $: customerMergeTotal = mergedCustomerCount(stripeCustomers, customerUsers);
  $: navTodos = [
    openInvoices.length ? `${openInvoices.length} arvet vajab tähelepanu` : null,
    highlightedProjects.length ? `${highlightedProjects.length} fookuses projekti` : null,
    helpRequests.filter((item) => item.status !== 'done').length ? `${helpRequests.filter((item) => item.status !== 'done').length} help requesti` : null
  ].filter(Boolean).slice(0, 3);
  $: unreadHelp = helpRequests.filter((item) => !['done', 'closed', 'read'].includes(String(item.status || '').toLowerCase())).length;
  $: activeSubscriptions = stripeSubscriptions.filter((item) => ['active', 'trialing'].includes(String(item.status || '').toLowerCase())).length;
  $: attentionPayments = payments.filter(actionablePayment).length;
  $: navBadges = {
    tasks: dataErrors.length + clientErrors.length + unreadHelp + dueCalendarTasks.length,
    projekt: highlightedProjects.length,
    worklog: users.filter((user) => user.user_metadata?.staff_os?.active_timer).length,
    arve: openInvoices.length + attentionPayments,
    refunds: stripeRefunds.filter((item) => !['succeeded', 'failed', 'canceled'].includes(String(item.status || '').toLowerCase())).length,
    disputes: stripeDisputes.length,
    inbox: unreadHelp
  };

  function badgeFor(id) {
    const value = Number(navBadges[id] || 0);
    return value > 0 ? (value > 99 ? '99+' : String(value)) : '';
  }

  function railBadge(section = {}) {
    const total = (section.items || []).reduce((sum, [id]) => sum + Number(navBadges[id] || 0), 0);
    return total > 0 ? (total > 99 ? '99+' : String(total)) : '';
  }
  $: staffAccount = { projects: adminProjects, invoices, stripe: adminData.account_stripe, notifications: overviewNotifications };

  function drawRevenueChart() {
    if (!revenueCanvas) return;
    const ctx = revenueCanvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const width = revenueCanvas.clientWidth || 640;
    const height = revenueCanvas.clientHeight || 220;
    revenueCanvas.width = width * ratio;
    revenueCanvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const pad = 22;
    const barGap = 12;
    const barWidth = (width - pad * 2 - barGap * (revenueMonths.length - 1)) / revenueMonths.length;
    revenueMonths.forEach((item, index) => {
      const barHeight = Math.max(4, (height - pad * 2) * (item.amount / monthMax));
      const x = pad + index * (barWidth + barGap);
      const y = height - pad - barHeight;
      const gradient = ctx.createLinearGradient(0, y, 0, height - pad);
      gradient.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue('--x_color').trim() || '#da3');
      gradient.addColorStop(1, 'rgba(255,255,255,.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = 'rgba(255,255,255,.68)';
      ctx.font = '12px system-ui';
      ctx.fillText(item.label, x, height - 6);
      ctx.fillText(`${item.amount.toFixed(0)}€`, x, Math.max(14, y - 6));
    });
  }

  onMount(() => {
    loadPinnedTabs();
    drawRevenueChart();
    const interval = setInterval(() => navNow = new Date(), 1000);
    return () => clearInterval(interval);
  });
  afterUpdate(drawRevenueChart);

  $: urlTab = $page.url.searchParams.get('tab');
  $: if (urlTab && urlTab !== syncedTab) {
    const normalizedTab = normalizeAdminTab(urlTab);
    syncedTab = urlTab;
    if (normalizedTab !== urlTab) openAdminTab(normalizedTab);
    if (normalizedTab !== $admin_tab) $admin_tab = normalizedTab;
    activeRail = railForTab(normalizedTab);
  }

  $: admin_filter.set({
    email: $page.url.searchParams.get('email') || '',
    projekt: $page.url.searchParams.get('projekt') || '',
    arve: $page.url.searchParams.get('arve') || '',
    ettevote: $page.url.searchParams.get('ettevote') || ''
  });

  $: currentRail = railSections.find((section) => section.id === activeRail) ?? railSections[0];
  $: pinnedSections = railSections
    .filter((section) => section.id !== 'overview')
    .map((section) => ({ ...section, items: section.items.filter(([id]) => pinnedTabs.includes(id)) }))
    .filter((section) => section.items.length);
  $: activeLabel = railSections
    .flatMap((section) => section.items)
    .find(([id]) => id === $admin_tab)?.[1] ?? 'Overview';
</script>

<svelte:head>
  <title>Extaas staff workspace</title>
</svelte:head>

<main none class="staff-shell grid">
  <aside class="icon-rail dark gap _2 flex" aria-label="Workspace areas">
    <a class="rail-mark" href="/" aria-label="Workspace home">x</a>
    {#each railSections as section}
      <button
        class:active={activeRail === section.id}
        type="button"
        aria-label={section.label}
        title={section.label}
        class="gap _2 flex _space _center _y" on:click={() => selectRail(section.id)}
      >
        <svg fill="currentColor">
          <use href={`/icons/google.svg#${section.icon}`}></use>
        </svg>
        <span class="rail-label">{section.label}</span>
        {#if railBadge(section)}<b class="rail-badge">{railBadge(section)}</b>{/if}
      </button>
    {/each}
    <button class="rail-user gap _2 flex _space _center _y" type="button" popovertarget="me_dialog" aria-label="Account" title="Account">
      <svg fill="currentColor"><use href="/icons/google.svg#user"></use></svg>
    </button>
  </aside>

  <aside class="staff-nav" aria-label="Staff navigation">
    <div class="identity-card gap grid">
      <small>{import.meta.env.DEV ? 'Local admin' : 'Signed staff'}</small>
      <b>{import.meta.env.DEV ? 'admin' : staffEmail}</b>
      {#if !import.meta.env.DEV}<code>{staffId}</code>{/if}
    </div>

    <div class="nav-group gap grid">
      <small>{currentRail.label}</small>
      {#each currentRail.items as [id, label]}
        <div class="nav-row gap grid">
          <button
            class:active={$admin_tab === id}
            type="button"
            title="Hoia 3s all, et overview alla pinnida"
            class="gap _2 flex _space _center _y" on:pointerdown={() => startPinHold(id)}
            on:pointerup={cancelPinHold}
            on:pointerleave={cancelPinHold}
            on:pointercancel={cancelPinHold}
            on:click={(event) => choosePinnedAware(id, event)}
          >
            <i></i>
            <span>{label}</span>
            {#if badgeFor(id)}<b>{badgeFor(id)}</b>{/if}
            {#if isPinnedTab(id)}<em aria-label="Pinned">📌</em>{/if}
          </button>
        </div>
      {/each}
    </div>

    {#if activeRail === 'overview' && pinnedSections.length}
      {#each pinnedSections as section}
        <div class="nav-group pinned gap grid">
          <small>{section.label}</small>
          {#each section.items as [id, label]}
            <div class="nav-row gap grid">
              <button
                class:active={$admin_tab === id}
                type="button"
                title="Hoia 3s all, et pin eemaldada"
                class="gap _2 flex _space _center _y" on:pointerdown={() => startPinHold(id)}
                on:pointerup={cancelPinHold}
                on:pointerleave={cancelPinHold}
                on:pointercancel={cancelPinHold}
                on:click={(event) => choosePinnedAware(id, event)}
              >
                <i></i>
                <span>{label}</span>
                {#if badgeFor(id)}<b>{badgeFor(id)}</b>{/if}
                <em aria-label="Pinned">📌</em>
              </button>
            </div>
          {/each}
        </div>
      {/each}
    {/if}

    {#if currentActiveTimer}
      <div class="nav-timer grid gap _2">
        <small>Aktiivne töö</small>
        <b>{durationLabel(currentActiveTimer.started_at)}</b>
        <span>{workTitle(currentActiveTimer)}</span>
        <textarea rows="3" bind:value={navTimerNote} placeholder="Mida tegid"></textarea>
        <div class="flex gap _2 _wrap">
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => navTimerAction('update')} disabled={navTimerSaving}>Salvesta</button>
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => navTimerAction('pause')} disabled={navTimerSaving}>Pause</button>
          <button class="btn _color gap _2 flex _space _center _y" type="button" on:click={() => navTimerAction('stop')} disabled={navTimerSaving}>Stop</button>
        </div>
      </div>
    {/if}

    <div class="nav-insight gap _2 grid">
      <small>{currentRail.label} pulse</small>
      {#if activeRail === 'billing'}
        <article class="grid gap _2">
          <span>Revenue trend</span>
          <div class="mini-bars gap grid" aria-label="Six month revenue trend">
            {#each revenueMonths as item}
              <i title={`${item.label}: ${item.amount.toFixed(0)} EUR`} style={`--h:${Math.max(8, (item.amount / monthMax) * 100)}%`}></i>
            {/each}
          </div>
          <p>{thisWeekRevenue.toFixed(0)} EUR this week</p>
        </article>
        <article class="grid gap _2">
          <span>Needs review</span>
          <b>{stripeDisputes.length + stripeRefunds.length}</b>
          <p>{stripeDisputes.length} disputes / {stripeRefunds.length} refunds / {activeSubscriptions} active subs</p>
        </article>
      {:else if activeRail === 'work'}
        <article class="grid gap _2">
          <span>Today focus</span>
          <b>{activeProjects.length}</b>
          <p>{activeWorkers} active staff / {openInvoices.length} open invoices</p>
        </article>
        <ul class="grid gap _2">
          {#each activeTimers as user}
            <li>{user.email || user.id} teeb hetkel tööd</li>
          {:else}
            {#each navTodos as item}
              <li>{item}</li>
            {:else}
              <li>Midagi kriitilist ei karju.</li>
            {/each}
          {/each}
        </ul>
        <button type="button" class="gap _2 flex _space _center _y" on:click={() => chooseAdminTab('worklog')}>Open worklog</button>
      {:else if activeRail === 'people'}
        <article class="grid gap _2">
          <span>Customer merge</span>
          <b>{customerMergeTotal}</b>
          <p>{onlyStripeCustomers} only Stripe / {onlyAuthCustomers} only Auth</p>
        </article>
        <ul class="grid gap _2">
          <li>{companies.length} companies connected</li>
          <li>{b2b.length} B2B service rows</li>
          <li>{users.length} staff auth accounts</li>
        </ul>
      {:else if activeRail === 'tools'}
        <article class="grid gap _2">
          <span>Support queue</span>
          <b>{unreadHelp}</b>
          <p>{helpRequests.length} total contact rows</p>
        </article>
        <ul class="grid gap _2">
          {#each recentHelp as item}
            <li>{item.email || item.name || item.subject || 'New help row'}</li>
          {:else}
            <li>No unread contact rows.</li>
          {/each}
        </ul>
        <button type="button" class="gap _2 flex _space _center _y" on:click={() => chooseAdminTab('inbox')}>Ava päringud</button>
      {:else if activeRail === 'staff'}
        <article class="grid gap _2">
          <span>Staff day</span>
          <b>{new Date().toLocaleDateString('et-EE', { day: '2-digit', month: 'short' })}</b>
          <p>{activeTimers.length} active timers / {navBadges.inventory || 0} inventory rows</p>
        </article>
        <ul class="grid gap _2">
          <li>Calendar keeps field work visible.</li>
          <li>Kanban tracks internal tasks.</li>
          <li>Inventory follows staff equipment.</li>
        </ul>
      {:else}
        <article class="grid gap _2">
          <span>Six month pulse</span>
          <div class="mini-bars gap grid" aria-label="Six month revenue trend">
            {#each revenueMonths as item}
              <i title={`${item.label}: ${item.amount.toFixed(0)} EUR`} style={`--h:${Math.max(8, (item.amount / monthMax) * 100)}%`}></i>
            {/each}
          </div>
          <p>{thisWeekRevenue.toFixed(0)} EUR this week</p>
        </article>
        <article class="grid gap _2">
          <span>Live-ish status</span>
          <b>{activeWorkers}</b>
          <p>people assigned to active work</p>
        </article>
      {/if}
    </div>
  </aside>

  <div class="mobile-nav-popover" id="staff_nav_popover" popover>
    <header class="flex gap _2 _space _center _y">
      <div>
        <small>{currentRail.label}</small>
        <strong>{activeLabel}</strong>
      </div>
      <button type="button" popovertarget="staff_nav_popover" popovertargetaction="hide" aria-label="Close navigation" class="gap _2 flex _space _center _y">x</button>
    </header>
    <div class="nav-group gap grid">
      {#each currentRail.items as [id, label]}
        <div class="nav-row gap grid">
          <button
            class:active={$admin_tab === id}
            type="button"
            title="Hoia 3s all, et overview alla pinnida"
            class="gap _2 flex _space _center _y" on:pointerdown={() => startPinHold(id)}
            on:pointerup={cancelPinHold}
            on:pointerleave={cancelPinHold}
            on:pointercancel={cancelPinHold}
            on:click={(event) => choosePinnedAware(id, event)}
          >
            <i></i>
            <span>{label}</span>
            {#if badgeFor(id)}<b>{badgeFor(id)}</b>{/if}
            {#if isPinnedTab(id)}<em aria-label="Pinned">📌</em>{/if}
          </button>
        </div>
      {/each}
    </div>
    <div class="nav-insight gap _2 grid">
      <small>{currentRail.label} pulse</small>
      {#if activeRail === 'work'}
        <article class="grid gap _2"><span>Work queue</span><b>{activeProjects.length}</b><p>{activeTimers.length} active timers / {openInvoices.length} open invoices.</p></article>
      {:else if activeRail === 'billing'}
        <article class="grid gap _2"><span>Needs review</span><b>{stripeDisputes.length + stripeRefunds.length}</b><p>{stripeDisputes.length} disputes / {activeSubscriptions} active subscriptions.</p></article>
      {:else if activeRail === 'people'}
        <article class="grid gap _2"><span>Customer merge</span><b>{customerMergeTotal}</b><p>{onlyStripeCustomers} only Stripe / {onlyAuthCustomers} only Auth.</p></article>
      {:else if activeRail === 'staff'}
        <article class="grid gap _2"><span>Staff day</span><b>{activeTimers.length}</b><p>Active timers right now.</p></article>
      {:else if activeRail === 'tools'}
        <article class="grid gap _2"><span>Help</span><b>{unreadHelp}</b><p>{helpRequests.length} support rows loaded.</p></article>
      {:else}
        <article class="grid gap _2"><span>Overview</span><b>{thisWeekRevenue.toFixed(0)} EUR</b><p>{activeProjects.length} active projects loaded.</p></article>
      {/if}
    </div>
  </div>

  <div class:overview-layout={$admin_tab === 'overview'} class="workspace-main gap _5 grid">
    <header class="workspace-top gap _3 flex _space _center _y">
      <div>
        <small>{currentRail.label}</small>
        <h1>{activeLabel}</h1>
      </div>
    </header>

    {#if dataErrors.length}
      <section class="data-errors gap grid" aria-label="Admin data source warnings">
        <strong>Osad andmeallikad ei vastanud</strong>
        {#each dataErrors as item}
          <small>{item.source}: {item.message}</small>
        {/each}
      </section>
    {/if}

    {#if $admin_tab === 'overview'}
      <section class="overview-stage gap _5 grid" aria-labelledby="overview-title">
        <div class="overview-head gap _3 flex">
          <div>
            <small>extaas.com</small>
            <h2 id="overview-title">Workspace control center</h2>
            <p>Live admin data from projects, invoices, companies, payments and staff accounts. Priorities, billing and team work stay in one place.</p>
          </div>
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('projekt')}>Open projects</button>
        </div>

        <div class="metric-grid gap _2 grid">
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('projekt')}>
            <small>Active projects</small>
            <b>{activeProjects.length}</b>
            <span>{highlightedProjects.length} highlighted</span>
          </button>
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('arve')}>
            <small>Open invoices</small>
            <b>{openInvoices.length}</b>
            <span>{paidTotal.toFixed(2)} EUR paid balance</span>
          </button>
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('ettevote')}>
            <small>Companies</small>
            <b>{stripeCustomers.length}</b>
            <span>{companies.length} company profiles</span>
          </button>
          <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('kasutajad')}>
            <small>Users</small>
            <b>{customerUsers.length}</b>
            <span>{platformProjects.length} platform projects</span>
          </button>
        </div>

        <div class="finance-grid gap _2 grid">
          <article class="chart-card gap _2 grid">
            <header class="flex gap _2 _space _center _y">
              <div>
                <small>Stripe revenue</small>
                <h3>Last 6 months</h3>
              </div>
              <b>{revenueMonths.reduce((sum, item) => sum + item.amount, 0).toFixed(0)} EUR</b>
            </header>
            <canvas bind:this={revenueCanvas} aria-label="Revenue chart"></canvas>
          </article>

          <article class="billing-stack gap _2 grid">
            <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('subscriptions')}>
              <small>Active subscriptions</small>
              <b>{stripeSubscriptions.filter((item) => ['active', 'trialing'].includes(String(item.status || '').toLowerCase())).length}</b>
              <span>{stripeSubscriptions.length} synced rows</span>
            </button>
            <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('refunds')}>
              <small>Refunds</small>
              <b>{stripeRefunds.length}</b>
              <span>Stripe sync refunds</span>
            </button>
            <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('inbox')}>
              <small>Help queue</small>
              <b>{helpRequests.filter((item) => item.status !== 'done').length}</b>
              <span>{helpRequests.length} total inbox rows</span>
            </button>
          </article>
        </div>

        <div class="signal-grid gap _2 grid">
          <article class="grid gap _2">
            <small>Billing focus</small>
            <strong>{openInvoices.length ? `${openInvoices.length} invoices need attention` : 'Invoices are calm'}</strong>
            <p>{openInvoices.length ? 'Open the invoice module to send reminders, add work rows or check payment links.' : 'No positive balance invoices are currently visible in this workspace.'}</p>
          </article>
          <article class="grid gap _2">
            <small>Project pulse</small>
            <strong>{activeProjects.length} active / {highlightedProjects.length} highlighted</strong>
            <p>Highlighted projects surface here so staff can move from overview directly into the active project list.</p>
          </article>
          <article class="grid gap _2">
            <small>Recent payments</small>
            <strong>{recentPayments.length} newest rows</strong>
            <p>{payments.length ? 'Payment records are available in the payments module.' : 'No payment records are loaded yet.'}</p>
          </article>
        </div>

        <div class="overview-grid gap _2 grid">
          <article class="grid gap _2">
            <header class="flex gap _2 _space _center _y">
              <h3>Recent projects</h3>
              <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('projekt')}>View</button>
            </header>
            <div class="row-list grid">
              {#each latestProjects as project}
                <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('projekt', { project: project.id })}>
                  <b>{projectTitle(project)}</b>
                  <span>{project.status || project.type || 'No status'}</span>
                </button>
              {:else}
                <p>No project rows yet.</p>
              {/each}
            </div>
          </article>

          <article class="grid gap _2">
            <header class="flex gap _2 _space _center _y">
              <h3>Recent invoices</h3>
              <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('arve')}>View</button>
            </header>
            <div class="row-list grid">
              {#each latestInvoices as invoice}
                <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('arve', { arve: invoice.arve_nr })}>
                  <b>{invoiceTitle(invoice)}</b>
                  <span>{invoiceBalance(invoice).toFixed(2)} EUR</span>
                </button>
              {:else}
                <p>No invoice rows yet.</p>
              {/each}
            </div>
          </article>

          <article class="grid gap _2">
            <header class="flex gap _2 _space _center _y">
              <h3>Recent payments</h3>
              <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('transactions')}>View</button>
            </header>
            <div class="row-list grid">
              {#each recentPayments as item}
                <button type="button" class="gap _2 flex _space _center _y" on:click={() => openAdminTab('transactions')}>
                  <b>{item.email || item.customer_email || item.provider || item.id || 'Payment'}</b>
                  <span>{item.status || item.what || item.created_at || 'No status'}</span>
                </button>
              {:else}
                <p>No payment rows yet.</p>
              {/each}
            </div>
          </article>
        </div>

        <div class="notification-strip gap _2 grid">
          {#each overviewNotifications as item}
            <article class="grid gap _2">
              <small>{item.type}</small>
              <b>{item.title}</b>
              <span>{item.text}</span>
            </article>
          {:else}
            <article class="grid gap _2">
              <small>Status</small>
              <b>Nothing urgent</b>
              <span>No active workspace notifications.</span>
            </article>
          {/each}
        </div>
      </section>
    {:else if $admin_tab === 'tasks'}
      <Tasks data={adminData} />
    {:else if $admin_tab === 'ettevote'}
      <Companies data={adminData} />
    {:else if $admin_tab === 'customers'}
      <Users data={adminData} />
    {:else if $admin_tab === 'kasutajad'}
      <Users data={adminData} />
    {:else if $admin_tab === 'arve'}
      <Invoices data={adminData} />
    {:else if $admin_tab === 'b2b'}
      <B2BServices data={adminData} />
    {:else if $admin_tab === 'projekt'}
      <Projects data={adminData} />
    {:else if $admin_tab === 'worklog'}
      <WorkLog data={adminData} />
    {:else if ['products', 'subscriptions', 'refunds', 'disputes'].includes($admin_tab)}
      <StripeAdmin data={adminData} mode={$admin_tab} {stripeData} stripeHealth={adminData.stripe_health} authCustomerRows={customerUsers} />
    {:else if $admin_tab === 'my'}
      <StaffWorkspace data={adminData} mode="personal" />
    {:else if $admin_tab === 'tiim'}
      <StaffWorkspace data={adminData} mode="team" />
    {:else if $admin_tab === 'calendar'}
      <StaffWorkspace data={adminData} mode="calendar" />
    {:else if $admin_tab === 'kanban'}
      <StaffWorkspace data={adminData} mode="kanban" />
    {:else if $admin_tab === 'inventory'}
      <Inventory data={adminData} />
    {:else if $admin_tab === 'resend'}
      <EmailWorkbench data={adminData} />
    {:else if $admin_tab === 'inbox'}
      <HelpDesk data={adminData} mode="inbox" />
    {:else if $admin_tab === 'maintenance'}
      <Maintenance data={adminData} />
    {/if}
  </div>
</main>

<MeDialog account={staffAccount} />

<style>
  :global(body:has(.staff-shell)) {
    background: #000 !important;
    color: var(--reverse) !important;
  }

  :global(body:has(.staff-shell) :is(h1, h2, h3, h4)) {
    color: var(--reverse) !important;
  }

  :global(body:has(.staff-shell) :is(p, label, td, th, small, span)) {
    color: color-mix(in srgb, var(--reverse) 72%, transparent) !important;
  }

  :global(body:has(.staff-shell) :is(input, textarea, select)) {
    color-scheme: dark;
    background: color-mix(in srgb, var(--reverse) 7%, #000);
    color: var(--reverse);
    border-color: color-mix(in srgb, var(--reverse) 18%, transparent);
  }

  :global(body:has(.staff-shell) select option) {
    background: #090909;
    color: #fff;
  }
  .data-errors {    margin-bottom: 14px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, #ffcc66 38%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, #ffcc66 12%, transparent);
  }

  .data-errors strong {
    color: var(--reverse);
  }

  .staff-shell {
    color-scheme: dark;
    --current: #000;
    --reverse: #fff;
    --reverse_80: color-mix(in oklab, var(--reverse), #0000 80%);
    --reverse_20: color-mix(in oklab, var(--reverse), #0000 20%);
    min-height: 100dvh;    grid-template-columns: 52px 250px minmax(0, 1fr);
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at 36% 0%, color-mix(in srgb, var(--x_color, #da3) 14%, transparent), transparent 30rem),
      #000;
  }

  .icon-rail,
  .staff-nav {
    position: sticky;
    top: 0;
    height: 100dvh;
    box-sizing: border-box;
  }

  .icon-rail {    flex-direction: column;
    align-items: center;
    padding: 14px 8px;
    background: #000;
  }

  .rail-user {
    margin-top: auto;
  }

  .rail-mark,
  .icon-rail button {
    position: relative;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: color-mix(in srgb, var(--reverse) 58%, transparent);
    text-decoration: none;
    font: 800 12px/1 var(--x_font_body, system-ui);
  }

  .icon-rail svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }

  .rail-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .rail-badge {
    position: absolute;
    top: -3px;
    right: -4px;
    min-width: 16px;
    border-radius: 999px;
    background: var(--x_color, #da3);
    color: #000;
    padding: 2px 4px;
    font-size: 10px;
    line-height: 1;
    text-align: center;
  }

  .rail-mark {
    color: var(--x_color, #da3);
    font-size: 20px;
  }

  .icon-rail button.active,
  .icon-rail button:hover {
    background: color-mix(in srgb, var(--x_color, #da3) 18%, transparent);
    color: var(--x_color, #da3);
  }

  .rail-user {
    align-self: center;
    color: var(--x_color, #da3) !important;
  }

  .staff-nav {
    overflow: auto;
    padding: 22px 18px;
  }

  .identity-card {    margin-bottom: 24px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
    padding: 12px;
  }

  .identity-card b,
  .identity-card code {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .identity-card b {
    color: var(--reverse);
  }

  .identity-card code {
    color: color-mix(in srgb, var(--reverse) 54%, transparent);
    font-size: 11px;
  }

  .nav-group.pinned {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent);
  }

  .nav-row {    grid-template-columns: minmax(0, 1fr);
    align-items: center;
  }

  .nav-timer {
    margin-top: 18px;
    border: 1px solid color-mix(in srgb, var(--x_color, #da3) 28%, transparent);
    border-radius: 8px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 14%, transparent), transparent 72%),
      color-mix(in srgb, var(--reverse) 6%, transparent);
    padding: 12px;
  }

  .nav-timer small,
  .nav-timer span {
    color: color-mix(in srgb, var(--reverse) 68%, transparent) !important;
  }

  .nav-timer b {
    color: var(--x_color, #da3);
    font-size: 22px;
    line-height: 1;
    white-space: nowrap;
  }

  .nav-timer textarea {
    min-height: 74px;
    resize: vertical;
  }

  .nav-timer button {
    min-height: 32px;
  }

  .nav-insight {    margin-top: 24px;
  }

  .nav-insight article,
  .nav-insight ul {
    border: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent);
    border-radius: 8px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 70%),
      color-mix(in srgb, var(--reverse) 5%, transparent);
    padding: 12px;
  }

  .nav-insight > small,
  .nav-insight span {
    color: color-mix(in srgb, var(--reverse) 58%, transparent) !important;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .nav-insight ul {    margin: 0;
    list-style: none;
  }

  .nav-insight li {
    position: relative;
    padding-left: 14px;
    color: color-mix(in srgb, var(--reverse) 72%, transparent);
    font-size: 12px;
  }

  .nav-insight li::before {
    content: "";
    position: absolute;
    left: 0;
    top: .55em;
    width: 6px;
    height: 6px;
    border-radius: 99px;
    background: var(--x_color, #da3);
  }

  .nav-insight button {
    min-height: 34px;
    border: 1px solid color-mix(in srgb, var(--x_color, #da3) 35%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--x_color, #da3) 16%, transparent);
    color: var(--x_color, #da3);
    font-weight: 800;
  }

  .nav-insight b {
    color: var(--reverse);
    font-size: 24px;
    line-height: 1;
  }

  .nav-insight p {
    margin: -2px 0 8px;
    color: color-mix(in srgb, var(--reverse) 58%, transparent) !important;
    font-size: 12px;
  }

  .mini-bars {    grid-template-columns: repeat(6, 1fr);
    align-items: end;
    height: 58px;
    margin: 10px 0;
  }

  .mini-bars i {
    display: block;
    height: var(--h, 8%);
    min-height: 6px;
    border-radius: 6px 6px 2px 2px;
    background: linear-gradient(180deg, var(--x_color, #da3), color-mix(in srgb, var(--x_color, #da3) 22%, transparent));
    box-shadow: 0 0 22px color-mix(in srgb, var(--x_color, #da3) 22%, transparent);
  }

  .nav-group > small {
    color: var(--reverse) !important;
    font-size: 12px;
    font-weight: 800;
  }

  .nav-group .nav-row > button:first-child {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: color-mix(in srgb, var(--reverse) 70%, transparent);
    padding: 9px 0;
    text-align: left;
    cursor: pointer;
  }

  .nav-group .nav-row > button:first-child i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: transparent;
  }

  .nav-group .nav-row > button:first-child span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-group .nav-row > button:first-child b {
    min-width: 22px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--x_color, #da3) 18%, transparent);
    color: var(--x_color, #da3);
    padding: 3px 7px;
    text-align: center;
    font-size: 11px;
    line-height: 1.2;
  }

  .nav-group .nav-row > button:first-child em {
    color: var(--reverse);
    font-style: normal;
    font-size: 13px;
    line-height: 1;
    background: transparent;
  }

  .nav-group .nav-row > button:first-child.active,
  .nav-group .nav-row > button:first-child:hover {
    color: var(--x_color, #da3);
  }

  .nav-group .nav-row > button:first-child.active i {
    background: var(--x_color, #da3);
  }

  .mobile-nav-popover {
    width: min(360px, calc(100vw - 24px));
    max-height: min(720px, calc(100dvh - 24px));
    margin: 12px auto auto 64px;
    overflow: auto;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    border-radius: 8px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 18rem),
      #050505;
    color: var(--reverse, #fff);
    padding: 14px;
    box-shadow: 0 28px 90px #000000b0;
  }

  .mobile-nav-popover::backdrop {
    background: #00000080;
  }

  .mobile-nav-popover header {    align-items: start;
    margin-bottom: 14px;
  }

  .mobile-nav-popover header strong,
  .mobile-nav-popover header small {
    display: block;
  }

  .mobile-nav-popover header strong {
    color: var(--reverse, #fff);
    font-size: 18px;
  }

  .mobile-nav-popover header button {
    width: 34px;
    height: 34px;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse, #fff) 8%, transparent);
    color: var(--reverse, #fff);
  }

  .workspace-main {
    min-width: 0;    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    padding: 22px clamp(20px, 4vw, 72px) 80px;
  }

  .workspace-main > :is(header, section) {
    width: min(1200px, 100%);
    min-width: 0;
    margin-inline: auto;
    box-sizing: border-box;
  }

  .workspace-main.overview-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-top {    justify-content: space-between;
    align-items: center;
  }

  .workspace-top h1 {
    margin: 4px 0 0;
    font-size: clamp(25px, 2.4vw, 38px);
    letter-spacing: 0;
    line-height: 1.05;
  }

  .overview-stage {
    min-width: 0;    align-content: start;
  }

  .overview-head,
  .metric-grid button,
  .chart-card,
  .billing-stack button,
  .signal-grid article,
  .notification-strip article,
  .overview-grid article {
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
    box-shadow: 0 30px 80px #00000030;
  }

  .overview-head {    justify-content: space-between;
    align-items: center;
    padding: clamp(18px, 4vw, 30px);
  }

  .overview-head h2,
  .overview-head p,
  .overview-grid h3,
  .overview-grid p {
    margin: 0;
  }

  .overview-head h2 {
    font-size: clamp(30px, 4vw, 52px);
    line-height: 1;
  }

  .overview-head p {
    max-width: 680px;
    line-height: 1.6;
  }

  .overview-head button,
  .overview-grid header button {
    min-height: 36px;
    border: 1px solid color-mix(in srgb, var(--x_color, #da3) 36%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--x_color, #da3) 18%, transparent);
    color: var(--x_color, #da3);
    padding: 0 12px;
    cursor: pointer;
    font: inherit;
  }

  .metric-grid {    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }

  .metric-grid button {    padding: 16px;
    text-align: left;
    cursor: pointer;
  }

  .metric-grid b {
    color: var(--reverse);
    font-size: 34px;
    line-height: 1;
  }

  .metric-grid span {
    color: color-mix(in srgb, var(--reverse) 62%, transparent) !important;
    font-size: 12px;
  }

  .finance-grid {    grid-template-columns: minmax(0, 1.8fr) minmax(250px, .8fr);
  }

  .chart-card {    padding: 16px;
  }

  .chart-card h3,
  .chart-card header b {
    margin: 0;
    color: var(--reverse);
  }

  .chart-card canvas {
    width: 100%;
    height: 220px;
    border-radius: 8px;
    background: #000;
  }

  .billing-stack button {
    min-height: 0;
    padding: 16px;
    text-align: left;
    cursor: pointer;
  }

  .billing-stack b {
    color: var(--reverse);
    font-size: 28px;
  }

  .signal-grid {
    grid-template-columns: 1.2fr 1fr 1fr;
  }

  .signal-grid article,
  .notification-strip article {    padding: 16px;
  }

  .signal-grid strong,
  .notification-strip b {
    color: var(--reverse);
    font-size: 18px;
  }

  .signal-grid p,
  .notification-strip span {
    margin: 0;
    color: color-mix(in srgb, var(--reverse) 64%, transparent) !important;
    line-height: 1.55;
  }

  .notification-strip {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .overview-grid {    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .overview-grid article {
    overflow: hidden;
  }

  .overview-grid header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    border-bottom: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent);
    padding: 14px 16px;
  }

  .row-list button {
    min-width: 0;
    display: grid;
    gap: 4px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--reverse) 8%, transparent);
    background: transparent;
    padding: 14px 16px;
    text-align: left;
    cursor: pointer;
  }

  .row-list :is(button:hover) {
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
  }

  .row-list b {
    color: var(--reverse);
    overflow-wrap: anywhere;
  }

  .row-list span,
  .row-list p {
    color: color-mix(in srgb, var(--reverse) 64%, transparent) !important;
    font-size: 13px;
  }


  :global(.staff-shell .workspace-main :is(input, select, textarea)) {
    border: 1px solid color-mix(in srgb, var(--reverse) 14%, transparent) !important;
    background: color-mix(in srgb, var(--reverse) 7%, transparent) !important;
    color: var(--reverse) !important;
    border-radius: 6px !important;
  }




  :global(.staff-shell .workspace-main table) {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
    overflow: hidden;
  }

  :global(.staff-shell .workspace-main .table-wrap) {
    width: 100%;
    min-width: 0;
    overflow-x: auto;
    border-color: #222 !important;
    background: #050505 !important;
    box-shadow: none !important;
  }

  :global(.staff-shell .workspace-main section:has(> .table-wrap)) {
    min-width: 0;
    overflow: hidden;
    border: 1px solid #222 !important;
    border-radius: 8px;
    background: #050505 !important;
    box-shadow: none !important;
  }

  :global(.staff-shell .workspace-main .admin-table-panel) {
    min-width: 0;
    overflow-x: auto;
    border: 1px solid #222 !important;
    border-radius: 8px;
    background: #050505 !important;
    box-shadow: none !important;
  }

  :global(.staff-shell .workspace-main table caption) {
    caption-side: top;
    border-bottom: 1px solid #222;
    background: #111;
    color: var(--reverse);
    padding: 16px 18px;
    font-weight: 700;
    text-align: left;
  }

  :global(.staff-shell .workspace-main section:has(> .table-wrap) > header) {
    margin: 0;
    border-bottom: 1px solid #222 !important;
    background: #111 !important;
    padding: 16px 18px !important;
  }

  :global(.staff-shell .workspace-main :is(.table-title, .section-head)) {
    color: var(--reverse);
  }

  :global(.staff-shell .workspace-main :is(.table-title, .section-head) :is(small, p, span)) {
    color: color-mix(in srgb, var(--reverse) 64%, transparent) !important;
  }


  :global(.staff-shell .workspace-main table) {
    background: #050505 !important;
    box-shadow: none !important;
  }

  :global(.staff-shell .workspace-main th) {
    color: color-mix(in srgb, var(--reverse) 62%, transparent) !important;
    font-size: 12px;
    font-weight: 700;
  }

  :global(.staff-shell .workspace-main [overflow]) {
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  :global(.staff-shell .workspace-main :is(th, td)) {
    border-color: color-mix(in srgb, var(--reverse) 10%, transparent) !important;
    padding: 10px 12px !important;
    vertical-align: top;
    white-space: nowrap;
  }

  :global(.staff-shell .workspace-main td :is(p, small)) {
    max-width: 34ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.staff-shell .workspace-main :is(.detail-row, .user-detail-row) td :is(p, small, textarea)) {
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  :global(.staff-shell .workspace-main td b) {
    display: inline-block;
    max-width: min(32ch, 28vw);
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  :global(.staff-shell .workspace-main tr:hover) {
    background: color-mix(in srgb, var(--reverse) 5%, transparent);
  }

  @media (max-width: 1200px) {
  .data-errors {
    display: grid;
    margin-bottom: 14px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, #ffcc66 38%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, #ffcc66 12%, transparent);
  }

  .data-errors strong {
    color: var(--reverse);
  }

  .staff-shell {
      grid-template-columns: 52px minmax(0, 1fr);
    }

    .staff-nav {
      display: none;
    }

    .mobile-nav-popover:popover-open {
      display: grid;
      gap: 14px;
    }

    .overview-grid {
      grid-template-columns: 1fr;
    }

    .finance-grid,
    .signal-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
  .data-errors {
    display: grid;
    margin-bottom: 14px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, #ffcc66 38%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, #ffcc66 12%, transparent);
  }

  .data-errors strong {
    color: var(--reverse);
  }

  .staff-shell {
      grid-template-columns: 1fr;
    }

    .icon-rail {
      position: sticky;
      z-index: 20;
      flex-direction: row;
      justify-content: start;
      height: auto;
      overflow: auto hidden;
      border-bottom: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent);
    }

    .rail-user {
      margin-top: 0;
      margin-left: auto;
      min-width: 36px;
    }

    .workspace-main {
      padding: 16px 12px 48px;
    }

    .overview-head {
      align-items: stretch;
      flex-direction: column;
    }

    .mobile-nav-popover {
      width: calc(100vw - 24px);
      margin: 64px auto auto;
    }
  }
</style>
