<svelte:options runes={false} />
<script>
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { admin_filter, openAdminTab } from './context.js';
  import Popover from '$lib/components/popover.svelte';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  let companies = [];
  let projects = [];
  let invoices = [];
  let users = [];
  let search = get(admin_filter).email || '';
  let saving = false;
  let selected = get(admin_filter).ettevote || null;
  let edits = {};
  let draft = blankCompany();

  $: companies = adminData.ettevote_data || [];
  $: projects = adminData.projekt_data || [];
  $: invoices = adminData.arve_data || [];
  $: users = adminData.customer_users_data?.users || [];
  $: rows = companies
    .filter(company => {
      const q = search.toLowerCase();
      return !q ||
        String(company.name || '').toLowerCase().includes(q) ||
        String(company.primary_email || '').toLowerCase().includes(q) ||
        String(company.registry_code || '').toLowerCase().includes(q) ||
        String(company.vat_number || '').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.highlight === true) - (a.highlight === true) || (a.name || '').localeCompare(b.name || ''));

  function blankCompany() {
    return {
      name: '',
      primary_email: '',
      phone: '',
      registry_code: '',
      vat_number: '',
      address: { line: '', city: '', country: '' },
      contact: { name: '', email: '', phone: '' },
      access: [],
      note: '',
      highlight: false
    };
  }

  function related(company) {
    return {
      users: users.filter(user => user.email === company.primary_email),
      projects: projects.filter(project => project.ettevote_id === company.id || project.email === company.primary_email),
      invoices: invoices.filter(invoice => invoice.ettevote_id === company.id || invoice.email === company.primary_email || (Array.isArray(invoice.view) && invoice.view.includes(company.primary_email)))
    };
  }

  function hydrate(company) {
    return {
      ...blankCompany(),
      ...company,
      address: { ...blankCompany().address, ...(company.address || {}) },
      contact: { ...blankCompany().contact, ...(company.contact || {}) },
      access: Array.isArray(company.access)
        ? company.access
        : Array.isArray(company.contact?.access)
          ? company.contact.access
          : []
    };
  }

  function editCompany(company) {
    if (!edits[company.id]) edits[company.id] = hydrate(company);
    return edits[company.id];
  }

  function accessList(company) {
    if (!Array.isArray(company.access)) company.access = [];
    return company.access;
  }

  function addAccess(company) {
    accessList(company).push({ email: '', projects: true, services: false, invoices: false });
    edits = { ...edits };
  }

  function removeAccess(company, index) {
    company.access.splice(index, 1);
    company.access = [...company.access];
    edits = { ...edits };
  }

  async function createCompany() {
    if (!draft.name.trim()) return alert('Lisa ettevõtte nimi.');
    saving = true;
    const response = await fetch('/@_api/admin/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    saving = false;
    const body = await response.json();
    if (!response.ok) return alert(body.error || 'Ettevõtte loomine ebaõnnestus.');
    companies = [body, ...companies];
    draft = blankCompany();
    selected = body.id;
    document.getElementById('company_create')?.hidePopover?.();
  }

  async function saveCompany(company) {
    saving = true;
    const response = await fetch('/@_api/admin/company', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company)
    });
    saving = false;
    const body = await response.json();
    if (!response.ok) return alert(body.error || 'Ettevõtte salvestamine ebaõnnestus.');
    companies = companies.map(item => item.id === body.id ? body : item);
    edits[body.id] = hydrate(body);
  }

  async function deleteCompany(company) {
    if (!confirm(`Kustuta ettevõte "${company.name}" Seotud projektid ja arved jäävad alles, kuid seos eemaldatakse.`)) return;
    const response = await fetch('/@_api/admin/company', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: company.id })
    });
    if (!response.ok) return alert((await response.json()).error || 'Ettevõtte kustutamine ebaõnnestus.');
    companies = companies.filter(item => item.id !== company.id);
    if (selected === company.id) selected = null;
  }
</script>

<section class="companies-page grid gap _3">
  <header class="page-head flex gap _2 _space _center _y _wrap">
    <div>
      <h2>Ettevõte</h2>
      <small>Manuaalsed ettevõtted ja eraldi kliendikaardid, mille külge projektid ning arved seotakse.</small>
    </div>
    <div class="filters flex gap _2">
      <input placeholder="Otsi nime, emaili, KMKR või registrikoodi järgi..." bind:value={search}>
      <button class="btn _color" type="button" popovertarget="company_create">Lisa ettevõte</button>
    </div>
  </header>

  <Popover id="company_create" width={760} showLanguage={false}>
  <div class="create-panel gap _2 grid">
    <header class="flex gap _2 _space _center _y _wrap">
      <div>
        <small>uus kaart</small>
        <h3>Lisa ettevõte</h3>
      </div>
      <button class="btn _transparent" type="button" popovertarget="company_create" popovertargetaction="hide">Tühista</button>
    </header>
    <label class="grid gap"><span>Nimi</span><input placeholder="Ettevõtte või kliendi nimi" bind:value={draft.name}></label>
    <label class="grid gap"><span>Email</span><input type="email" placeholder="Peamine email" bind:value={draft.primary_email}></label>
    <label class="grid gap"><span>Telefon</span><input placeholder="Telefon" bind:value={draft.phone}></label>
    <label class="grid gap"><span>Registrikood</span><input placeholder="Registrikood" bind:value={draft.registry_code}></label>
    <label class="grid gap"><span>KMKR</span><input placeholder="VAT / KMKR" bind:value={draft.vat_number}></label>
    <label class="wide grid gap"><span>Märkus</span><input placeholder="Sisene märkus" bind:value={draft.note}></label>
    <label class="check grid gap"><input type="checkbox" bind:checked={draft.highlight}> <span>Oluline</span></label>
    <button type="button" on:click={createCompany} disabled={saving}>{saving ? 'Salvestan...' : 'Lisa ettevõte'}</button>
  </div>
  </Popover>

  <section class="company-list gap _2 grid">
    {#each rows as company}
      {@const data = related(company)}
      {@const editable = editCompany(company)}
      <details class:highlight={company.highlight} open={selected === company.id} class="grid gap _2" on:toggle={(event) => selected = event.currentTarget.open ? company.id : (selected === company.id ? null : selected)}>
        <summary class="company-row gap _2 flex">
          <span>
            <strong>{company.name}</strong>
            <small>{company.primary_email || 'email puudub'}</small>
          </span>
          <span class="metrics grid">
            <b>{data.projects.length}</b><small>projektid</small>
            <b>{data.invoices.length}</b><small>arved</small>
            <b>{data.users.length}</b><small>kasutajad</small>
          </span>
        </summary>

        <section class="company-detail gap _2 grid">
          <div class="actions flex gap _2">
            <button type="button" on:click={() => openAdminTab('kasutajad', { email: company.primary_email })}>Kasutajad</button>
            <button type="button" on:click={() => openAdminTab('projekt', { email: company.primary_email, ettevote: company.id })}>Projektid</button>
            <button type="button" on:click={() => openAdminTab('arve', { email: company.primary_email, ettevote: company.id })}>Arved</button>
          </div>

          <div class="form-grid gap _2 grid">
            <label class="grid gap"><span>Nimi</span><input bind:value={editable.name}></label>
            <label class="grid gap"><span>Email</span><input type="email" bind:value={editable.primary_email}></label>
            <label class="grid gap"><span>Telefon</span><input bind:value={editable.phone}></label>
            <label class="grid gap"><span>Registrikood</span><input bind:value={editable.registry_code}></label>
            <label class="grid gap"><span>KMKR</span><input bind:value={editable.vat_number}></label>
            <label class="grid gap"><span>Kontaktisik</span><input bind:value={editable.contact.name}></label>
            <label class="grid gap"><span>Kontakt telefon</span><input bind:value={editable.contact.phone}></label>
            <label class="wide grid gap"><span>Aadress</span><input bind:value={editable.address.line} placeholder="Tänav, maja, ruum"></label>
            <label class="grid gap"><span>Linn</span><input bind:value={editable.address.city}></label>
            <label class="grid gap"><span>Riik</span><input bind:value={editable.address.country}></label>
            <label class="wide grid gap"><span>Märkus</span><textarea bind:value={editable.note}></textarea></label>
            <label class="check grid gap"><input type="checkbox" bind:checked={editable.highlight}> <span>Oluline kaart</span></label>
          </div>

          <section class="access-panel gap _2 grid">
            <header class="flex gap _2 _space _center _y _wrap">
              <div>
                <h3>Allow list</h3>
                <small>Anna ligipääs selle ettevõtte projektidele, teenustele või arvetele.</small>
              </div>
              <button type="button" on:click={() => addAccess(editable)}>Lisa isik</button>
            </header>
            <div class="access-list gap _2 grid">
              {#each accessList(editable) as access, index}
                <article class="flex gap _2 _space _center _y _wrap">
                  <label class="grid gap"><span>Email</span><input type="email" bind:value={access.email} placeholder="isik@email.ee"></label>
                  <label class="check grid gap"><input type="checkbox" bind:checked={access.projects}> <span>Projektid</span></label>
                  <label class="check grid gap"><input type="checkbox" bind:checked={access.services}> <span>Teenused</span></label>
                  <label class="check grid gap"><input type="checkbox" bind:checked={access.invoices}> <span>Arved</span></label>
                  <button type="button" class="danger" on:click={() => removeAccess(editable, index)}>Eemalda</button>
                </article>
              {:else}
                <small>Allow list on tühi.</small>
              {/each}
            </div>
          </section>

          <footer class="flex gap _2">
            <button type="button" on:click={() => saveCompany(editable)} disabled={saving}>Salvesta</button>
            <button type="button" class="danger" on:click={() => deleteCompany(company)}>Kustuta</button>
          </footer>
        </section>
      </details>
    {/each}
  </section>
</section>

<style>
  .companies-page {
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

  details,
  .company-detail {
    padding: 14px;
    border: 1px solid #00000022;
    border-radius: 8px;
    background: var(--x_color_transparent_auto);
  }

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

  .create-panel :is(input, textarea) {
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
  }

  .check {
    min-width: auto;
    display: flex !important;
    align-items: center;
  }

  details.highlight {
    border-color: #d7a90099;
    box-shadow: inset 3px 0 0 #d7a900;
  }

  .company-row {
    width: 100%;    align-items: center;
    justify-content: space-between;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    list-style: none;
  }

  .company-row::-webkit-details-marker {
    display: none;
  }

  .company-row strong,
  .company-row small {
    display: block;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 2px 8px;
    text-align: right;
  }

  .metrics b {
    font-size: 18px;
  }

  .company-detail {    background: #00000008;
  }

  .form-grid {    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  .access-list article {
    padding: 10px;
    border: 1px solid #00000018;
    border-radius: 7px;
    background: #00000008;
  }

  textarea {
    min-height: 78px;
  }

  .danger {
    color: #c0392b;
    border-color: #c0392b55;
  }

  @media (max-width: 700px) {
    .company-row,
    .metrics {      text-align: left;
    }
  }
</style>
