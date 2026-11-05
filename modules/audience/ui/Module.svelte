<script>
  import { onMount } from 'svelte';
  import { moduleRequest } from './bridge.js';
  import AudienceBoard from '../legacy/routes/audience-board.svelte';
  const i18n = { title: 'Resend contacts', subscribers: 'Subscribers', description: 'Manage contacts in the selected Resend account. Subscription changes apply only to Resend.', landingVisibility: 'Website subscription form' };
  let groups=$state([]),allContacts=$state([]),setup=$state([]),source=$state('all'),search=$state('');
  let pageIndex=$state(0);
  $effect(()=>{source;search;pageIndex=0;});
  const selected=$derived(groups.find(group=>group.id===source));
  const rows=$derived((source==='all'?allContacts:selected?.contacts??[]).filter(contact=>`${contact.email} ${contact.name??''}`.toLowerCase().includes(search.toLowerCase())));
  const pageRows=$derived(rows.slice(pageIndex*50,(pageIndex+1)*50));
  let contacts = $state([]), publicEnabled = $state(false), loaded = $state(false);
  let loading = $state(false), saving = $state(false), error = $state(null), message = $state(null);
  async function load() {
    loading = true; error = null;
    try {
      const response = await moduleRequest('module'); const result = await response.json();
      if (typeof result.public_enabled === 'boolean') publicEnabled = result.public_enabled;
      if (!response.ok || result.error) throw new Error(result.error || 'Could not load contacts.');
      contacts = result.contacts ?? []; loaded = true;
      groups=result.groups??[{id:'resend',label:'Resend',status:'ready',contacts}];allContacts=result.all_contacts??contacts.map(contact=>({...contact,sources:['resend']}));setup=result.setup??[];
      pageIndex=0;
      if(source!=='all'&&!groups.some(group=>group.id===source))source='all';
    } catch (reason) { error = reason.message; }
    finally { loading = false; }
  }
  onMount(load);
  const contactName = contact => [contact.first_name ?? contact.firstName, contact.last_name ?? contact.lastName].filter(Boolean).join(' ');
  async function operation(payload, success) {
    saving = true; error = null; message = null;
    try {
      const response = await moduleRequest('module', { method: 'POST', body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Audience operation failed.');
      message = result.existed ? 'Contact already exists. Its subscription was not changed.' : success;
      await load(); return true;
    } catch (reason) { error = reason.message; return false; }
    finally { saving = false; }
  }
</script>
<main>
<section class="communication"><header><div><small>PEOPLE & CHANNELS</small><h1>Communication</h1><p>One contact overview, with each source kept separate. A customer or Auth account is not proof of marketing consent.</p></div><button disabled={loading||saving} onclick={load}>{loading?'Loading…':'Refresh contacts'}</button></header><nav aria-label="Contact sources"><button class:active={source==='all'} onclick={()=>source='all'}>All <span>{allContacts.length}</span></button>{#each groups as group}<button class:active={source===group.id} onclick={()=>source=group.id}>{group.label} <span>{group.status==='ready'?group.contacts.length:'Unavailable'}</span></button>{/each}</nav>{#if error}<p role="alert">{error}</p>{/if}{#each setup as note}<p class="hint">{note} Choose connections in Module information → Service connections.</p>{/each}{#each groups.filter(group=>group.status==='unavailable') as group}<p class="warning" role="status">{group.error}</p>{/each}{#if loaded&&!groups.length}<p>No configured contact source is available. Select an installed connection in Service connections below.</p>{/if}
{#if source!=='resend'}<label class="search">Find a contact<input type="search" bind:value={search} placeholder="Email or name"></label><div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Sources</th><th>Email consent</th></tr></thead><tbody>{#each pageRows as contact}<tr><td>{contact.email}</td><td>{contact.name||'—'}</td><td>{(contact.sources??[source]).map(id=>groups.find(group=>group.id===id)?.label??id).join(', ')}</td><td>{contact.unsubscribed===true?'Opted out':'Not inferred'}</td></tr>{:else}<tr><td colspan="4">{loading?'Loading contacts…':selected?.status==='unavailable'?'This source is unavailable.':'No contacts in this view.'}</td></tr>{/each}</tbody></table></div><div class="contact-paging"><span>{rows.length} contacts · page {pageIndex+1} of {Math.max(1,Math.ceil(rows.length/50))}</span><button disabled={pageIndex===0} onclick={()=>pageIndex--}>Previous</button><button disabled={(pageIndex+1)*50>=rows.length} onclick={()=>pageIndex++}>Next</button></div>{/if}</section>
{#if source==='resend'&&selected?.status==='ready'}
<AudienceBoard {i18n} {contacts} {loaded} {loading} {saving} {error} {message} {publicEnabled} {contactName} onRefresh={load}
  onAddContact={payload => operation({ ...payload, action: 'add' }, 'Contact created in Resend.')}
  onUpdateContact={payload => operation({ ...payload, action: 'update' }, 'Contact updated in Resend.')}
  onRemoveContact={id => operation({ action: 'remove', id }, 'Contact removed from Resend.')}
  onSavePublicSetting={public_enabled => operation({ action: 'settings', public_enabled }, 'Website visibility saved.')} />
{/if}
</main>
<style>.contact-paging{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:12px}.contact-paging span{margin-right:auto}main{padding:16px;width:min(100%,1280px);box-sizing:border-box;margin-inline:auto}.communication{padding:24px;background:#fff;border:1px solid #dce2e7;border-radius:12px;font:14px/1.6 system-ui;color:#344054}.communication header{display:flex;align-items:start;justify-content:space-between;gap:20px}.communication h1{font-size:28px;letter-spacing:-.03em;margin:6px 0;color:#101828}.communication small{font:10px ui-monospace,monospace;letter-spacing:.14em;color:#667085}.communication p{max-width:760px}.communication nav{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.communication button{min-height:42px;border:1px solid #d0d5dd;border-radius:7px;background:#fff;padding:9px 14px;font:inherit;color:#344054;cursor:pointer}.communication button.active{background:#172033;color:#fff;border-color:#172033}.communication nav span{font-size:12px;margin-left:8px}.search{display:grid;gap:6px;max-width:360px;margin:16px 0}.search input{padding:11px;border:1px solid #d0d5dd;border-radius:7px;font:inherit}.table-wrap{overflow:auto;border:1px solid #e4e7ec;border-radius:8px}.table-wrap table{width:100%;min-width:640px;border-collapse:collapse;text-align:left}.table-wrap th,.table-wrap td{padding:12px 15px;border-bottom:1px solid #eaecf0;font-size:13px}.table-wrap th{background:#f8fafc;font-weight:600}.table-wrap td{overflow-wrap:anywhere}.hint,.warning{padding:12px;border:1px solid #ead8a5;background:#fffbf1;border-radius:7px}.communication :is(button,input):focus-visible{outline:3px solid #947000;outline-offset:3px}@media(max-width:600px){main{padding:10px}.communication{padding:16px}.communication header{flex-direction:column}.communication h1{font-size:24px}}</style>
