<script>
  let {
    i18n,
    contacts = [],
    loading = false,
    saving = false,
    error = null,
    message = null,
    publicEnabled = false,
    contactName,
    onAddContact,
    onUpdateContact,
    onRemoveContact,
    onSavePublicSetting
  } = $props();

  let search = $state('');
  let form = $state({ first_name: '', last_name: '', email: '' });
  let edit = $state(null);
  let landingEnabled = $state(false);

  $effect(() => {
    landingEnabled = publicEnabled;
  });

  function getFiltered() {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;

    return contacts.filter((contact) =>
      [contactName(contact), contact.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  async function submitContact() {
    const added = await onAddContact({ ...form });
    if (added) {
      form = { first_name: '', last_name: '', email: '' };
    }
  }

  async function saveVisibility() {
    await onSavePublicSetting(landingEnabled);
  }

  function contactParts(contact) {
    return {
      id: contact.id,
      email: contact.email,
      first_name: contact.first_name ?? contact.firstName ?? '',
      last_name: contact.last_name ?? contact.lastName ?? '',
      unsubscribed: contact.unsubscribed === true
    };
  }

  function openEdit(contact) {
    edit = contactParts(contact);
  }

  async function saveEdit() {
    const saved = await onUpdateContact?.(edit);
    if (saved) edit = null;
  }
</script>

<main class="grid gap _3">
  <section class="intro gap _3 flex">
    <div>
      <span>{i18n.title}</span>
      <h1>{i18n.subscribers}</h1>
      <p>{i18n.description}</p>
    </div>
    <strong>{contacts.length}</strong>
  </section>

  {#if error}
    <p class="alert error">{error}</p>
  {/if}

  {#if message}
    <p class="alert success">{message}</p>
  {/if}

  <section class="box _outer">
    <div class="setting-row gap _3 flex">
      <div>
        <h2>{i18n.landingVisibility}</h2>
        <p>Show the subscribe box on the public landing page.</p>
      </div>
      <label class="switch gap _2 flex">
        <input type="checkbox" bind:checked={landingEnabled} onchange={saveVisibility}>
        Show subscribe
      </label>
    </div>
  </section>

  <section class="box _outer">
    <form class="grid gap _2" onsubmit={(event) => { event.preventDefault(); submitContact(); }}>
      <label class="grid gap">
        First name
        <input autocomplete="given-name" bind:value={form.first_name} placeholder="Maria">
      </label>

      <label class="grid gap">
        Last name
        <input autocomplete="family-name" bind:value={form.last_name} placeholder="Tamm">
      </label>

      <label class="grid gap">
        Email
        <input type="email" autocomplete="email" required bind:value={form.email} placeholder="maria@example.com">
      </label>

      <button type="submit" class="button _primary" disabled={saving}>
        {saving ? 'Saving...' : 'Add contact'}
      </button>
    </form>
  </section>

  {#if edit}
    <section class="box _outer edit-panel grid gap _3">
      <header class="flex _space _center _y _wrap gap">
        <div>
          <span>Edit contact</span>
          <h2>{edit.email}</h2>
        </div>
        <button class="button _secondary" onclick={() => edit = null}>Cancel</button>
      </header>

      <div class="edit-grid grid gap _2">
        <label class="grid gap">
          First name
          <input autocomplete="given-name" bind:value={edit.first_name}>
        </label>
        <label class="grid gap">
          Last name
          <input autocomplete="family-name" bind:value={edit.last_name}>
        </label>
        <label class="switch gap _2 flex">
          <input type="checkbox" bind:checked={edit.unsubscribed}>
          Unsubscribed
        </label>
      </div>

      <footer class="flex _right gap">
        <button class="button _primary" onclick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save contact'}</button>
      </footer>
    </section>
  {/if}

  <section class="box _outer list">
    <header class="flex gap _2 _space">
      <div>
        <h2>Contacts</h2>
        <small>{getFiltered().length} shown</small>
      </div>
      <input class="search" placeholder="Search audience" bind:value={search} />
    </header>

    {#if loading}
      <p class="empty">Loading contacts...</p>
    {:else if !contacts.length}
      <p class="empty">No contacts yet.</p>
    {:else if !getFiltered().length}
      <p class="empty">No contacts match your search.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {#each getFiltered() as contact (contact.id)}
              <tr onclick={() => openEdit(contact)}>
                <td>{contactName(contact) || '-'}</td>
                <td>{contact.email}</td>
                <td><span class="pill flex">{contact.unsubscribed ? 'Unsubscribed' : 'Subscribed'}</span></td>
                <td class="actions">
                  <button class="button _secondary ghost" disabled={saving} onclick={(event) => { event.stopPropagation(); onRemoveContact(contact.id); }}>
                    Remove
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    width: min(100%, 1000px);
    margin: 0 auto;
    padding: 24px 16px 56px;  }

  .intro {
    border: 1px solid var(--override-border, #d9dee7);
    border-radius: 6px;
    background: var(--override-section, #fff);
  }

  .intro {    justify-content: space-between;
    padding: 18px;
  }

  .intro span,
  small {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: 26px;
  }

  h2 {
    font-size: 16px;
  }

  .intro p {
    max-width: 660px;
    margin-top: 6px;
    color: var(--override-text, #475467);
  }

  .intro strong {
    min-width: 72px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--override-box, #f2f4f7);
    font-size: 24px;
  }

  .alert {
    border-radius: 6px;
    padding: 12px 14px;
  }

  .error {
    border: 1px solid #fecdca;
    background: #fff4f2;
    color: #912018;
  }

  .success {
    border: 1px solid #abefc6;
    background: #f6fef9;
    color: #067647;
  }

  form {    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;    align-items: end;
    padding: 16px;
  }

  .edit-panel {
    padding: 16px;
  }

  .edit-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
  }

  .setting-row {    justify-content: space-between;
    align-items: center;
    padding: 16px;
  }

  .setting-row p {
    margin-top: 4px;
    color: var(--override-text, #475467);
  }

  .switch {    align-items: center;
  }

  label {    color: var(--override-text, #344054);
    font-size: 13px;
  }

  button:disabled {
    opacity: .55;
    cursor: not-allowed;
  }

  .list header {    padding: 14px 16px;
    border-bottom: 1px solid var(--override-border, #eaecf0);
  }

  .search {
    width: min(100%, 280px);
  }

  .table-wrap {
    overflow-x: auto;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: var(--override-box, #f2f4f7);
  }

  .pill {    align-items: center;
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: #ecfdf3;
    color: #067647;
    font-size: 12px;
  }

  .actions {
    text-align: right;
  }

  .ghost {
    min-height: 34px;
  }

  .empty {
    padding: 18px;
    color: var(--override-muted, #667085);
  }

  @media (max-width: 800px) {
    .intro,
    .list header {
      align-items: stretch;
      flex-direction: column;
    }

    form,
    .edit-grid {
      grid-template-columns: 1fr;
    }

    .setting-row {
      align-items: stretch;
      flex-direction: column;
    }

    .search {
      width: 100%;
    }
  }
</style>
