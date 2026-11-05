<svelte:options runes={false} />
<script>
  import { page } from '$app/stores';
  import Popover from '$lib/components/popover.svelte';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  const asArray = (value) => Array.isArray(value) ? value : [];
  const toText = (value) => Array.isArray(value) ? value.join(', ') : '';

  let rows = [];
  let search = '';
  let status = '';
  let saving = false;
  let selected = '';
  let draft = blank();
  let edits = {};
  let revealedSecrets = {};

  $: rows = asArray(adminData.b2b_data);
  $: filtered = rows
    .filter(row => {
      const q = search.toLowerCase();
      return !q ||
        String(row.domain || '').toLowerCase().includes(q) ||
        String(row.who_id || '').toLowerCase().includes(q) ||
        String(row.client || '').toLowerCase().includes(q) ||
        String(row.name || '').toLowerCase().includes(q);
    })
    .sort((a, b) => portalLabel(a).localeCompare(portalLabel(b)));

  function blank() {
    return {
      route_mode: 'dns',
      domain: '',
      who_id: uniquePortalId(),
      name: '',
      client: '',
      credit: 0,
      reserved_credit: 0,
      status: 'active',
      manual_plan: 'basic',
      weekly_limit: 200,
      accessText: '',
      resourceText: ''
    };
  }

  function uniquePortalId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
  }

  $: if (draft.route_mode === 'who' && !draft.who_id) draft.who_id = uniquePortalId();

  function portalMode(item = {}) {
    return item.route_mode || (!item.domain && item.who_id ? 'who' : 'dns');
  }

  function portalLabel(item = {}) {
    return portalMode(item) === 'who'
      ? (item.who_id || item.name || 'workspace portal')
      : (item.domain || item.name || 'dns portal');
  }

  function edit(item) {
    const key = item.id || item.who_id || item.domain;
    if (!edits[key]) {
      edits[key] = {
        ...blank(),
        ...item,
        manual_plan: item.metadata?.manual_plan || '',
        weekly_limit: item.metadata?.weekly_limit || 0,
        route_mode: portalMode(item),
        accessText: toText(item.access),
        resourceText: toText(item.resource)
      };
    }
    return edits[key];
  }

  function payload(item) {
    return {
      ...item,
      access: String(item.accessText || '').split(',').map((value) => value.trim()).filter(Boolean),
      resource: String(item.resourceText || '').split(',').map((value) => value.trim()).filter(Boolean),
      metadata: {
        ...(item.metadata || {}),
        manual_plan: item.manual_plan || null,
        weekly_limit: item.manual_plan === 'enterprise' ? 'unlimited' : Math.max(0, Number(item.weekly_limit || 0)),
        plan_started_at: item.metadata?.plan_started_at || new Date().toISOString()
      },
      domain: item.route_mode === 'dns' ? item.domain : '',
      who_id: item.route_mode === 'who' ? item.who_id : item.who_id
    };
  }

  async function request(method, body) {
    saving = true;
    status = 'Saving...';
    const response = await fetch('/@_api/admin/b2b', {
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

    status = data.warning || 'Saved';
    return data;
  }

  async function createRow() {
    if (draft.route_mode === 'dns' && !draft.domain.trim()) return alert('Lisa domeen.');
    if (draft.route_mode === 'who' && !draft.who_id.trim()) return alert('Lisa who_id.');
    const row = await request('POST', payload(draft));
    if (!row) return;
    rows = [row, ...rows];
    draft = blank();
    document.getElementById('b2b_create')?.hidePopover?.();
  }

  function editKey(item = {}) {
    return item.id || item.who_id || item.domain || portalLabel(item);
  }

  function toggleSecrets(item = {}) {
    const key = editKey(item);
    revealedSecrets = { ...revealedSecrets, [key]: !revealedSecrets[key] };
  }

  async function saveRow(item) {
    const row = await request('PUT', payload(item));
    if (!row) return;
    if (item._resetUsageAfterSave) {
      await request('PATCH', { action: 'reset_usage', domain: row.domain, who_id: row.who_id });
      item._resetUsageAfterSave = false;
    }
    rows = rows.map((current) => {
      const same = (current.id && current.id === row.id)
        || (current.who_id && current.who_id === row.who_id)
        || (current.domain && current.domain === row.domain);
      return same ? row : current;
    });
    edits[row.id || row.who_id || row.domain] = null;
  }

  async function deleteRow(item) {
    if (!confirm(`Kustuta portaal ${portalLabel(item)}`)) return;
    const ok = await request('DELETE', { id: item.id, domain: item.domain, who_id: item.who_id });
    if (!ok) return;
    rows = rows.filter((current) => current !== item && current.id !== item.id && current.domain !== item.domain && current.who_id !== item.who_id);
  }

  async function resetUsage(item) {
    if (!confirm(`Reset ${portalLabel(item)} weekly usage now?`)) return;
    const result = await request('PATCH', { action: 'reset_usage', domain: item.domain, who_id: item.who_id });
    if (result?.ok) status = `Weekly usage reset · ${result.remaining ?? 'unlimited'} remaining`;
  }
</script>

<section class="b2b-page grid gap _5">
  <header class="page-head flex gap _3 _space _wrap">
    <div>
      <h2>Tenant portaalid</h2>
      <small>Workspace public.portaal register: DNS tenantid ja workspace.extaas.com/t/{'{who_id}'} tenantid ühes vaates.</small>
    </div>
    <div class="flex gap _2 _wrap">
      <input placeholder="Otsi domeeni, who_id, kliendi või nime järgi..." bind:value={search}>
      <button class="btn _color" type="button" popovertarget="b2b_create">Lisa portaal</button>
      {#if status}<small class:warning-status={status !== 'Saved' && status !== 'Saving...'}>{status}</small>{/if}
    </div>
  </header>

  <Popover id="b2b_create" width={760} showLanguage={false}>
  <div class="create-panel grid gap _3">
    <header class="flex gap _2 _space _wrap">
      <div>
        <small>tenant</small>
        <h3>Lisa portaal</h3>
      </div>
      <button class="btn _transparent" type="button" popovertarget="b2b_create" popovertargetaction="hide">Tühista</button>
    </header>
    <div class="form-grid gap _2 grid">
      <label class="grid gap"><span>Portaali tüüp</span><select bind:value={draft.route_mode} aria-label="Portal route type">
        <option value="dns">DNS + kohalik /t/ id</option>
        <option value="who">Ainult kohalik /t/ id</option>
      </select></label>
      <label class="grid gap"><span>Domeen</span><input placeholder="domeen.ee" bind:value={draft.domain} disabled={draft.route_mode === 'who'}></label>
      <label class="grid gap">
        <span>{draft.route_mode === 'dns' ? 'Kohalik /t/ id' : 'Portaali hash'}</span>
        <input placeholder="who_id / unikaalne hash" bind:value={draft.who_id}>
      </label>
      <label class="grid gap"><span>Portaali nimi</span><input placeholder="Portaali nimi" bind:value={draft.name}></label>
      <label class="grid gap"><span>Kliendi email</span><input placeholder="client@email.ee" bind:value={draft.client}></label>
      <label class="grid gap"><span>Staatus</span><select bind:value={draft.status} aria-label="Portal status">
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="archived">Archived</option>
      </select></label>
      <label class="grid gap"><span>Workspace plan</span><select bind:value={draft.manual_plan} onchange={(event) => {
        draft.manual_plan = event.currentTarget.value;
        draft.weekly_limit = draft.manual_plan === 'basic' ? 200 : draft.manual_plan === 'premium' ? 1000 : 'unlimited';
      }}><option value="basic">Basic</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option></select></label>
      <label class="grid gap"><span>Juurdepääs</span><input placeholder="Access, komaga" bind:value={draft.accessText}></label>
      <button class="btn _color" type="button" onclick={createRow} disabled={saving}>Lisa portaal</button>
    </div>
  </div>
  </Popover>

  <section class="b2b-list admin-table-panel">
    <header class="table-title"><h3>Portaalid</h3><small>{filtered.length} kirjet</small></header>
    <div class="table-wrap"><table>
      <thead><tr><th>Portaal</th><th>Klient</th><th>Routing</th><th>Pakett</th><th>Staatus</th><th>Access</th></tr></thead>
      <tbody>
    {#each filtered as item}
      {@const editable = edit(item)}
      {@const key = editKey(item)}
      <tr title="{portalLabel(item)}" class="portal-row" class:open={selected === key} onclick={() => selected = selected === key ? '' : key}>
        <td>{item.name || portalLabel(item)}</td>
        <td>{item.client || '-'}</td><td>{portalMode(item)}</td><td>{item.metadata?.manual_plan || 'Stripe'}</td>
        <td><span class="status-pill">{item.status || item.dns_status || '-'}</span></td><td>{asArray(item.access).length}</td>
      </tr>
      {#if selected === key}
      <tr class="detail-row"><td colspan="6"><div class="portal-detail grid gap _3">
        <div class="detail-actions flex gap _2 _wrap">
          {#if item.domain}<a href={`https://${item.domain}/@/workspace`} target="_blank" rel="noreferrer">Ava DNS</a>{/if}
          {#if item.who_id}<a href={`/t/${item.who_id}/workspace`} target="_blank" rel="noreferrer">Ava workspace</a>{/if}
          <button class="btn _transparent" type="button" onclick={() => deleteRow(item)}>Kustuta</button>
        </div>
        <div class="form-grid gap _2 grid">
          <label class="grid gap"><span>Portaali tüüp</span><select bind:value={editable.route_mode} aria-label="Portal route type">
            <option value="dns">DNS + kohalik /t/ id</option>
            <option value="who">Ainult kohalik /t/ id</option>
          </select></label>
          <label class="grid gap"><span>Domeen</span><input placeholder="domeen.ee" bind:value={editable.domain} disabled={editable.route_mode === 'who'}></label>
          <label class="grid gap"><span>Portaali hash</span><input placeholder="who_id / unikaalne hash" bind:value={editable.who_id}></label>
          <label class="grid gap"><span>Portaali nimi</span><input placeholder="Portaali nimi" bind:value={editable.name}></label>
          <label class="grid gap"><span>Kliendi email</span><input placeholder="client@email.ee" bind:value={editable.client}></label>
          <label class="grid gap"><span>Staatus</span><select bind:value={editable.status} aria-label="Portal status">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select></label>
          <label class="grid gap"><span>Credit</span><input type="number" step="0.01" bind:value={editable.credit}></label>
          <label class="grid gap"><span>Reserved credit</span><input type="number" step="0.01" bind:value={editable.reserved_credit}></label>
          <label class="grid gap"><span>Workspace plan</span><select bind:value={editable.manual_plan} onchange={(event) => {
            editable.manual_plan = event.currentTarget.value;
            if (editable.manual_plan === 'basic') editable.weekly_limit = 200;
            if (editable.manual_plan === 'premium') editable.weekly_limit = 1000;
            if (editable.manual_plan === 'enterprise') editable.weekly_limit = 'unlimited';
            editable._resetUsageAfterSave = confirm('Reset this tenant’s current weekly usage to the selected plan allowance when saving?');
          }}><option value="">Stripe subscription</option><option value="basic">Basic</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option></select></label>
          <label class="grid gap"><span>Weekly credits</span><input disabled={!editable.manual_plan || editable.manual_plan === 'enterprise'} bind:value={editable.weekly_limit}></label>
          {#if revealedSecrets[editKey(item)]}
            <label class="grid gap"><span>Juurdepääs</span><input placeholder="Access, komaga" bind:value={editable.accessText}></label>
            <label class="grid gap"><span>Resource / võtmed</span><input placeholder="Resource, komaga" bind:value={editable.resourceText}></label>
            <button class="btn _transparent" type="button" onclick={() => toggleSecrets(item)}>Peida võtmed</button>
          {:else}
            <div class="secret-mask gap _2 grid">
              <span>Tenant võtmed on peidetud</span>
              <button class="btn _transparent" type="button" onclick={() => toggleSecrets(item)}>Näita võtmeid</button>
            </div>
          {/if}
          <button class="btn" type="button" onclick={() => saveRow(editable)} disabled={saving}>Salvesta</button>
          <button class="btn _transparent" type="button" onclick={() => resetUsage(editable)} disabled={saving}>Reset weekly usage</button>
        </div>
      </div></td></tr>
      {/if}
    {:else}
      <tr><td colspan="6"><strong>Portaale ei leitud.</strong></td></tr>
    {/each}
      </tbody></table></div>
  </section>
</section>

<style>
  .b2b-page {
    width: min(1200px, 100%);
    margin: 0 auto;
    text-align: left;
  }

  h2,
  h3 {
    margin: 0;
  }

  .admin-table-panel{overflow:hidden;border:1px solid #222;border-radius:8px;background:#050505;box-shadow:none}.table-title{padding:16px 18px;border-bottom:1px solid #222;background:#111}.table-title small{color:#999}.table-wrap{overflow-x:auto;box-shadow:none}.table-wrap table{width:100%;min-width:820px;border-collapse:collapse;background:#050505}.table-wrap thead{background:#111}.table-wrap th,.table-wrap td{padding:12px 14px;border-bottom:1px solid #222;text-align:left;vertical-align:middle}.table-wrap th{color:#999;font-size:12px}.portal-row{cursor:pointer}.portal-row:hover,.portal-row.open{background:#15120b}.portal-row small{display:block;margin-top:3px}.status-pill{display:inline-flex;border-radius:999px;background:#222;padding:4px 8px;font-size:12px;font-weight:700}.detail-row>td{max-width:0;padding:0!important;white-space:normal!important}.portal-detail{padding:18px;overflow:hidden}

  .page-head {
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 10%, transparent);
    border-radius: 10px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 26rem),
      color-mix(in srgb, var(--current, #000) 92%, var(--reverse, #fff) 3%);
    padding: clamp(14px, 2vw, 20px);
    box-shadow: 0 22px 80px #00000022;
  }

  .page-head input {
    min-width: min(320px, 100%);
  }

  .create-panel {
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 20rem),
      #050505;
    color: var(--reverse, #fff);
    color-scheme: dark;
    padding: clamp(16px, 3vw, 24px);
  }

  .create-panel .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .create-panel :is(input, select) {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 16%, transparent);
    background: color-mix(in srgb, var(--reverse, #fff) 7%, transparent);
    color: var(--reverse, #fff);
  }

  article.warning {
    border-color: #d0342c66;
    background: color-mix(in srgb, #d0342c 10%, var(--x_color_transparent_auto));
  }

  .warning-status {
    border-radius: 999px;
    background: color-mix(in srgb, #d0342c 15%, transparent);
    color: color-mix(in srgb, #ffb3ad 80%, var(--reverse, #fff));
    padding: 5px 8px;
  }

  .form-grid {    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    align-items: center;
  }

  .form-grid :is(input, select) {
    width: 100%;
  }

  .form-grid label span,
  .secret-mask span {
    color: color-mix(in srgb, var(--reverse, #fff) 68%, transparent);
    font-size: 12px;
    font-weight: 800;
  }

  .secret-mask {    border: 1px dashed color-mix(in srgb, var(--reverse, #fff) 18%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse, #fff) 5%, transparent);
    padding: 10px;
  }

  dl {    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));    margin: 0;
  }

  dl div {
    padding: 8px;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 8%, transparent);
    background: color-mix(in srgb, var(--reverse, #fff) 4%, transparent);
  }

  dd {
    margin: 0;
    font-weight: 800;
  }

  @media (max-width: 720px) {
    .page-head,
    article header {
      align-items: stretch;
    }

    .page-head :global(.btn),
    article header :global(.btn),
    article header a {
      width: 100%;
      justify-content: center;
    }
  }
</style>
