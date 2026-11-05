<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/header/import.svelte';
  import { tenantPathPrefix, workspaceBackPath } from '$lib/site/dns_route/tenant_portal/workspace/navigation.js';
  import CrmDirectory from './crm-directory.svelte';
  import CrmActivity from './crm-activity.svelte';

  let loading = $state(true);
  let saving = $state(false);
  let error = $state(null);
  let message = $state(null);
  let exists = $state(false);
  let active = $state('relationships');
  let settings = $state({ stages: [], tags: [] });
  let customers = $state([]);
  let companies = $state([]);
  let activities = $state([]);
  let selectedCustomerId = $state('');
  let selectedCompanyId = $state('');
  let selectedType = $state('customer');
  let selectedRelationId = $state('');
  let activityFilter = $state({ customer_id: '', company_id: '', source: 'all' });

  const endpoint = () => `${window.location.pathname.replace(/\/$/, '')}/api/CRUD`;
  const openActivities = $derived(activities.filter((item) => !item.done && !item.deleted_at).length);

  onMount(load);

  async function load() {
    loading = true;
    error = null;
    const res = await fetch(endpoint());
    const json = await res.json().catch(() => ({}));
    loading = false;
    if (!res.ok || json.error) {
      error = json.error ?? 'CRM failed to load';
      exists = false;
      return;
    }
    exists = !!json.exists;
    settings = json.settings ?? settings;
    customers = json.customers ?? [];
    companies = json.companies ?? [];
    activities = json.activities ?? [];
    selectedCustomerId = customers.find((customer) => customer.id === selectedCustomerId)?.id ?? customers[0]?.id ?? '';
    selectedCompanyId = companies.find((company) => company.id === selectedCompanyId)?.id ?? companies[0]?.id ?? '';
    selectedRelationId = selectedType === 'company'
      ? companies.find((company) => company.id === selectedRelationId)?.id ?? ''
      : customers.find((customer) => customer.id === selectedRelationId)?.id ?? '';
  }

  async function post(body) {
    saving = true;
    error = null;
    message = null;
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    saving = false;
    if (!res.ok || json.error) {
      error = json.error ?? 'Action failed';
      return null;
    }
    return json;
  }

  async function setup() {
    const result = await post({ action: 'setup' });
    if (result?.ok) {
      message = 'Customers/CRM module is enabled.';
      await load();
    }
  }

  async function saveCustomer(customer) {
    const result = await post({ action: 'customer', customer });
    if (result?.customer) {
      customers = upsert(customers, result.customer);
      selectedCustomerId = result.customer.id;
      message = 'Customer saved.';
    }
  }

  async function saveCompany(company) {
    const result = await post({ action: 'company', company });
    if (result?.company) {
      companies = upsert(companies, result.company);
      selectedCompanyId = result.company.id;
      message = 'Company saved.';
    }
  }

  async function saveActivity(activity) {
    const result = await post({ action: 'activity', activity });
    if (result?.activity) {
      activities = upsert(activities, result.activity);
      message = 'Activity saved.';
    }
  }

  function upsert(list, row) {
    const exists = list.some((item) => item.id === row.id);
    return exists ? list.map((item) => item.id === row.id ? row : item) : [row, ...list];
  }

  function openActivity(filter) {
    activityFilter = { customer_id: '', company_id: '', source: 'all', ...(filter ?? {}) };
    active = 'activity';
  }

  function openSource(node) {
    if (node?.type === 'customer') {
      selectedType = 'customer';
      selectedRelationId = node.id;
      selectedCustomerId = node.id;
      openActivity({ customer_id: node.id });
      return;
    }
    if (node?.type === 'company') {
      selectedType = 'company';
      selectedRelationId = node.id;
      selectedCompanyId = node.id;
      openActivity({ company_id: node.id });
      return;
    }
    const paths = {
      audience: '/modules/audience',
      booking: '/modules/booking',
      rent: '/modules/rent'
    };
    const path = paths[node?.source];
    if (path) window.open(`${tenantPathPrefix()}${path}`, '_blank', 'noopener,noreferrer');
  }
</script>

<Header>
  {#snippet slot_main()}
    <div class="flex gap _3 _center _y">
      <b>Customers / CRM</b>
      <span class="css _black">Module</span>
    </div>
  {/snippet}

  {#snippet slot_btns()}
    <button class="back" onclick={() => goto(workspaceBackPath())}>Back</button>
    <button class:active={active === 'relationships'} onclick={() => active = 'relationships'}>Relationships</button>
    <button class:active={active === 'activity'} onclick={() => active = 'activity'}>Activity</button>
  {/snippet}
</Header>

<main class="crm-module grid gap _3">
  <section class="hero box _outer grid gap _3">
    <div>
      <span>Relationship command center</span>
      <h1>Customers, companies and every follow-up in one place</h1>
      <p>Unify form leads, store customers, bookings and support notes into a practical CRM that tenants can actually use.</p>
    </div>
  </section>

  <section class="stats grid gap _2" aria-label="CRM summary">
    <article class="box _inner grid gap"><b>{customers.length}</b><small>Customers</small></article>
    <article class="box _inner grid gap"><b>{companies.length}</b><small>Companies</small></article>
    <article class="box _inner grid gap"><b>{openActivities}</b><small>Open tasks</small></article>
  </section>

  {#if error}<p class="alert error">{error}</p>{/if}
  {#if message}<p class="alert success">{message}</p>{/if}

  {#if loading}
    <section class="box _outer panel">Loading CRM...</section>
  {:else if !exists}
    <section class="box _outer setup grid gap _2">
      <span>Setup required</span>
      <h2>Enable Customers / CRM</h2>
      <p>This creates tenant Supabase tables for companies, customers, notes and follow-up activities.</p>
      <button class="button _primary" onclick={setup} disabled={saving}>{saving ? 'Enabling...' : 'Enable module'}</button>
    </section>
  {:else if active === 'relationships'}
    <CrmDirectory
      {customers}
      {companies}
      {activities}
      {settings}
      bind:selectedType
      bind:selectedId={selectedRelationId}
      onActivityFilter={openActivity}
      onOpenSource={openSource}
    />
  {:else}
    <CrmActivity bind:filter={activityFilter} {activities} {customers} {companies} {saving} onSave={saveActivity} />
  {/if}
</main>

<style>
  main {
    width: min(100%, 1100px);
    margin: 0 auto;
    padding: 24px 16px 56px;
  }

  .panel,
  .setup,
  .stage-board,
  .source-board {
    padding: 18px;
  }

  .hero {
    padding: 22px;
  }
  .stats,
  .stage-grid,
  .source-grid {
    grid-template-columns: repeat( auto-fit, minmax(100px, 1fr) );
  }

  .stats article,
  .stage-grid article,
  .source-grid article {
    padding: 12px;
  }

  .stage-grid i {
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: var(--stage, #667085);
  }

  .source-errors {
    border: 1px solid #fedf89;
    border-radius: 8px;
    background: #fffaeb;
    padding: 10px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: 30px;
  }

  p {
    color: var(--override-text, #475467);
    line-height: 1.55;
  }

  span,
  small {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  .stats b,
  .stage-grid b {
    font-size: 23px;
  }

  .alert {
    border-radius: 6px;
    padding: 11px 12px;
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

  @media (max-width: 860px) {
    .hero,
    .overview,
    .stats,
    .stage-grid,
    .source-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
