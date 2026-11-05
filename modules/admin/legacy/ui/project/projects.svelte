<svelte:options runes={false} />
<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { admin_filter, openAdminTab } from '../context.js';
  import { timeAgo } from '$lib/assets/scripts/helpers';
  import Popover from '$lib/components/popover.svelte';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  let projects = [];
  let companies = [];
  let invoices = [];
  let search = get(admin_filter).email || '';
  let companyFilter = get(admin_filter).ettevote || '';
  let saving = false;
  let selected = get(admin_filter).projekt || null;
  let edits = {};
  let draft = blankProject();

  $: projects = adminData.projekt_data || [];
  $: companies = adminData.ettevote_data || [];
  $: invoices = adminData.arve_data || [];
  $: rows = projects
    .filter(project => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        lower(project.title).includes(q) ||
        lower(project.email).includes(q) ||
        lower(project.type).includes(q) ||
        lower(project.status).includes(q) ||
        lower(company(project)?.name).includes(q);
      const matchesCompany = !companyFilter || project.ettevote_id === companyFilter;
      return matchesSearch && matchesCompany;
    })
    .sort((a, b) => (b.highlight === true) - (a.highlight === true) || new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

  function blankProject() {
    return {
      ettevote_id: '',
      email: get(admin_filter).email || '',
      title: '',
      type: 'ungrouped',
      status: 'awaiting review',
      order_description: '',
      accessText: '',
      devText: '',
      discord_channel: '',
      note: '',
      highlight: false
    };
  }

  function company(project) {
    return companies.find(item => item.id === project.ettevote_id);
  }

  function lower(value) {
    return String(value ?? '').toLowerCase();
  }

  function openInfo(project) {
    window.open(`/info?what=projekt&id=${encodeURIComponent(project.id)}`, 'mozillaWindow', 'popup');
  }

  function projectInvoices(project) {
    return invoices.filter(invoice => invoice.projekt_id === project.id);
  }

  function toText(value = []) {
    return Array.isArray(value) ? value.join(', ') : '';
  }

  function fromText(value = '') {
    return String(value)
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);
  }

  function editProject(project) {
    if (!edits[project.id]) {
      edits[project.id] = {
        ...project,
        ettevote_id: project.ettevote_id || '',
        email: project.email || '',
        accessText: toText(project.access),
        devText: toText(project.dev)
      };
    }
    return edits[project.id];
  }

  function payload(model) {
    return {
      ...model,
      access: fromText(model.accessText),
      dev: fromText(model.devText)
    };
  }

  async function createProject() {
    if (!draft.title.trim()) return alert('Lisa projekti nimi.');
    saving = true;
    const response = await fetch('/@_api/admin/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        email: draft.ettevote_id ? null : draft.email
      })
    });
    saving = false;
    const body = await response.json();
    if (!response.ok) return alert(body.error || 'Projekti loomine ebaõnnestus.');
    projects = [body, ...projects];
    draft = blankProject();
    selected = body.id;
    document.getElementById('project_create')?.hidePopover?.();
  }

  async function saveProject(project) {
    let bodyPayload;
    try {
      bodyPayload = payload(project);
    } catch (err) {
      return alert(err.message);
    }

    saving = true;
    const response = await fetch('/@_api/admin/project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });
    saving = false;
    const body = await response.json();
    if (!response.ok) return alert(body.error || 'Projekti salvestamine ebaõnnestus.');
    projects = projects.map(item => item.id === body.id ? body : item);
    edits[body.id] = null;
    selected = body.id;
  }
</script>

<section class="project-page grid gap _3">
  <header class="page-head flex gap _2 _space _center _y">
    <div>
      <h2>Projekt</h2>
      <small>Teenused ja projektid, mida saab siduda ettevõtte, eraisiku ning arvetega.</small>
    </div>
    <div class="filters flex gap _2">
      <input placeholder="Otsi projekti, ettevõtet, staatust või emaili..." bind:value={search}>
      <select bind:value={companyFilter}>
        <option value="">Kõik ettevõtted</option>
        {#each companies as item}
          <option value={item.id}>{item.name}</option>
        {/each}
      </select>
      <button class="btn _color" type="button" popovertarget="project_create">Lisa projekt</button>
    </div>
  </header>

  <Popover id="project_create" width={820} showLanguage={false}>
  <div class="create-panel gap _2 grid">
    <header class="flex gap _2 _space _center _y">
      <div>
        <small>uus töö</small>
        <h3>Lisa projekt</h3>
      </div>
      <button class="btn _transparent" type="button" popovertarget="project_create" popovertargetaction="hide">Tühista</button>
    </header>
    <label class="grid gap"><span>Klient</span><select bind:value={draft.ettevote_id}>
      <option value="">Eraisik</option>
      {#each companies as item}
        <option value={item.id}>{item.name}</option>
      {/each}
    </select></label>
    {#if !draft.ettevote_id}
      <label class="grid gap"><span>Kliendi email</span><input type="email" placeholder="email@domeen.ee" bind:value={draft.email}></label>
    {/if}
    <label class="grid gap"><span>Nimi</span><input placeholder="Projekti / teenuse nimi" bind:value={draft.title}></label>
    <label class="grid gap"><span>Tüüp</span><select bind:value={draft.type}>
      <option value="ungrouped">Muu</option>
      <option value="website">Veebileht / e-pood</option>
      <option value="automation">Automaatika</option>
      <option value="support">IT tugi</option>
      <option value="business_tools">Äritööriistad</option>
    </select></label>
    <label class="wide grid gap"><span>Kirjeldus</span><input placeholder="Lühikirjeldus" bind:value={draft.order_description}></label>
    <button type="button" on:click={createProject} disabled={saving}>{saving ? 'Loon...' : 'Lisa projekt'}</button>
  </div>
  </Popover>

  <section class="project-list admin-table-panel">
    <header class="table-title flex gap _2 _center _y _space _wrap">
      <div><h3>Projektid</h3><small>{rows.length} projekti</small></div>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Projekt</th><th>Klient</th><th>Tüüp</th><th>Status</th><th>Arved</th><th>Uuendatud</th></tr></thead>
        <tbody>
        {#each rows as project}
          {@const parent = company(project)}
          {@const relatedInvoices = projectInvoices(project)}
          {@const editable = editProject(project)}
          <tr class="project-row" class:open={selected === project.id} class:highlight={project.highlight} on:click={() => selected = selected === project.id ? null : project.id}>
            <td><b>{project.title || 'Nimetu projekt'}</b></td>
            <td>{parent?.name || project.email || 'Eraisik'}</td>
            <td>{project.type || 'ungrouped'}</td>
            <td><span class="status-pill">{project.status || 'awaiting review'}</span></td>
            <td>{relatedInvoices.length}</td>
            <td>{timeAgo(project.updated_at || project.created_at)}</td>
          </tr>

          {#if selected === project.id}
            <tr class="detail-row"><td colspan="6">
            <section class="project-detail gap _2 grid">
            <div class="summary gap _2 grid">
              <div><small>Uuendatud</small><b>{timeAgo(project.updated_at || project.created_at)}</b></div>
              <div><small>Juurdepääs</small><b>{project.access?.length || 0}</b></div>
              <div><small>Arendajad</small><b>{project.dev?.length || 0}</b></div>
            </div>

            <div class="actions flex gap _2">
              <button type="button" on:click={() => openInfo(project)}>Info URL</button>
              {#if parent}<button type="button" on:click={() => openAdminTab('ettevote', { email: parent.primary_email, ettevote: parent.id })}>Ettevõte</button>{/if}
              <button type="button" on:click={() => openAdminTab('worklog', { projekt: project.id, email: project.email })}>Tee tööd</button>
              <button type="button" on:click={() => openAdminTab('arve', { projekt: project.id, email: project.email })}>Arved</button>
              <button type="button" on:click={() => openAdminTab('kasutajad', { email: project.email })}>Kasutajad</button>
            </div>

            <div class="form-grid gap _2 grid">
              <label class="grid gap"><span>Ettevõte</span><select bind:value={editable.ettevote_id}>
                <option value="">Eraisik</option>
                {#each companies as item}<option value={item.id}>{item.name}</option>{/each}
              </select></label>
              <label class="grid gap"><span>Email</span><input type="email" bind:value={editable.email}></label>
              <label class="grid gap"><span>Pealkiri</span><input bind:value={editable.title}></label>
              <label class="grid gap"><span>Staatus</span><select bind:value={editable.status}>
                <option value="awaiting review">awaiting review</option>
                <option value="accepted">accepted</option>
                <option value="in progress">in progress</option>
                <option value="waiting client">waiting client</option>
                <option value="invoice sent">invoice sent</option>
                <option value="invoice paid">invoice paid</option>
                <option value="done">done</option>
                <option value="paused">paused</option>
                <option value="cancelled">cancelled</option>
              </select></label>
              <label class="grid gap"><span>Tüüp</span><input bind:value={editable.type}></label>
              <label class="grid gap"><span>Discord channel</span><input bind:value={editable.discord_channel}></label>
              <label class="grid gap"><span>Access emailid</span><input bind:value={editable.accessText} placeholder="a@b.ee, c@d.ee"></label>
              <label class="grid gap"><span>Dev emailid</span><input bind:value={editable.devText} placeholder="dev@extaas.com"></label>
              <label class="wide grid gap"><span>Kirjeldus</span><textarea bind:value={editable.order_description}></textarea></label>
              <label class="wide grid gap"><span>Märkus</span><textarea bind:value={editable.note}></textarea></label>
              <label class="check grid gap"><input type="checkbox" bind:checked={editable.highlight}> <span>Highlight</span></label>
            </div>

            <footer class="flex gap _2">
              <button type="button" on:click={() => saveProject(editable)} disabled={saving}>Salvesta projekt</button>
            </footer>
            </section>
            </td></tr>
          {/if}
        {:else}
          <tr><td colspan="6">Projekte ei leitud.</td></tr>
        {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .project-page {
    width: min(1200px, 100%);
    margin: 0 auto;    text-align: left;
  }

  .page-head,
  .filters,
  .actions,
  footer {    align-items: center;
    flex-wrap: wrap;
  }

  .page-head {
    justify-content: space-between;
  }

  h2 {
    margin: 0;
  }

  .admin-table-panel { min-width: 0; overflow: hidden; border: 1px solid #222; border-radius: 8px; background: #050505; box-shadow: none; }
  .table-title { padding: 16px 18px; border-bottom: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); background: color-mix(in srgb, var(--reverse) 5%, #050505); }
  .table-title h3 { margin: 0; }
  .table-title small { color: color-mix(in srgb, var(--reverse) 62%, transparent); }
  .table-wrap { width: 100%; min-width: 0; overflow-x: auto; }
  table { width: 100%; min-width: 760px; border-collapse: collapse; }
  th, td { padding: 12px 14px; border-bottom: 1px solid color-mix(in srgb, var(--reverse) 9%, transparent); text-align: left; vertical-align: middle; }
  th { color: color-mix(in srgb, var(--reverse) 62%, transparent); font-size: 12px; white-space: nowrap; }
  .project-row { cursor: pointer; transition: background .16s ease; }
  .project-row:hover, .project-row.open { background: color-mix(in srgb, var(--x_color, #d9a72a) 9%, transparent); }
  .project-row.highlight td:first-child { border-left: 3px solid var(--x_color, #d9a72a); }
  .status-pill { display: inline-flex; border-radius: 999px; background: color-mix(in srgb, var(--reverse) 9%, transparent); padding: 5px 9px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .detail-row > td { max-width: 0; padding: 0 !important; background: color-mix(in srgb, var(--reverse) 3%, transparent); white-space: normal !important; }
  .project-detail { width: 100%; min-width: 0; box-sizing: border-box; padding: 18px; overflow: hidden; }

  .create-panel {    grid-template-columns: minmax(0, 1fr);
    padding: clamp(16px, 3vw, 24px);
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    border-radius: 8px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 20rem),
      #050505;
    color: var(--reverse, #fff);
    color-scheme: dark;
  }

  .create-panel :is(input, select, textarea) {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 16%, transparent);
    background: color-mix(in srgb, var(--reverse, #fff) 7%, transparent);
    color: var(--reverse, #fff);
  }

  .create-panel label,
  .form-grid label {    min-width: min(190px, 100%);
  }

  label span,
  small {
    color: var(--x_text_color);
  }

  .wide {
    flex: 1 1 320px;
    grid-column: 1 / -1;
  }

  .summary {    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .summary div {
    padding: 10px;
    border-radius: 7px;
    background: #00000010;
  }

  .form-grid {    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  textarea {
    min-height: 78px;
  }

  .check {
    display: flex !important;
    align-items: center;
  }

</style>
