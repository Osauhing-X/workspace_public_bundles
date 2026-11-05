<script>
  import CrmMap from './crm-map.svelte';

  let {
    customers = [],
    companies = [],
    activities = [],
    settings = {},
    selectedType = $bindable('customer'),
    selectedId = $bindable(''),
    onActivityFilter,
    onOpenSource
  } = $props();

  const selectedCustomer = $derived(customers.find((customer) => customer.id === selectedId));
  const selectedCompany = $derived(companies.find((company) => company.id === selectedId));
  const selectedItem = $derived(selectedType === 'company' ? selectedCompany : selectedCustomer);

  function sourcesFor(customer = {}) {
    return customer.metadata?.sources?.length ? customer.metadata.sources : ['crm'];
  }

  function select(type, id) {
    selectedType = type;
    selectedId = id;
  }

  function selectNode(node) {
    if (node.type === 'customer' || node.type === 'company') select(node.type, node.id);
  }
</script>

<section class="directory grid gap _3">
  <div class="directory-grid grid gap _3">
    <section class="content-group box _outer grid gap _2">
      <header>
        <span>People</span>
        <h2>Customers</h2>
        <p>Unified cards from CRM, Audience, Booking and Rent. Select a row to inspect service and company links.</p>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Stage</th><th>Sources</th><th>Value</th></tr>
          </thead>
          <tbody>
            {#each customers as customer}
              <tr class:active={selectedType === 'customer' && selectedId === customer.id} onclick={() => select('customer', customer.id)}>
                <td><b>{customer.name}</b><small>{customer.phone || 'No phone'}</small></td>
                <td class="nowrap">{customer.email || '-'}</td>
                <td class="nowrap">{customer.stage}</td>
                <td>
                  <div class="flex _wrap gap">
                    {#each sourcesFor(customer) as source}
                      <span class="css _black">{source}</span>
                    {/each}
                  </div>
                </td>
                <td class="nowrap">{Number(customer.value ?? 0).toFixed(0)} EUR</td>
              </tr>
            {:else}
              <tr><td colspan="5">No customers yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="content-group box _outer grid gap _2">
      <header>
        <span>Organizations</span>
        <h2>Companies</h2>
        <p>Company records become the center of a relationship graph when selected.</p>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Company</th><th>Email</th><th>Website</th><th>Phone</th></tr>
          </thead>
          <tbody>
            {#each companies as company}
              <tr class:active={selectedType === 'company' && selectedId === company.id} onclick={() => select('company', company.id)}>
                <td><b>{company.name}</b><small>{company.note || 'No note'}</small></td>
                <td class="nowrap">{company.email || '-'}</td>
                <td class="nowrap">{company.website || '-'}</td>
                <td class="nowrap">{company.phone || '-'}</td>
              </tr>
            {:else}
              <tr><td colspan="4">No companies yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>

  {#if selectedItem}
    <CrmMap
      {customers}
      {companies}
      {activities}
      {settings}
      {selectedType}
      selectedId={selectedItem.id}
      onSelect={selectNode}
      {onActivityFilter}
      {onOpenSource}
    />
  {/if}
</section>

<style>
  .directory-grid {
    grid-template-columns: 1fr;
  }

  .content-group {
    overflow: hidden;
  }

  .content-group > header {
    padding: 18px 18px 0;
  }

  .table-wrap {
    overflow-x: auto;
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

  td b,
  td small {
    display: block;
  }

  h2,
  p {
    margin: 0;
  }

  p,
  small {
    color: var(--override-muted, #667085);
  }

  span,
  small {
    font-size: 12px;
  }

  @media (max-width: 920px) {
    .directory-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
