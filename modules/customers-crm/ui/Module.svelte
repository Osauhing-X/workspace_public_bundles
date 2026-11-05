<script>
  import { onMount } from 'svelte';
  import Customers from '../legacy/routes/crm-customers.svelte';
  import Companies from '../legacy/routes/crm-companies.svelte';
  import { moduleRequest } from './bridge.js';
  import { cloneDraft } from './drafts.js';
  let state = $state({ settings: { stages: [], tags: [] }, customers: [], companies: [], activities: [] }), loading = $state(true), saving = $state(false), error = $state(''), notice = $state('');
  let tab = $state('customers'), search = $state(''), customerId = $state(''), companyId = $state(''), archive = $state(null);
  let activity = $state(null), dueLocal = $state('');
  let settingsDraft = $state({ stages: [], tags: [] }), tagLines = $state('');
  const customers = $derived(state.customers.filter(row => !row.deleted_at && `${row.name} ${row.email} ${row.phone} ${row.tags?.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const companies = $derived(state.companies.filter(row => !row.deleted_at && `${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase())));
  const activities = $derived(state.activities.filter(row => !row.deleted_at && `${row.title} ${row.body}`.toLowerCase().includes(search.toLowerCase())));
  const openTasks = $derived(state.activities.filter(row => !row.deleted_at && !row.done && row.type === 'task').length);
  async function request(body) {
    saving = true; error = ''; notice = '';
    try { const response = await moduleRequest(body), result = await response.json(); if (!response.ok || result.error) throw new Error(result.error || 'CRM operation failed.'); state = result; if (body) notice = 'CRM data saved.'; return true; }
    catch (reason) { error = reason.message; return false; } finally { saving = false; loading = false; }
  }
  function editActivity(row) { activity = cloneDraft(row ?? { type: 'task', title: '', body: '', customer_id: '', company_id: '', done: false }); dueLocal = row?.due_at ? new Date(new Date(row.due_at).valueOf() - new Date(row.due_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''; }
  async function saveActivity() { if (await request({ action: 'activity', activity: { ...activity, due_at: dueLocal ? new Date(dueLocal).toISOString() : null } })) activity = null; }
  onMount(() => request());
</script>
<main class="grid gap _3">
  <header class="module-heading"><p class="eyebrow">CUSTOMER WORKSPACE</p><h1>Customers &amp; companies</h1><p>Keep contacts, relationships and follow-up work together.</p></header>
  <nav class="flex gap _2" aria-label="CRM views">{#each ['customers', 'companies', 'activity', 'archive', 'settings'] as view}<button class:active={tab === view} onclick={() => { tab = view; search = ''; if (view === 'settings') { settingsDraft = cloneDraft(state.settings); tagLines = settingsDraft.tags.join('\n'); } }}>{view === 'activity' ? 'Activity' : view.charAt(0).toUpperCase() + view.slice(1)}</button>{/each}</nav>
  <dl class="stats" aria-label="Saved CRM totals"><div><dt>Customers</dt><dd>{state.customers.filter(row => !row.deleted_at).length}</dd></div><div><dt>Companies</dt><dd>{state.companies.filter(row => !row.deleted_at).length}</dd></div><div><dt>Open tasks</dt><dd>{openTasks}</dd></div></dl>
  <p>Private CRM records belong to this installed module. Archived records and their relationships are retained. External lead synchronization is not connected yet.</p>
  {#if error}<p role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
  <label class="grid gap">Search<input bind:value={search} placeholder="Name, email or activity"></label>
  {#if archive}<section class="box _outer grid gap _2"><p>Archive this record? It stays in history and can be restored.</p><div class="flex gap _2"><button disabled={saving} onclick={async () => { const target = archive; if (await request({ action: 'archive', ...target })) { if (customerId === target.id) customerId = ''; if (companyId === target.id) companyId = ''; archive = null; } }}>Confirm archive</button><button onclick={() => archive = null}>Cancel</button></div></section>{/if}
  {#if loading}<p>Loading CRM…</p>{:else if tab === 'customers'}
    <Customers {customers} companies={state.companies.filter(row => !row.deleted_at)} settings={state.settings} selectedCustomer={state.customers.find(row => row.id === customerId && !row.deleted_at)} bind:selectedCustomerId={customerId} {saving} onSave={customer => request({ action: 'customer', customer })} onDelete={id => archive = { table: 'customers', id }} />
  {:else if tab === 'companies'}
    <Companies {companies} bind:selectedCompanyId={companyId} {saving} onSave={company => request({ action: 'company', company })} onDelete={id => archive = { table: 'companies', id }} />
  {:else if tab === 'activity'}
    <button disabled={saving} onclick={() => editActivity(null)}>New activity</button>
    {#if activity}<section class="box _outer grid gap _2"><label>Title<input bind:value={activity.title} maxlength="240"></label><label>Type<select bind:value={activity.type}>{#each ['note', 'call', 'email', 'meeting', 'task'] as type}<option value={type}>{type}</option>{/each}</select></label><label>Customer<select bind:value={activity.customer_id}><option value="">None</option>{#each state.customers.filter(row => !row.deleted_at) as row}<option value={row.id}>{row.name}</option>{/each}</select></label><label>Company<select bind:value={activity.company_id}><option value="">None</option>{#each state.companies.filter(row => !row.deleted_at) as row}<option value={row.id}>{row.name}</option>{/each}</select></label><label>Notes<textarea bind:value={activity.body} maxlength="4000"></textarea></label><label>Due date (your local time)<input type="datetime-local" bind:value={dueLocal}></label><label><input type="checkbox" bind:checked={activity.done}>Completed</label><div class="flex gap _2"><button disabled={saving || !activity.title.trim()} onclick={saveActivity}>Save activity</button><button onclick={() => activity = null}>Cancel</button></div></section>{/if}
    {#each activities as row}<article class="box _outer grid gap _2"><h3>{row.title}</h3><p>{row.body}</p><small>{row.type} · {row.done ? 'Completed' : 'Open'} {row.due_at ? `· ${new Date(row.due_at).toLocaleString()}` : ''}</small><p>{state.customers.find(customer => customer.id === row.customer_id)?.name ?? ''} {state.companies.find(company => company.id === row.company_id)?.name ?? ''}</p><div class="flex gap _2"><button onclick={() => editActivity(row)}>Edit</button><button disabled={saving} onclick={() => request({ action: 'activity', activity: { ...row, done: !row.done } })}>{row.done ? 'Reopen' : 'Complete'}</button><button onclick={() => archive = { table: 'activities', id: row.id }}>Archive</button></div></article>{:else}<p>No matching activities.</p>{/each}
  {:else if tab === 'settings'}<section class="box _outer grid gap _2"><h2>CRM stages and tags</h2><p>Stage IDs are stable identifiers. Stages used by active or archived customers cannot be removed.</p>{#each settingsDraft.stages as stage, index}<div class="flex gap _2"><label>ID<input bind:value={stage.id} maxlength="120"></label><label>Label<input bind:value={stage.label} maxlength="120"></label><button disabled={saving} onclick={() => settingsDraft.stages = settingsDraft.stages.filter((_, position) => position !== index)}>Remove</button></div>{/each}<button disabled={saving || settingsDraft.stages.length >= 30} onclick={() => settingsDraft.stages = [...settingsDraft.stages, { id: '', label: '' }]}>Add stage</button><label>Suggested tags (one per line)<textarea bind:value={tagLines}></textarea></label><button disabled={saving} onclick={() => request({ action: 'settings', settings: { ...settingsDraft, tags: tagLines.split('\n').map(value => value.trim()).filter(Boolean) } })}>Save settings</button></section>
  {:else}{#each ['companies', 'customers', 'activities'] as table}<section class="box _outer grid gap _2"><h3>{table}</h3>{#each state[table].filter(row => row.deleted_at) as row}<div class="flex gap _2"><span>{row.name ?? row.title}</span><button disabled={saving} onclick={() => request({ action: 'restore', table, id: row.id })}>Restore</button></div>{:else}<p>No archived records.</p>{/each}</section>{/each}{/if}
</main>
<style>
  :global(main .button){min-height:44px}
main{box-sizing:border-box;width:min(100%,1440px);margin:0 auto;padding:clamp(16px,2.4vw,32px);min-width:0}.flex{flex-wrap:wrap}.box{padding:20px}.module-heading h1{font-size:clamp(25px,3vw,34px);line-height:1.2;letter-spacing:-.03em;margin:8px 0;color:#172033}.module-heading p{margin:6px 0;color:#526174}.eyebrow{font-size:11px;letter-spacing:.12em;font-weight:600}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#d9dee7;border:1px solid #d9dee7;border-radius:10px;overflow:hidden;margin:0}.stats>div{min-width:0;padding:16px 20px;background:#fff}.stats dt{font-size:12px;color:#526174}.stats dd{margin:6px 0 0;font-size:26px;line-height:1.3;color:#172033;font-weight:600}
:global(main button),:global(main input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=color])),:global(main select){min-height:44px}:global(main input),:global(main select),:global(main textarea){min-width:0;max-width:100%;box-sizing:border-box}:global(main label:has(>input[type=checkbox])){display:flex;align-items:center;gap:10px;min-height:44px}:global(main label>input[type=checkbox]){width:18px;height:18px;min-height:18px;flex:none;margin:0}:global(main :is(button,input,select,textarea):focus-visible){outline:2px solid #866000;outline-offset:3px}
@media(max-width:600px){.stats>div{padding:12px}.stats dd{font-size:22px}.box{padding:16px}}
</style>
