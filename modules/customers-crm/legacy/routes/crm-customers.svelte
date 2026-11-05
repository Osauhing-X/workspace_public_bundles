<script>
  let { customers = [], companies = [], settings = {}, selectedCustomer = null, selectedCustomerId = $bindable(''), saving = false, onSave, onDelete } = $props();
  let draft = $state(null);
  let tagDraft = $state('');

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  $effect(() => {
    if (!selectedCustomerId) { draft = null; tagDraft = ''; return; }
    if (selectedCustomer && draft?.id !== selectedCustomer.id) {
      draft = cloneData(selectedCustomer);
      tagDraft = (draft.tags ?? []).join(', ');
    }
  });

  function createCustomer() {
    tagDraft = '';
    draft = {
      id: `customer-${Date.now()}`,
      name: 'New customer',
      email: '',
      phone: '',
      company_id: '',
      stage: settings.stages?.[0]?.id ?? 'lead',
      value: 0,
      tags: [],
      note: '',
      metadata: {}
    };
    selectedCustomerId = draft.id;
  }

  function sources(customer = {}) {
    return customer.metadata?.sources?.length ? customer.metadata.sources : ['crm'];
  }

  function isVirtual(customer = {}) {
    return customer.metadata?.virtual === true;
  }
</script>

<section class="customers grid gap _3">
  <section class="box _outer editor grid gap _3">
    <header class="flex _space _center _y _wrap gap">
      <div>
        <span>Customer card</span>
        <h2>{draft?.name ?? 'Customer'}</h2>
        {#if draft}
          <div class="source-list flex _wrap gap">
            {#each sources(draft) as source}
              <small>{source}</small>
            {/each}
          </div>
        {/if}
      </div>
      <button class="button _secondary" onclick={createCustomer}>New customer</button>
    </header>

    {#if draft}
      <div class="form-grid grid gap _2">
        <label class="grid gap">Name <input bind:value={draft.name}></label>
        <label class="grid gap">Email <input type="email" bind:value={draft.email}></label>
        <label class="grid gap">Phone <input bind:value={draft.phone}></label>
        <label class="grid gap">Company
          <select bind:value={draft.company_id}>
            <option value="">No company</option>
            {#each companies as company}
              <option value={company.id}>{company.name}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap">Stage
          <select bind:value={draft.stage}>
            {#each settings.stages ?? [] as stage}
              <option value={stage.id}>{stage.label}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap">Estimated value <input type="number" min="0" bind:value={draft.value}></label>
        <label class="wide grid gap">Note <textarea rows="4" bind:value={draft.note}></textarea></label>
        <label class="wide grid gap">Tags (comma-separated)<input bind:value={tagDraft}></label>
      </div>
      <footer class="flex _wrap _space gap">
        {#if !isVirtual(draft)}
          <button class="button _danger" onclick={() => onDelete?.(draft.id)}>Archive</button>
        {:else}
          <span class="virtual-note">Source contact. Save to turn it into an editable CRM card.</span>
        {/if}
        <button class="button _primary" onclick={() => onSave?.({ ...draft, tags: tagDraft.split(',').map(value => value.trim()).filter(Boolean), metadata: { ...(draft.metadata ?? {}), virtual: false, sources: sources(draft) } })} disabled={saving}>
          {saving ? 'Saving...' : isVirtual(draft) ? 'Save as CRM card' : 'Save customer'}
        </button>
      </footer>
    {:else}
      <p>Select or create a customer.</p>
    {/if}
  </section>

  <section class="box _outer table-section grid gap _2">
    <header>
      <span>Directory</span>
      <h2>Customers</h2>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Source</th><th>Stage</th><th>Company</th><th>Value</th></tr></thead>
        <tbody>
          {#each customers as customer}
            <tr class:active={selectedCustomerId === customer.id}>
              <td><button onclick={() => selectedCustomerId = customer.id}>{customer.name}</button><small>{customer.email || '-'}</small></td>
              <td>
                <div class="source-list flex _wrap gap">
                  {#each sources(customer) as source}
                    <small>{source}</small>
                  {/each}
                </div>
              </td>
              <td>{settings.stages?.find((stage) => stage.id === customer.stage)?.label ?? customer.stage}</td>
              <td>{companies.find((company) => company.id === customer.company_id)?.name ?? '-'}</td>
              <td class="nowrap">{Number(customer.value ?? 0).toFixed(0)} EUR</td>
            </tr>
          {:else}
            <tr><td colspan="5">No customers yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .customers {
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

  .source-list {
    margin-top: 6px;
  }

  .source-list small,
  .virtual-note {
    width: fit-content;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: var(--override-box, #f2f4f7);
    padding: 0 8px;
    color: var(--override-muted, #667085);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  table {
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 12px 10px;
    border-bottom: 1px solid var(--override-border, #eaecf0);
    text-align: left;
    vertical-align: top;
  }

  th,
  .nowrap {
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
    .customers,
    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
