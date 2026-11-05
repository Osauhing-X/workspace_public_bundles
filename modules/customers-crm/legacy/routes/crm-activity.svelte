<script>
  let { activities = [], customers = [], companies = [], saving = false, filter = $bindable({ customer_id: '', company_id: '', source: 'all' }), onSave } = $props();
  let draft = $state(defaultActivity());
  let editorPopover;

  const sources = $derived([...new Set(activities.map((item) => item.type).filter(Boolean))].sort());
  const visibleActivities = $derived(activities.filter((activity) => {
    if (filter.customer_id && activity.customer_id !== filter.customer_id) return false;
    if (filter.company_id && activity.company_id !== filter.company_id) return false;
    if (filter.source && filter.source !== 'all' && activity.type !== filter.source) return false;
    return true;
  }));

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function defaultActivity() {
    return {
      id: `activity-${Date.now()}`,
      customer_id: '',
      company_id: '',
      type: 'note',
      title: '',
      body: '',
      due_at: '',
      done: false,
      metadata: {}
    };
  }

  function edit(activity) {
    draft = cloneData(activity);
    if (draft.due_at) draft.due_at = new Date(draft.due_at).toISOString().slice(0, 16);
    editorPopover?.showPopover?.();
  }

  function save() {
    onSave?.({
      ...draft,
      due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null
    });
    draft = defaultActivity();
    editorPopover?.hidePopover?.();
  }

  function addNew() {
    draft = defaultActivity();
    editorPopover?.showPopover?.();
  }

  function resetFilter() {
    filter = { customer_id: '', company_id: '', source: 'all' };
  }

  function nameFor(activity) {
    return customers.find((customer) => customer.id === activity.customer_id)?.name
      ?? companies.find((company) => company.id === activity.company_id)?.name
      ?? '-';
  }
</script>

<section class="activity grid gap _3">
  <div class="editor-popover" popover bind:this={editorPopover}>
  <section class="box _outer editor grid gap _3">
    <header class="flex _space _start _wrap gap">
      <div>
        <span>Follow-up</span>
        <h2>{draft.id?.startsWith('activity-') ? 'New activity' : draft.title}</h2>
      </div>
      <div class="flex gap">
        <button class="button _secondary" onclick={() => draft = defaultActivity()}>Clear</button>
        <button class="button _secondary" onclick={() => editorPopover?.hidePopover?.()} aria-label="Close activity editor">Close</button>
      </div>
    </header>

    <div class="form-grid grid gap _2">
      <label class="grid gap">Type
        <select bind:value={draft.type}>
          <option value="note">Note</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="task">Task</option>
          {#each sources as source}
            <option value={source}>{source}</option>
          {/each}
        </select>
      </label>
      <label class="grid gap">Customer
        <select bind:value={draft.customer_id}>
          <option value="">No customer</option>
          {#each customers as customer}
            <option value={customer.id}>{customer.name}</option>
          {/each}
        </select>
      </label>
      <label class="grid gap">Company
        <select bind:value={draft.company_id}>
          <option value="">No company</option>
          {#each companies as company}
            <option value={company.id}>{company.name}</option>
          {/each}
        </select>
      </label>
      <label class="grid gap">Due <input type="datetime-local" bind:value={draft.due_at}></label>
      <label class="wide grid gap">Title <input bind:value={draft.title}></label>
      <label class="wide grid gap">Details <textarea rows="4" bind:value={draft.body}></textarea></label>
      <label class="switch flex gap _2"><input type="checkbox" bind:checked={draft.done}> Done</label>
    </div>

    <footer class="flex _wrap _right gap">
      <button class="button _primary" onclick={save} disabled={saving}>{saving ? 'Saving...' : 'Save activity'}</button>
    </footer>
  </section>
  </div>

  <section class="box _outer table-section grid gap _2">
    <header class="grid gap _2">
      <div class="flex _space _wrap gap">
        <div>
          <span>Timeline</span>
          <h2>Activities</h2>
          <p>Shows the full list by default. Filters can focus the list by person, company or service source.</p>
        </div>
        <div class="flex _wrap gap">
          <button class="button _secondary" onclick={resetFilter}>Show all</button>
          <button class="button _primary" onclick={addNew}>Add new</button>
        </div>
      </div>
      <div class="filters grid gap _2">
        <label class="grid gap">Person
          <select bind:value={filter.customer_id}>
            <option value="">All people</option>
            {#each customers as customer}
              <option value={customer.id}>{customer.name}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap">Company
          <select bind:value={filter.company_id}>
            <option value="">All companies</option>
            {#each companies as company}
              <option value={company.id}>{company.name}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap">Service
          <select bind:value={filter.source}>
            <option value="all">All services</option>
            {#each sources as source}
              <option value={source}>{source}</option>
            {/each}
          </select>
        </label>
      </div>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Activity</th><th>Related</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          {#each visibleActivities as activity}
            <tr onclick={() => edit(activity)}>
              <td><b>{activity.title}</b><small>{activity.type}</small></td>
              <td>{nameFor(activity)}</td>
              <td class="nowrap">{activity.due_at ? new Date(activity.due_at).toLocaleString() : '-'}</td>
              <td>{activity.done ? 'Done' : 'Open'}</td>
            </tr>
          {:else}
            <tr><td colspan="4">No activities match the current filters.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .activity {
    grid-template-columns: 1fr;
  }

  .editor-popover {
    width: min(calc(100% - 2em), 720px);
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 0;
  }

  .editor-popover::backdrop {
    background: #0008;
  }

  .editor {
    padding: 18px;
  }

  .form-grid,
  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .wide {
    grid-column: 1 / -1;
  }

  .switch {
    align-items: center;
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

  th,
  .nowrap {
    white-space: nowrap;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
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
  span,
  small {
    color: var(--override-muted, #667085);
  }

  span,
  small {
    font-size: 12px;
  }

  @media (max-width: 900px) {
    .activity,
    .form-grid,
    .filters {
      grid-template-columns: 1fr;
    }
  }
</style>
