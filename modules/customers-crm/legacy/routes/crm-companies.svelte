<script>
  let { companies = [], selectedCompanyId = $bindable(''), saving = false, onSave, onDelete } = $props();
  let draft = $state(null);

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  $effect(() => {
    if (draft && selectedCompanyId === draft.id && !companies.some(row => row.id === draft.id)) return;
    const selected = companies.find((company) => company.id === selectedCompanyId) ?? companies[0] ?? null;
    if (selected && draft?.id !== selected.id) draft = cloneData(selected);
  });

  function createCompany() {
    draft = {
      id: `company-${Date.now()}`,
      name: 'New company',
      email: '',
      phone: '',
      website: '',
      note: '',
      metadata: {}
    };
    selectedCompanyId = draft.id;
  }
</script>

<section class="companies grid gap _3">
  <section class="box _outer editor grid gap _3">
    <header class="flex _space _center _y _wrap gap">
      <div>
        <span>Company card</span>
        <h2>{draft?.name ?? 'Company'}</h2>
      </div>
      <button class="button _secondary" onclick={createCompany}>New company</button>
    </header>

    {#if draft}
      <div class="form-grid grid gap _2">
        <label class="grid gap">Name <input bind:value={draft.name}></label>
        <label class="grid gap">Email <input type="email" bind:value={draft.email}></label>
        <label class="grid gap">Phone <input bind:value={draft.phone}></label>
        <label class="grid gap">Website <input bind:value={draft.website}></label>
        <label class="wide grid gap">Note <textarea rows="5" bind:value={draft.note}></textarea></label>
      </div>
      <footer class="flex _wrap _space gap">
        <button class="button _danger" onclick={() => onDelete?.(draft.id)}>Archive</button>
        <button class="button _primary" onclick={() => onSave?.(draft)} disabled={saving}>{saving ? 'Saving...' : 'Save company'}</button>
      </footer>
    {:else}
      <p>Select or create a company.</p>
    {/if}
  </section>

  <section class="box _outer table-section grid gap _2">
    <header>
      <span>Accounts</span>
      <h2>Companies</h2>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Website</th></tr></thead>
        <tbody>
          {#each companies as company}
            <tr class:active={selectedCompanyId === company.id}>
              <td><button onclick={() => selectedCompanyId = company.id}>{company.name}</button><small>{company.id}</small></td>
              <td>{company.email || '-'}</td>
              <td>{company.phone || '-'}</td>
              <td>{company.website || '-'}</td>
            </tr>
          {:else}
            <tr><td colspan="4">No companies yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .companies {
    grid-template-columns: minmax(280px, .85fr) minmax(0, 1.15fr);
  }

  .editor {
    padding: 18px;
  }

  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wide {
    grid-column: 1 / -1;
  }

  .table-section {
    overflow: hidden;
  }

  .table-section > header {
    padding: 18px 18px 0;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 12px 10px;
    border-bottom: 1px solid var(--override-border, #eaecf0);
    text-align: left;
    vertical-align: top;
  }

  th {
    white-space: nowrap;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover,
  tbody tr.active {
    background: var(--override-box, #f2f4f7);
  }

  td button,
  td small {
    display: block;
  }

  h2,
  p {
    margin: 0;
  }

  span,
  small {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  @media (max-width: 860px) {
    .companies,
    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
