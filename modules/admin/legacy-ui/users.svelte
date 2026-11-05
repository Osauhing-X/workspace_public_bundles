<svelte:options runes={false} />
<script>
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { timeAgo } from '$lib/assets/scripts/helpers';
  import { openMailDraft } from './context.js';
  import { get } from 'svelte/store';
  import { admin_filter, openAdminTab } from './context.js';
  import { invoiceDue, formatInvoiceNumber } from '$lib/paths/invoice.js';
  import { isStaffUser } from './staff_utils.js';
  import Popover from '$lib/components/popover.svelte';
  import UserDetail from './user_detail.svelte';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  $: usersData = adminData.customer_users_data ?? { users: [], total: 0 };
  $: staffUsersData = adminData.users_data ?? { users: [], total: 0 };
  $: total = Number(usersData.total ?? usersData.users?.length ?? 0);
  $: staffTotal = Number(staffUsersData.total ?? staffUsersData.users?.length ?? 0);
  $: users = Array.isArray(usersData.users) ? usersData.users : [];
  $: staffUsers = Array.isArray(staffUsersData.users) ? staffUsersData.users : [];
  $: stripeCustomers = Array.isArray(adminData.stripe_data?.customers) ? adminData.stripe_data.customers : [];
  $: projects = Array.isArray(adminData.projekt_data) ? adminData.projekt_data : (adminData.projects_data || []);
  $: invoices = Array.isArray(adminData.arve_data) ? adminData.arve_data : [];
  let selectedUser = null;
  let selectedStripe = null;
  let selectedClientId = null;
  let stripeForm = { name: '', email: '', phone: '', address: '', description: '', tax_exempt: 'none', preferred_locales: '', metadata: '{}' };
  let stripeStatus = '';
  let search = get(admin_filter).email || '';
  let sortBy = 'created_at';
  let customerCreating = false;
  let customerCreateStatus = '';
  let customerDraft = { name: '', email: '', type: 'client', phone: '', address: '' };

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function stripeId(row = {}) {
    return row.id || row.customer || row.object?.id || row.object?.customer || row.metadata?.stripe_customer || '';
  }

  function authStripeIds(user = {}) {
    const metadata = { ...(user.app_metadata || {}), ...(user.user_metadata || {}) };
    return [metadata.stripe_customer, metadata.stripe_customer_id, metadata.customer, metadata.customer_id]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  function aliasesForStripe(customer = {}) {
    return [normalizeEmail(customer.email), stripeId(customer) ? `stripe:${stripeId(customer)}` : ''].filter(Boolean);
  }

  function aliasesForAuth(user = {}) {
    return [normalizeEmail(user.email), ...authStripeIds(user).map((id) => `stripe:${id}`)].filter(Boolean);
  }

  function existingRow(map, aliases = []) {
    return aliases.map((key) => map.get(key)).find(Boolean) || null;
  }

  function rememberRow(map, row, aliases = []) {
    for (const alias of aliases) map.set(alias, row);
  }

  function mergeCustomers(authUsers = [], stripeRows = []) {
    const map = new Map();
    const rows = new Set();

    for (const customer of Array.isArray(stripeRows) ? stripeRows : []) {
      const aliases = aliasesForStripe(customer);
      const key = aliases[0] || `stripe:${customer.id || rows.size}`;
      const row = existingRow(map, aliases) ?? {
        id: key,
        email: normalizeEmail(customer.email),
        name: customer.name || customer.object?.name || customer.email || customer.id,
        auth: null,
        stripe: null,
        created_at: customer.created_at,
        last_sign_in_at: null
      };
      row.stripe = customer;
      row.email ||= normalizeEmail(customer.email);
      row.name ||= customer.name || customer.object?.name || customer.email || customer.id;
      row.created_at ||= customer.created_at;
      rows.add(row);
      rememberRow(map, row, aliases.length ? aliases : [key]);
    }

    for (const user of Array.isArray(authUsers) ? authUsers : []) {
      const aliases = aliasesForAuth(user);
      const key = aliases[0] || `auth:${user.id || rows.size}`;
      const row = existingRow(map, aliases) ?? {
        id: key,
        email: normalizeEmail(user.email),
        name: user.user_metadata?.full_name || user.email || user.id,
        auth: null,
        stripe: null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at
      };
      row.auth = user;
      row.email ||= normalizeEmail(user.email);
      row.name = row.name || user.user_metadata?.full_name || user.email || user.id;
      row.created_at = user.created_at || row.created_at;
      row.last_sign_in_at = user.last_sign_in_at;
      rows.add(row);
      rememberRow(map, row, aliases.length ? aliases : [key]);
    }

    return [...rows];
  }

  function sourceLabel(row) {
    if (row.auth && row.stripe) return 'Workspace + Stripe';
    if (row.stripe) return 'Stripe';
    return 'Workspace';
  }

  $: merged = mergeCustomers(users, stripeCustomers);
  $: filtered = merged
    .filter(row => {
      const s = search.toLowerCase();
      return String(row.email || '').toLowerCase().includes(s) ||
        String(row.auth?.id || '').toLowerCase().includes(s) ||
        String(row.stripe?.id || '').toLowerCase().includes(s) ||
        String(row.name || '').toLowerCase().includes(s);
    })
    .sort((a, b) => new Date(b[sortBy] || 0) - new Date(a[sortBy] || 0));

  $: clients = filtered.filter(row => !row.auth || !isStaffUser(row.auth));
  $: staffFiltered = staffUsers
    .filter(user => {
      const s = search.toLowerCase();
      const permissions = (Array.isArray(user.app_metadata?.oux) ? user.app_metadata.oux : []).join(' ');
      return normalizeEmail(user.email).includes(s) ||
        String(user.id || '').toLowerCase().includes(s) ||
        String(user.user_metadata?.full_name || '').toLowerCase().includes(s) ||
        permissions.includes(s);
    })
    .sort((a, b) => new Date(b[sortBy] || 0) - new Date(a[sortBy] || 0));

  function accessEmails(project = {}) {
    return (Array.isArray(project.access) ? project.access : [])
      .map(entry => normalizeEmail(typeof entry === 'string' ? entry : entry.email))
      .filter(Boolean);
  }

  function related(row) {
    const email = row.email || row.auth?.email || row.stripe?.email;
    const relatedProjects = projects.filter(project =>
      normalizeEmail(project.email) === email ||
      normalizeEmail(project.client) === email ||
      accessEmails(project).includes(email)
    );
    const relatedInvoices = invoices.filter(invoice =>
      normalizeEmail(invoice.email) === email ||
      (Array.isArray(invoice.view) ? invoice.view.map(normalizeEmail).includes(email) : false) ||
      relatedProjects.some(project => project.id === invoice.projekt_id || project.id === invoice.project_id || project.id === invoice.teenus)
    );
    const openInvoices = relatedInvoices.filter(invoice =>
      invoice.active && invoice.public_id && invoiceDue(invoice) > 0
    );

    return { relatedProjects, relatedInvoices, openInvoices };
  }

  function contactUser(row, data) {
    openMailDraft({
      to: row.email,
      subject: 'Extaas - teavitus',
      text: `Tere!\n\nKirjutan teile Extaas konto, projekti või arve kohta.\n\nSeotud projektid: ${data.relatedProjects.map(project => project.title).join(', ') || 'puuduvad'}\nAvatud arved: ${data.openInvoices.map(invoice => formatInvoiceNumber(invoice)).join(', ') || 'puuduvad'}\n\nParimat\nExtaas`,
        source: { type: row.auth ? 'user' : 'stripe_customer', id: row.auth?.id || row.stripe?.id }
    });
  }

  function staffLabel(user = {}) {
    const permissions = Array.isArray(user.app_metadata?.oux) ? user.app_metadata.oux : [];
    return permissions.length ? `oux: ${permissions.join(', ')}` : 'oux: []';
  }

  function selectClient(row) {
    if (selectedClientId === row.id) {
      selectedClientId = null;
      selectedUser = null;
      selectedStripe = null;
      return;
    }
    selectedClientId = row.id;
    selectedUser = row.auth || null;
    selectedStripe = row.stripe || null;
    stripeStatus = '';
    stripeForm = {
      name: row.stripe?.name || row.stripe?.object?.name || row.name || '',
      email: row.stripe?.email || row.email || '',
      phone: row.stripe?.phone || row.stripe?.object?.phone || '',
      address: row.stripe?.address?.line1 || row.stripe?.object?.address?.line1 || '',
      description: row.stripe?.description || row.stripe?.object?.description || '',
      tax_exempt: row.stripe?.tax_exempt || row.stripe?.object?.tax_exempt || 'none',
      preferred_locales: (row.stripe?.preferred_locales || row.stripe?.object?.preferred_locales || []).join(', '),
      metadata: JSON.stringify(row.stripe?.metadata || row.stripe?.object?.metadata || {}, null, 2)
    };
  }

  async function saveStripeCustomer() {
    if (!selectedStripe?.id) return;
    let customer_metadata = {};
    try {
      customer_metadata = stripeForm.metadata.trim() ? JSON.parse(stripeForm.metadata) : {};
    } catch {
      stripeStatus = 'Stripe metadata JSON vigane';
      return;
    }
    stripeStatus = 'Saving...';
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_customer',
        customer: selectedStripe.id,
        name: stripeForm.name,
        email: stripeForm.email,
        phone: stripeForm.phone,
        address: stripeForm.address,
        description: stripeForm.description,
        tax_exempt: stripeForm.tax_exempt,
        preferred_locales: stripeForm.preferred_locales,
        customer_metadata
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      stripeStatus = body.error || 'Stripe save failed';
      return;
    }
    selectedStripe = body.customer || selectedStripe;
    stripeStatus = 'Saved';
    await invalidateAll();
  }

  async function createStripeCustomer() {
    const email = normalizeEmail(customerDraft.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      customerCreateStatus = 'Sisesta korrektne e-post.';
      return;
    }
    customerCreating = true;
    customerCreateStatus = 'Loon Stripe customer’it...';
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_customer', ...customerDraft, email })
    });
    const body = await response.json().catch(() => ({}));
    customerCreating = false;
    if (!response.ok || !body.customer) {
      customerCreateStatus = body.error || 'Stripe customer’i loomine ebaõnnestus.';
      return;
    }
    stripeCustomers = [body.customer, ...stripeCustomers];
    selectedUser = null;
    selectedStripe = body.customer;
    stripeForm = {
      name: body.customer.name || '', email: body.customer.email || email, phone: body.customer.phone || '',
      address: body.customer.address?.line1 || '', description: '',
      tax_exempt: body.customer.tax_exempt || 'none', preferred_locales: '',
      metadata: JSON.stringify(body.customer.metadata || {}, null, 2)
    };
    customerDraft = { name: '', email: '', type: 'client', phone: '', address: '' };
    customerCreateStatus = 'Stripe customer loodud.';
    await invalidateAll();
    document.getElementById('stripe_customer_create')?.hidePopover?.();
  }
</script>

<section class="users-page grid gap _5">
  <header class="users-header flex gap _2 _space _wrap">
    <div>
      <h2>Kasutajad</h2>
      <small>Workspace auth, Stripe billing and extaas.com staff auth in one place.</small>
      <small>Kliendid ja nende seotud projektid/arved. Staff on eraldi Töötajad vaates.</small>
    </div>
    <div class="filters gap _2 flex">
      <input placeholder="Otsi email / ID..." bind:value={search}>
      <select bind:value={sortBy}>
        <option value="created_at">Created</option>
        <option value="last_sign_in_at">Last sign in</option>
      </select>
      <button class="btn _color" type="button" popovertarget="stripe_customer_create">Lisa Stripe customer</button>
    </div>
  </header>

  <Popover id="stripe_customer_create" width={620} showLanguage={false}>
    <section class="customer-create-panel grid gap _3">
      <header><small>Stripe</small><h3>Uus customer</h3><p>Lisa klient aktiivse maksekeskkonna Stripe customer listi.</p></header>
      <div class="customer-create-grid grid gap _2">
        <label class="grid gap"><span>Nimi</span><input bind:value={customerDraft.name} placeholder="Kliendi või ettevõtte nimi"></label>
        <label class="grid gap"><span>E-post</span><input type="email" bind:value={customerDraft.email} placeholder="billing@example.com" required></label>
        <label class="grid gap"><span>Tüüp</span><select bind:value={customerDraft.type}><option value="client">Klient</option><option value="company">Ettevõte</option></select></label>
        {#if customerDraft.type === 'company'}
          <label class="grid gap"><span>Telefon <small>(valikuline)</small></span><input type="tel" bind:value={customerDraft.phone} placeholder="+372 ..."></label>
          <label class="grid gap"><span>Aadress <small>(valikuline)</small></span><input bind:value={customerDraft.address} placeholder="Tänav, linn, postiindeks"></label>
        {/if}
      </div>
      {#if customerCreateStatus}<small>{customerCreateStatus}</small>{/if}
      <footer class="flex gap _2 _end"><button type="button" on:click={createStripeCustomer} disabled={customerCreating}>{customerCreating ? 'Loon...' : 'Lisa Stripe customer'}</button></footer>
    </section>
  </Popover>

  <section class="admin-table-panel user-table-section">
    <header class="table-title"><div><h3>Kliendid</h3><small>{clients.length}/{merged.length} · Workspace {total} · Stripe {stripeCustomers.length}</small></div></header>
    <div overflow class="table-wrap"><table>
      <thead>
        <tr>
          <th>Klient</th>
          <th>Email</th>
          <th>Allikas</th>
          <th>Stripe</th>
          <th>Auth</th>
          <th>Projektid</th>
          <th>Avatud arved</th>
          <th>Märgid</th>
          <th>Last sign in</th>
          <th>Created</th>
          <th>Tegevused</th>
          <th>Seosed</th>
        </tr>
      </thead>
      <tbody>
        {#each clients as user}
          {@const data = related(user)}
          <tr class:active={selectedClientId === user.id} on:click={() => selectClient(user)}>
            <td>{user.name || user.email}</td>
            <td>{user.email || '-'}</td>
            <td><span class="badge source" class:partial={!user.auth || !user.stripe} title={user.auth && user.stripe ? 'Workspace auth + Stripe customer' : user.stripe ? 'Stripe customer' : 'Workspace auth konto'}>{sourceLabel(user)}</span></td>
            <td>{user.stripe?.id || '-'}</td>
            <td>{user.auth?.id || '-'}</td>
            <td>{data.relatedProjects.length}</td>
            <td title={data.openInvoices.map(invoice => formatInvoiceNumber(invoice)).join(', ')}>{data.openInvoices.length}</td>
            <td>
              <div class="badges gap flex">
                {#if user.auth?.user_metadata?.highlight}<span class="badge highlight">highlight</span>{/if}
                {#if user.auth?.user_metadata?.ban}<span class="badge ban">ban</span>{/if}
              </div>
            </td>
            <td>{user.auth ? timeAgo(user.auth.last_sign_in_at) : '-'}</td>
            <td>{timeAgo(user.auth?.created_at || user.stripe?.created_at)}</td>
            <td><button type="button" on:click|stopPropagation={() => contactUser(user, data)}>Contact</button></td>
            <td><button type="button" on:click|stopPropagation={() => openAdminTab('arve', { email: user.email })}>Arved</button></td>
          </tr>
          {#if selectedClientId === user.id}
            <tr class="user-detail-row"><td colspan="12"><UserDetail {selectedUser} {selectedStripe} {stripeForm} {stripeStatus} {saveStripeCustomer} close={() => { selectedClientId = null; selectedUser = null; selectedStripe = null; }} /></td></tr>
          {/if}
        {/each}
      </tbody>
    </table></div>
  </section>

  <section class="admin-table-panel user-table-section">
    <header class="table-title"><div><h3>Töötajad</h3><small>{staffFiltered.length}/{staffTotal} · Staff</small></div></header>
    <div overflow class="table-wrap"><table>
      <thead>
        <tr>
          <th>Töötaja</th>
          <th>Email</th>
          <th>Auth ID</th>
          <th>Õigus</th>
          <th>Provider</th>
          <th>Last sign in</th>
          <th>Created</th>
          <th>Tegevused</th>
        </tr>
      </thead>
      <tbody>
        {#each staffFiltered as user}
          <tr class:active={selectedUser?.id === user.id && !selectedClientId} on:click={() => { selectedClientId = null; selectedStripe = null; selectedUser = selectedUser?.id === user.id ? null : user; }}>
            <td>{user.user_metadata?.full_name || user.email || user.id}</td>
            <td>{user.email || '-'}</td>
            <td>{user.id}</td>
            <td>
              <span class="badge source" class:partial={!isStaffUser(user)} title={isStaffUser(user) ? 'Staff access active' : 'Auth konto on olemas, aga extaas staff level puudub'}>
                {staffLabel(user)}
              </span>
            </td>
            <td>{user.app_metadata?.provider || user.identities?.[0]?.provider || '-'}</td>
            <td>{timeAgo(user.last_sign_in_at)}</td>
            <td>{timeAgo(user.created_at)}</td>
            <td>
              <button type="button" on:click|stopPropagation={() => contactUser({ email: user.email, auth: user }, { relatedProjects: [], openInvoices: [] })}>
                Contact
              </button>
            </td>
          </tr>
          {#if selectedUser?.id === user.id && !selectedStripe}
            <tr class="user-detail-row"><td colspan="8"><UserDetail {selectedUser} {selectedStripe} {stripeForm} {stripeStatus} {saveStripeCustomer} close={() => { selectedUser = null; }} /></td></tr>
          {/if}
        {:else}
          <tr><td colspan="8">Extaas auth töötajaid ei leitud või service role ei saa auth listi lugeda.</td></tr>
        {/each}
      </tbody>
    </table></div>
  </section>

</section>

<style>
  .customer-create-panel{padding:20px;border:1px solid #222;border-radius:8px;background:#050505;color:#fff}.customer-create-panel h3,.customer-create-panel p{margin:0}.customer-create-panel p,.customer-create-panel small{color:#aaa}.customer-create-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.customer-create-grid label:last-child{grid-column:1/-1}.customer-create-grid :is(input,select){width:100%;box-sizing:border-box}@media(max-width:640px){.customer-create-grid{grid-template-columns:1fr}.customer-create-grid label:last-child{grid-column:auto}}
  .user-table-section{overflow:hidden}.table-title{border-bottom:1px solid #222;background:#111;padding:16px 18px}.table-title h3{margin:0}.table-title small{color:#999}.user-table-section>.table-wrap{border:0!important;border-radius:0}
  .user-detail-row>td{padding:0!important;white-space:normal!important;background:#080808!important}
  .users-page {
    width: min(1200px, 100%);
    margin: 0 auto;
    text-align: left;
  }

  .users-header,
  .metadata-panel header {    align-items: end;
  }

  .metadata-panel header {
    align-items: start;
    margin-bottom: 10px;
  }

  .users-header h2,
  .metadata-panel h3 {
    margin: 0;
  }

  .users-header small + small {
    display: none;
  }

  .filters {    flex-wrap: wrap;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr.active {
    background: color-mix(in srgb, var(--x_color) 22%, transparent);
  }

  .badges {    flex-wrap: wrap;
  }

  .badge {
    padding: 3px 6px;
    border-radius: 999px;
    font-size: 12px;
    background: #00000018;
  }

  .badge.highlight {
    background: #f1c40f33;
  }

  .badge.ban {
    background: #c0392b33;
    color: #c0392b;
  }

  .badge.source {
    background: color-mix(in srgb, var(--x_color, #da3) 18%, transparent);
    color: var(--x_color, #da3);
  }

  .badge.source.partial {
    background: #ffffff18;
    color: color-mix(in srgb, var(--reverse, #fff) 72%, transparent);
  }

  .metadata-panel {    padding: 14px;
    border-radius: 8px;
    background: var(--x_color_transparent_auto);
    border: 1px solid #00000022;
  }

  .field-grid {    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .json-box {
    min-height: 150px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
  }
</style>
