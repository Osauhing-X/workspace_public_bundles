<svelte:options runes={false} />

<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { get } from 'svelte/store';
  import { admin_filter } from './context.js';
  import { staffOs, isStaffUser } from './staff_utils.js';
  import { formatDate } from '$lib/assets/scripts/helpers';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  const asArray = (value) => Array.isArray(value) ? value : [];
  const rowTitle = (row = {}) => row.service || row.title || row.metadata?.title || 'Teenuse osutamine';
  const rowNote = (row = {}) => row.description || row.note || row.metadata?.note || '';
  const rowMeta = (row = {}) => row.metadata && typeof row.metadata === 'object' ? row.metadata : {};

  let users = [];
  let projects = [];
  let invoices = [];
  let kanbanBoards = [];
  let tableLogs = [];
  let stripeProducts = [];
  let stripePrices = [];
  let permissions = {};
  let selectedWorker = permissions.current_user_id || '';
  let projectFilter = get(admin_filter).projekt || '';
  let status = '';
  let saving = false;
  let now = Date.now();
  let timerEnabled = true;
  let draft = {
    title: 'Teenuse osutamine',
    project_id: projectFilter,
    invoice_id: '',
    kanban_card_id: '',
    stripe_price_id: '',
    note: '',
    started_at: localDateTimeValue(),
    stopped_at: localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
  };

  onMount(() => {
    now = Date.now();
    const interval = setInterval(() => now = Date.now(), 1000);
    return () => clearInterval(interval);
  });

  $: users = asArray(adminData.users_data?.users);
  $: projects = asArray(adminData.projekt_data);
  $: invoices = asArray(adminData.stripe_data?.invoices).filter((invoice) => String(invoice.status || '').toLowerCase() === 'draft');
  $: kanbanBoards = asArray(adminData.kanban_data);
  $: tableLogs = asArray(adminData.work_logs_data);
  $: stripeProducts = asArray(adminData.stripe_data?.products);
  $: stripePrices = asArray(adminData.stripe_data?.prices);
  $: permissions = adminData.staff_permissions || {};
  $: staffUsers = users.filter(isStaffUser);
  $: if (!selectedWorker) selectedWorker = permissions.current_user_id || staffUsers[0]?.id || (import.meta.env.DEV ? 'admin' : '');
  $: worker = staffUsers.find((item) => item.id === selectedWorker) || (import.meta.env.DEV ? { id: selectedWorker || 'admin', email: permissions.current_user_email || 'admin' } : staffUsers[0]);
  $: productPriceOptions = buildProductPriceOptions();
  $: legacyLogs = staffUsers.flatMap((user) => staffOs(user).work_logs.map((row) => ({
    ...row,
    id: row.id || crypto.randomUUID(),
    worker_id: row.worker_id || user.id,
    worker_email: row.worker_email || user.email,
    service: rowTitle(row),
    description: rowNote(row)
  })));
  $: logsSource = tableLogs.length ? tableLogs : legacyLogs;
  $: activeTimer = logsSource.find((row) => workerMatches(row) && !row.stopped_at) || staffOs(worker).active_timer;
  $: activeMetadata = activeTimer?.metadata && typeof activeTimer.metadata === 'object' ? activeTimer.metadata : {};
  $: activePrice = priceOptionById(activeMetadata.stripe_price_id || draft.stripe_price_id);
  $: timerLive = activeTimer ? formatDuration(activeTimer.started_at, activeTimer.stopped_at || now) : '';
  $: activeAmount = activeTimer && activePrice ? amountForDuration(activeTimer.started_at, activeTimer.stopped_at || now, activePrice.unit) : 0;
  $: logs = logsSource
    .filter(workerMatches)
    .filter((row) => !projectFilter || row.project_id === projectFilter)
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  $: completedLogs = logs.filter((row) => workStatus(row) === 'completed');
  $: activeLogs = logs.filter((row) => workStatus(row) !== 'completed');

  function workStatus(row = {}) {
    const value = String(rowMeta(row).status || '').toLowerCase();
    if (['planned', 'in_progress', 'paused', 'completed'].includes(value)) return value;
    return row.stopped_at ? 'completed' : 'in_progress';
  }

  function localDateTimeValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function isoFromLocal(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  function durationMs(startedAt, stoppedAt = now) {
    const start = new Date(startedAt).getTime();
    const stop = new Date(stoppedAt).getTime();
    return Number.isFinite(start) && Number.isFinite(stop) ? Math.max(stop - start, 0) : 0;
  }

  function hours(startedAt, stoppedAt) {
    return Number((durationMs(startedAt, stoppedAt) / 3600000).toFixed(2));
  }

  function formatDuration(startedAt, stoppedAt) {
    const seconds = Math.floor(durationMs(startedAt, stoppedAt) / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
  }

  function money(value, currency = 'eur') {
    return `${Number(value || 0).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`;
  }

  function projectLabel(id) {
    const project = projects.find((item) => item.id === id);
    return project?.title || project?.name || id || 'Projektita';
  }

  function kanbanWorklogCards(board = {}) {
    return asArray(board.cards).filter((card) => card.worklog_enabled || card.metadata?.worklog_enabled);
  }

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function productId(product = {}) {
    return product.id || product.object?.id || '';
  }

  function productName(product = {}) {
    return product.name || product.object?.name || productId(product) || 'Stripe product';
  }

  function priceProductId(price = {}) {
    const product = price.product ?? price.object?.product ?? price.metadata?.product;
    return typeof product === 'string' ? product : product?.id || '';
  }

  function buildProductPriceOptions() {
    return stripePrices.map((price) => {
      const product = stripeProducts.find((item) => productId(item) === priceProductId(price));
      const cents = Number(price.amount || price.unit_amount || 0);
      const currency = price.currency || price.object?.currency || 'eur';
      const recurring = price.object?.recurring?.interval ? ` / ${price.object.recurring.interval}` : '';
      return {
        key: price.id,
        price,
        product,
        product_id: productId(product) || priceProductId(price),
        product_name: productName(product),
        unit: cents / 100,
        currency,
        label: `${productName(product)} - ${money(cents / 100, currency)}${recurring}`
      };
    });
  }

  function priceOptionById(id) {
    return productPriceOptions.find((item) => item.key === id) || null;
  }

  function amountForDuration(startedAt, stoppedAt, rate) {
    return Number((hours(startedAt, stoppedAt || now) * Number(rate || 0)).toFixed(2));
  }

  function workPrice(row = {}) {
    return priceOptionById(rowMeta(row).stripe_price_id);
  }

  function workAmount(row = {}) {
    const option = workPrice(row);
    return option ? amountForDuration(row.started_at, row.stopped_at || now, option.unit) : Number(row.amount || 0);
  }

  function workerMatches(row = {}) {
    return row.worker_id === selectedWorker ||
      norm(row.worker_email) === norm(worker?.email) ||
      (import.meta.env.DEV && norm(row.worker_email) === 'admin');
  }

  function localUpsert(row) {
    tableLogs = [row, ...tableLogs.filter((item) => item.id !== row.id)];
  }

  async function send(method, body) {
    saving = true;
    status = 'Saving...';
    const response = await fetch('/@_api/admin/worklog', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    saving = false;

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      status = data.error || 'Save failed';
      return null;
    }

    status = 'Saved';
    return data;
  }

  function payload(extra = {}) {
    const selectedPrice = priceOptionById(draft.stripe_price_id);
    return {
      title: draft.title || 'Teenuse osutamine',
      project_id: draft.project_id || projectFilter || '',
      worker_id: selectedWorker,
      worker_email: worker?.email || '',
      note: draft.note || '',
      metadata: {
        status: 'in_progress',
        invoice_id: draft.invoice_id || null,
        kanban_card_id: draft.kanban_card_id || null,
        stripe_product_id: selectedPrice?.product_id || null,
        stripe_price_id: selectedPrice?.key || null,
        stripe_product_name: selectedPrice?.product_name || null,
        unit_amount: selectedPrice?.unit ?? null,
        currency: selectedPrice?.currency || null
      },
      hourly_rate: selectedPrice?.unit ?? 0,
      ...extra
    };
  }

  async function startWork() {
    if (!worker || activeTimer) return;
    const row = await send('POST', payload({ action: 'start', started_at: new Date().toISOString() }));
    if (row) { localUpsert(row); await invalidateAll(); }
  }

  async function stopWork() {
    if (!worker || !activeTimer) return;
    const row = await send('PUT', {
      ...activeTimer,
      id: activeTimer.id,
      action: 'stop',
      title: draft.title || rowTitle(activeTimer),
      note: draft.note || rowNote(activeTimer),
      project_id: activeTimer.project_id || draft.project_id || '',
      metadata: {
        ...activeMetadata,
        status: 'in_progress',
        invoice_id: draft.invoice_id || activeMetadata.invoice_id || null,
        kanban_card_id: draft.kanban_card_id || activeMetadata.kanban_card_id || null,
        ...(priceOptionById(draft.stripe_price_id) ? {
          stripe_product_id: priceOptionById(draft.stripe_price_id).product_id,
          stripe_price_id: priceOptionById(draft.stripe_price_id).key,
          stripe_product_name: priceOptionById(draft.stripe_price_id).product_name,
          unit_amount: priceOptionById(draft.stripe_price_id).unit,
          currency: priceOptionById(draft.stripe_price_id).currency
        } : {})
      },
      worker_id: selectedWorker,
      worker_email: worker?.email || '',
      started_at: activeTimer.started_at
    });
    if (row) { localUpsert(row); await invalidateAll(); }
  }

  async function pauseWork() {
    if (!worker || !activeTimer) return;
    const row = await send('PUT', {
      ...activeTimer,
      id: activeTimer.id,
      action: 'pause',
      title: draft.title || rowTitle(activeTimer),
      note: draft.note || rowNote(activeTimer),
      metadata: { ...activeMetadata, status: 'paused' },
      worker_id: selectedWorker,
      worker_email: worker?.email || '',
      started_at: activeTimer.started_at
    });
    if (row) { localUpsert(row); await invalidateAll(); }
  }

  async function continueWork(row) {
    if (!worker || activeTimer) return;
    const elapsed = durationMs(row.started_at, row.stopped_at);
    const resumedStart = new Date(Date.now() - elapsed).toISOString();
    const saved = await send('PUT', {
      ...row,
      id: row.id,
      action: 'continue',
      title: rowTitle(row),
      note: rowNote(row),
      started_at: resumedStart,
      stopped_at: null,
      metadata: { ...rowMeta(row), status: 'in_progress' }
    });
    if (saved) { localUpsert(saved); await invalidateAll(); }
  }

  async function saveActiveWork() {
    if (!worker || !activeTimer) return;
    const row = await send('PUT', {
      ...activeTimer,
      id: activeTimer.id,
      action: 'update',
      title: draft.title || rowTitle(activeTimer),
      note: draft.note || rowNote(activeTimer),
      project_id: draft.project_id || activeTimer.project_id || '',
      metadata: {
        ...activeMetadata,
        invoice_id: draft.invoice_id || activeMetadata.invoice_id || null,
        kanban_card_id: draft.kanban_card_id || activeMetadata.kanban_card_id || null,
        ...(priceOptionById(draft.stripe_price_id) ? {
          stripe_product_id: priceOptionById(draft.stripe_price_id).product_id,
          stripe_price_id: priceOptionById(draft.stripe_price_id).key,
          stripe_product_name: priceOptionById(draft.stripe_price_id).product_name,
          unit_amount: priceOptionById(draft.stripe_price_id).unit,
          currency: priceOptionById(draft.stripe_price_id).currency
        } : {})
      },
      worker_id: selectedWorker,
      worker_email: worker?.email || '',
      started_at: activeTimer.started_at,
      stopped_at: null
    });
    if (row) localUpsert(row);
  }

  async function addManual() {
    if (!worker || !draft.started_at || !draft.stopped_at) return;
    const startedAt = isoFromLocal(draft.started_at);
    let stoppedAt = isoFromLocal(draft.stopped_at);
    if (!startedAt) {
      status = 'Algusaeg ei ole korrektne';
      return;
    }
    if (!stoppedAt || new Date(stoppedAt) <= new Date(startedAt)) {
      stoppedAt = new Date(new Date(startedAt).getTime() + 60 * 60 * 1000).toISOString();
      draft.stopped_at = localDateTimeValue(stoppedAt);
    }
    const row = await send('POST', payload({
      action: 'create',
      started_at: startedAt,
      stopped_at: stoppedAt,
      metadata: { ...payload().metadata, status: 'completed' }
    }));
    if (row) {
      localUpsert(row);
      const nextStart = new Date();
      draft.started_at = localDateTimeValue(nextStart);
      draft.stopped_at = localDateTimeValue(new Date(nextStart.getTime() + 60 * 60 * 1000));
      await invalidateAll();
    }
  }

  async function updateLog(row, key, value) {
    const next = {
      ...row,
      [key]: value,
      title: key === 'service' ? value : rowTitle(row),
      note: key === 'description' ? value : rowNote(row),
      metadata: row.metadata || {}
    };
    const saved = await send('PUT', next);
    if (saved) localUpsert(saved);
  }

  async function updateWorker(row, value) {
    const staff = staffUsers.find((item) => item.id === value);
    const saved = await send('PUT', {
      ...row,
      worker_id: value || null,
      worker_email: staff?.email || row.worker_email || '',
      title: rowTitle(row),
      note: rowNote(row),
      metadata: rowMeta(row)
    });
    if (saved) localUpsert(saved);
  }

  async function updateRowMeta(row, patch = {}) {
    const saved = await send('PUT', {
      ...row,
      title: rowTitle(row),
      note: rowNote(row),
      metadata: {
        ...rowMeta(row),
        ...patch
      },
      hourly_rate: patch.unit_amount ?? row.hourly_rate ?? 0
    });
    if (saved) localUpsert(saved);
  }

  async function updateProduct(row, priceId) {
    const option = priceOptionById(priceId);
    await updateRowMeta(row, {
      stripe_product_id: option?.product_id || null,
      stripe_price_id: option?.key || null,
      stripe_product_name: option?.product_name || null,
      unit_amount: option?.unit ?? null,
      currency: option?.currency || null
    });
  }

  async function removeLog(row) {
    if (!confirm('Kustuta töölogi')) return;
    const response = await fetch('/@_api/admin/worklog', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      status = data.error || 'Delete failed';
      return;
    }
    tableLogs = tableLogs.filter((item) => item.id !== row.id);
    status = 'Deleted';
  }
</script>

<section class="work-log grid gap _5">
  <header class="flex gap _3 _space _wrap">
    <div class="grid gap _1">
      <small>staff work</small>
      <h2>Tee tööd</h2>
      <p>Start/stop salvestab kirjed public.work_logs tabelisse. Kui tabel või õigus on puudu, näitab staatus vea kohe välja.</p>
    </div>
    <div class="flex gap _2 _wrap">
      <select bind:value={selectedWorker}>
        {#each staffUsers as staff}
          <option value={staff.id}>{staff.user_metadata?.full_name || staff.email}</option>
        {/each}
      </select>
      <select bind:value={projectFilter}>
        <option value="">Kõik projektid</option>
        {#each projects as project}
          <option value={project.id}>{project.title || project.name || project.id}</option>
        {/each}
      </select>
    </div>
  </header>

  <section class="manual-panel grid gap _3">
    <header class="flex gap _3 _space _wrap _center _y">
      <div><h3>Töö</h3><small>Kirjelda töö sisu ning vali, kas mõõdad aega taimeriga või sisestad ajavahemiku käsitsi.</small></div>
      <label class="timer-toggle flex gap _2 _center _y"><input type="checkbox" bind:checked={timerEnabled}><span>Kasuta taimerit</span></label>
    </header>
    <div class="grid gap _3">
      <div class="flex gap _3 _space">
        <div>
          <small>{timerEnabled ? 'Aktiivne taimer' : 'Manuaalne ajavahemik'}</small>
          <strong>{activeTimer ? rowTitle(activeTimer) : 'No active work'}</strong>
        </div>
        {#if activeTimer}
          <div class="timer-live gap grid">
            <b>{timerLive}</b>
            {#if activePrice}<small>{money(activeAmount, activePrice.currency)} jooksvalt</small>{/if}
          </div>
        {/if}
      </div>
      <div class="grid gap _2 fields">
        <input placeholder="Töö pealkiri" bind:value={draft.title}>
        <select bind:value={draft.project_id}>
          <option value="">Projektita töö</option>
          {#each projects as project}<option value={project.id}>{project.title || project.name || project.id}</option>{/each}
        </select>
        <select bind:value={draft.invoice_id}>
          <option value="">Arveta töö</option>
          {#each invoices as invoice}<option value={invoice.id}>{invoice.number || invoice.id} · draft</option>{/each}
        </select>
        <select bind:value={draft.stripe_price_id}>
          <option value="">Stripe tooteta</option>
          {#each productPriceOptions as item}<option value={item.key}>{item.label}</option>{/each}
        </select>
        <select bind:value={draft.kanban_card_id}>
          <option value="">Kanbanita töö</option>
          {#each kanbanBoards as board}
            {#if kanbanWorklogCards(board).length}
              <optgroup label={board.title || board.name || board.id || 'Kanban'}>
                {#each kanbanWorklogCards(board) as card}
                  <option value={card.id}>{card.title || card.id}</option>
                {/each}
              </optgroup>
            {/if}
          {/each}
        </select>
        <textarea rows="3" placeholder="Mida tegid" bind:value={draft.note}></textarea>
        {#if !timerEnabled}
          <label class="grid gap"><span>Algusaeg</span><input type="datetime-local" bind:value={draft.started_at}></label>
          <label class="grid gap"><span>Lõppaeg</span><input type="datetime-local" bind:value={draft.stopped_at}></label>
        {/if}
      </div>
      <div class="flex gap _2 _wrap _space">
        {#if timerEnabled && activeTimer}
          <div class="flex gap _2 _wrap">
            <button class="btn" type="button" on:click={saveActiveWork} disabled={saving}>Salvesta jooksvalt</button>
            <button class="btn" type="button" on:click={pauseWork} disabled={saving}>Pause</button>
            <button class="btn _color" type="button" on:click={stopWork} disabled={saving}>Stop</button>
          </div>
        {:else if timerEnabled}
          <button class="btn _color" type="button" on:click={startWork} disabled={saving}>Start</button>
        {:else}
          <button class="btn _color" type="button" on:click={addManual} disabled={saving}>Lisa töö</button>
        {/if}
        {#if status}<small>{status}</small>{/if}
      </div>
    </div>
  </section>

  {#each [['Pooleli ja tegemisel', activeLogs], ['Valmis tööd', completedLogs]] as [tableTitle, tableRows]}
  <section class="work-table admin-table-panel">
    <header class="table-title"><h3>{tableTitle}</h3><small>{tableRows.length} kirjet</small></header>
    <div overflow class="table-wrap">
    <table>
      <thead>
        <tr><th>Töö</th><th>Status</th><th>Töötaja</th><th>Projekt</th><th>Toode</th><th>Algus</th><th>Lõpp</th><th>Tunnid</th><th>Seosed</th><th>Märkus</th><th></th></tr>
      </thead>
      <tbody>
        {#each tableRows as row}
          <tr>
            <td><input value={rowTitle(row)} on:change={(event) => updateLog(row, 'service', event.currentTarget.value)}></td>
            <td><select value={workStatus(row)} on:change={(event) => updateRowMeta(row, { status: event.currentTarget.value })}>
              <option value="planned">Planeeritud</option><option value="in_progress">Tegemisel</option><option value="paused">Pooleli</option><option value="completed">Valmis</option>
            </select></td>
            <td>
              <select value={row.worker_id || ''} on:change={(event) => updateWorker(row, event.currentTarget.value || null)}>
                <option value="">Määramata</option>
                {#each staffUsers as staff}
                  <option value={staff.id}>{staff.user_metadata?.full_name || staff.email}</option>
                {/each}
              </select>
              <small>{row.worker_email || 'staff puudub'}</small>
            </td>
            <td>
              <select value={row.project_id || ''} on:change={(event) => updateLog(row, 'project_id', event.currentTarget.value || null)}>
                <option value="">Projektita töö</option>
                {#each projects as project}<option value={project.id}>{project.title || project.name || project.id}</option>{/each}
              </select>
              <small>{projectLabel(row.project_id)}</small>
            </td>
            <td>
              <select value={rowMeta(row).stripe_price_id || ''} on:change={(event) => updateProduct(row, event.currentTarget.value)}>
                <option value="">Tooteta</option>
                {#each productPriceOptions as item}<option value={item.key}>{item.label}</option>{/each}
              </select>
              <small>{workPrice(row)?.product_name || rowMeta(row).stripe_product_name || 'Stripe seos puudub'}</small>
            </td>
            <td><input type="datetime-local" value={localDateTimeValue(row.started_at)} on:change={(event) => updateLog(row, 'started_at', isoFromLocal(event.currentTarget.value))}></td>
            <td>
              {#if row.stopped_at}
                <input type="datetime-local" value={localDateTimeValue(row.stopped_at)} on:change={(event) => updateLog(row, 'stopped_at', isoFromLocal(event.currentTarget.value))}>
              {:else}
                <button class="btn _color" type="button" on:click={() => stopWork()} disabled={activeTimer?.id !== row.id || saving}>Stop</button>
              {/if}
              {#if row.stopped_at && workStatus(row) !== 'completed'}<button class="btn" type="button" on:click={() => continueWork(row)} disabled={!!activeTimer || saving}>Continue</button>{/if}
            </td>
            <td><b>{Number(row.duration_hours || hours(row.started_at, row.stopped_at || now)).toFixed(2)}h</b><small>{workPrice(row) ? money(workAmount(row), workPrice(row).currency) : formatDate(row.started_at)}</small></td>
            <td>
              <select value={rowMeta(row).invoice_id || ''} on:change={(event) => updateRowMeta(row, { invoice_id: event.currentTarget.value || null })}>
                <option value="">Arveta</option>
                {#each invoices as invoice}<option value={invoice.id}>{invoice.number || invoice.id} · draft</option>{/each}
              </select>
              <small>{rowMeta(row).kanban_card_id ? `Kanban: ${rowMeta(row).kanban_card_id}` : 'Kanbanita'}</small>
            </td>
            <td><textarea rows="2" value={rowNote(row)} on:change={(event) => updateLog(row, 'description', event.currentTarget.value)}></textarea></td>
            <td><button class="btn _transparent" type="button" on:click={() => removeLog(row)}>Kustuta</button></td>
          </tr>
        {:else}
          <tr><td colspan="11">Selles jaotises kirjeid pole.</td></tr>
        {/each}
      </tbody>
    </table>
    </div>
  </section>
  {/each}
</section>

<style>
  .work-log {
    width: min(1300px, 100%);
    margin: 0 auto;
  }

  h2,
  p {
    margin: 0;
  }

  .manual-panel{border:1px solid #222;border-radius:8px;background:#0b0b0b;padding:18px}.manual-panel h3,.table-title h3{margin:0}.table-title{border-bottom:1px solid #222;background:#111;padding:16px 18px}.table-title small{color:#999}

  .timer-live {    justify-items: end;
    min-width: 150px;
  }


  strong,
  b {
    color: var(--reverse);
  }

  .fields {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  textarea {
    min-width: 220px;
  }

  .work-table :is(th, td),
  .work-table td :is(small, b, span) {
    white-space: nowrap !important;
  }

  .work-table td small {
    display: block;
    max-width: 24ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .work-table textarea {
    height: 34px;
    min-height: 34px;
    white-space: nowrap;
    overflow: hidden;
    resize: horizontal;
  }

</style>
