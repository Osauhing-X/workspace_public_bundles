<svelte:options runes={false} />
<script>
  import { page } from '$app/stores';
  import { isStaffUser, staffOs } from './staff_utils.js';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  const asArray = (value) => Array.isArray(value) ? value : [];

  let users = [];
  let tableInventory = [];
  let permissions = {};
  let status = '';
  let draft = {
    name: '',
    serial: '',
    status: 'storage',
    location: 'Ladu',
    note: '',
    details: ''
  };

  $: users = asArray(adminData.users_data?.users);
  $: tableInventory = asArray(adminData.inventory_data);
  $: permissions = adminData.staff_permissions || {};
  $: staffUsers = users.filter(isStaffUser);
  $: currentUser = staffUsers.find((user) => user.id === permissions.current_user_id) || staffUsers[0];
  $: currentOs = staffOs(currentUser);
  $: general = currentOs.general || {};
  $: metadataInventory = Array.isArray(general.inventory) ? general.inventory : [];
  $: warehouse = tableInventory.length || adminData.inventory_data ? tableInventory : metadataInventory;
  $: assignedRows = staffUsers.flatMap((user) =>
    staffOs(user).inventory.map((item) => ({ ...item, user }))
  );

  function serialOf(item = {}) {
    return item.serial || item.sku || item.metadata?.serial || '';
  }

  function noteOf(item = {}) {
    return item.note || item.metadata?.note || '';
  }

  function detailsOf(item = {}) {
    return item.details || item.metadata?.details || '';
  }

  async function inventoryRequest(method, body) {
    status = 'Saving...';
    const res = await fetch('/@_api/admin/inventory', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      status = data.error || 'Save failed';
      return null;
    }
    status = 'Saved';
    return data;
  }

  async function saveWarehouse(nextInventory) {
    if (!currentUser) return;

    const user_metadata = {
      ...(currentUser.user_metadata || {}),
      staff_os: {
        ...currentOs,
        general: {
          ...general,
          inventory: nextInventory
        }
      }
    };

    status = 'Saving...';
    const res = await fetch('/@_supabase/our_domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'supabase',
        action: 'meta',
        data: { user: currentUser.id, user_metadata }
      })
    });

    if (res.ok) {
      currentUser.user_metadata = user_metadata;
      users = [...users];
      status = 'Saved';
    } else {
      status = 'Save failed';
    }
  }

  function addItem() {
    if (!draft.name.trim()) return;
    if (tableInventory.length || adminData.inventory_data) {
      inventoryRequest('POST', draft).then((row) => {
        if (!row) return;
        tableInventory = [row, ...tableInventory];
      });
    } else {
      saveWarehouse([
        {
          id: crypto.randomUUID(),
          ...draft,
          created_at: new Date().toISOString()
        },
        ...warehouse
      ]);
    }
    draft = { name: '', serial: '', status: 'storage', location: 'Ladu', note: '', details: '' };
  }

  function removeItem(id) {
    if (!confirm('Eemalda ese laost')) return;
    if (tableInventory.length || adminData.inventory_data) {
      inventoryRequest('DELETE', { id }).then((row) => {
        if (!row) return;
        tableInventory = tableInventory.filter((item) => item.id !== id);
      });
    } else {
      saveWarehouse(warehouse.filter((item) => item.id !== id));
    }
  }
</script>

<section class="inventory-page grid gap _3">
  <header class="page-head gap _2 flex">
    <div class="grid gap _2">
      <h2>Ladu / inventuur</h2>
      <small>Üldladu ja töötajate käes olev vara ühes kompaktses vaates.</small>
    </div>
    {#if status}<small class="status">{status}</small>{/if}
  </header>

  <section class="panel">
    <h3>Lisa ladusse</h3>
    <div class="form-grid gap _2 grid">
      <input placeholder="Ese" bind:value={draft.name}>
      <input placeholder="Seeria / ID" bind:value={draft.serial}>
      <select bind:value={draft.status}>
        <option value="storage">Laos</option>
        <option value="reserved">Reserveeritud</option>
        <option value="repair">Remondis</option>
        <option value="retired">Mahakantud</option>
      </select>
      <input placeholder="Asukoht" bind:value={draft.location}>
      <input placeholder="Lühimärkus" bind:value={draft.note}>
      <textarea placeholder="Lisateave, ostuinfo, garantii, komplekt..." bind:value={draft.details}></textarea>
      <button type="button" on:click={addItem}>Lisa ese</button>
    </div>
  </section>

  <section class="inventory-columns gap _2 grid">
    <article class="panel">
      <div class="section-head gap _2 flex">
        <div class="grid gap _2">
          <h3>Üldladu</h3>
          <small>{warehouse.length} eset</small>
        </div>
      </div>
      <div class="item-list gap _2 grid">
        {#each warehouse as item}
          <section class="item-card gap _2 grid">
            <div class="grid gap _2">
              <h4>{item.name}</h4>
              <small>{serialOf(item) || 'ID puudub'} · {item.location || 'Ladu'}</small>
            </div>
            <dl class="grid gap">
              <div class="grid gap _2"><dt>Staatus</dt><dd>{item.status}</dd></div>
              <div class="grid gap _2"><dt>Märkus</dt><dd>{noteOf(item) || '-'}</dd></div>
              <div class="grid gap _2"><dt>Lisainfo</dt><dd>{detailsOf(item) || '-'}</dd></div>
            </dl>
            <button type="button" on:click={() => removeItem(item.id)}>Eemalda</button>
          </section>
        {/each}
      </div>
    </article>

    <article class="panel">
      <div class="section-head gap _2 flex">
        <div class="grid gap _2">
          <h3>Töötajate käes</h3>
          <small>{assignedRows.length} eset</small>
        </div>
      </div>
      <div class="item-list gap _2 grid">
        {#each assignedRows as item}
          <section class="item-card gap _2 grid">
            <div class="grid gap _2">
              <h4>{item.name}</h4>
              <small>{item.serial || 'ID puudub'} · {item.user.email}</small>
            </div>
            <dl class="grid gap">
              <div class="grid gap _2"><dt>Staatus</dt><dd>{item.status}</dd></div>
              <div class="grid gap _2"><dt>Märkus</dt><dd>{item.note || '-'}</dd></div>
            </dl>
          </section>
        {/each}
      </div>
    </article>
  </section>
</section>

<style>
  .inventory-page {
    width: min(1200px, 100%);
    margin: 0 auto;    text-align: left;
  }

  h2,
  h3,
  h4 {
    margin: 0;
  }

  .page-head,
  .section-head {    justify-content: space-between;
    align-items: start;
    flex-wrap: wrap;
  }

  .status {
    padding: 5px 8px;
    border-radius: 999px;
    background: #00000018;
  }

  .panel,
  .item-card {
    padding: 14px;
    border-radius: 8px;
    background: var(--x_color_transparent_auto);
    border: 1px solid #00000022;
  }

  .form-grid {    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    margin-top: 12px;
  }

  textarea {
    min-height: 74px;
    grid-column: 1 / -1;
  }

  .inventory-columns {    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }

  .item-list {    margin-top: 12px;
  }

  .item-card {    background: #00000012;
  }

  dl {    margin: 0;
  }

  dl div {    grid-template-columns: 92px 1fr;  }

  dd {
    margin: 0;
    font-weight: 700;
  }
</style>
