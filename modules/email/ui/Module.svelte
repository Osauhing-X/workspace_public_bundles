<script>
  import { onMount } from 'svelte';
  import EmailBuilder from '../legacy/ui/email_builder.svelte';
  import { moduleRequest } from './bridge.js';
  import { templateFields, validateFields, renderTemplate } from './template.js';
  const i18n = {
    composerEyebrow: 'Email', composerTitle: 'Compose a message', composerDescription: 'Create content, save drafts and review recipients before sending.',
    template: 'Template', noTemplate: 'Blank message', subject: 'Subject', from: 'From', to: 'To', replyTo: 'Reply-to', cc: 'CC', bcc: 'BCC',
    preview: 'Preview', object: 'Template fields', payload: 'Payload', save: 'Apply content', send: 'Review and send', sending: 'Sending...',
    oneTimeAttachments: 'One-time attachments (combined maximum 450 KB)', oneFileAttached: 'One file attached', filesAttachedPrefix: 'Files attached:',
    reusableAttachments: 'Reusable attachments', reusableAttachmentsDescription: 'Select saved attachment content.', emailAssets: 'Saved assets',
    templates: 'Templates', attachments: 'Attachments', assetsTitle: 'Templates and attachments', assetsDescription: 'Assets belong to this module instance.',
    useTemplate: 'Use template', templateRenderFailed: 'Could not apply template', invalidJson: 'Invalid JSON', attachmentsGuide: 'Save reusable HTML templates in the Assets tab.'
  };
  let tab = $state('builder'), state = $state({ templates: [], components: [], snippets: [], attachments: [] });
  let html = $state(''), resend = $state({}), editorView = $state('preview');
  let loading = $state(true), loaded = $state(false), saving = $state(false), sending = $state(false), error = $state(''), message = $state('');
  let attachments = $state([]), selected = $state([]), modes = $state({});
  let assetName = $state(''), assetContent = $state(''), collection = $state('templates'), confirming = $state(false);
  let template = $state('zero');
  let object = $state({});
  let communicationModules=$state([]),communicationId=$state(''),contactData=$state(null),contactLoading=$state(false),recipientGroup=$state('all'),bulkSelected=$state([]),bulkConfirming=$state(false),bulkPermission=$state(false),bulkPending=$state(null),checkedProviderLogs=$state(false);
  let recipientSearch=$state('');
  const bulkRows=$derived((contactData?(recipientGroup==='all'?contactData.all_contacts:contactData.groups.find(group=>group.id===recipientGroup)?.contacts??[]):[]).filter(contact=>`${contact.email} ${contact.name??''}`.toLowerCase().includes(recipientSearch.toLowerCase())));
  const optedOut=$derived(new Set((contactData?.all_contacts??[]).filter(contact=>contact.unsubscribed).map(contact=>contact.email)));
  const usableRecipients=$derived([...new Set(bulkRows.map(contact=>contact.email))].filter(email=>!optedOut.has(email)));
  async function loadContacts(){contactLoading=true;error='';try{contactData=await request({action:'communication-contacts',communication_id:communicationId});bulkSelected=[];recipientGroup='all';}catch(reason){error=reason.message;contactData=null;}finally{contactLoading=false;}}
  function reviewBulk(){
    error='';if(!bulkPending&&(!bulkSelected.length||bulkSelected.length>100)){error='Select 1–100 contacts for this private batch.';return;}
    if(!bulkPending&&(attachments.length||selected.length)){error='Private batches do not support attachments. Remove the selected attachments first.';return;}
    bulkPermission=false;bulkConfirming=true;
  }
  async function sendBulk(){
    if(!bulkPermission||sending)return;sending=true;bulkConfirming=false;error='';message='';
    if(!bulkPending){const request_id=Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');bulkPending={action:'send-private-batch',communication_id:communicationId,group:recipientGroup,selected_emails:[...bulkSelected],request_id,confirm_send:true,confirm_recipient_permission:true,email:{from:resend.from??'',subject:resend.subject??'',html,...(resend.replyTo?{reply_to:resend.replyTo}:{})}};}
    try{const result=await request(bulkPending);message=`Resend accepted ${result.count} individually addressed messages. Other recipients are not included in their To/CC/BCC fields. Acceptance is not delivery confirmation.`;bulkPending=null;bulkSelected=[];checkedProviderLogs=false;}
    catch(reason){error=reason.message+' Keep this request unchanged when retrying.';}
    finally{sending=false;}
  }
  function showConfirmation(dialog) {
    dialog.showModal();
    dialog.querySelector('[data-cancel]')?.focus();
    parent.postMessage({type:'workspace:dialog',open:true},'*');
    return { destroy(){ parent.postMessage({type:'workspace:dialog',open:false},'*'); if(dialog.open)dialog.close(); } };
  }
  async function request(payload) {
    const response = await moduleRequest('module', payload ? { method: 'POST', body: JSON.stringify(payload) } : {});
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Email operation failed.');
    return result;
  }
  async function load() {
    loading = true; error = '';
    try { state = await request();communicationModules=state.communication_modules??[]; html = state.draft?.html ?? ''; resend = state.draft?.resend ?? {}; template = state.draft?.template ?? 'zero'; object = state.draft?.fields ?? {}; loaded = true; }
    catch (reason) { error = reason.message; }
    finally { loading = false; }
  }
  onMount(load);
  async function save(payload, success) {
    saving = true; error = ''; message = '';
    try { state = await request(payload); message = success; return true; }
    catch (reason) { error = reason.message; return false; }
    finally { saving = false; }
  }
  const saveDraft = () => save({ action: 'draft', draft: { html, resend, template, fields: object } }, 'Draft saved. No email was sent.');
  async function saveAsset() {
    if (await save({ action: 'asset', collection, asset: { name: assetName, content: assetContent } }, 'Asset saved.')) { assetName = ''; assetContent = ''; }
  }
  function applyTemplate(asset) {
    template = asset.name ?? 'zero'; object = templateFields(asset.content ?? '', object);
    html = renderTemplate(asset.content ?? '', object); editorView = 'preview'; confirming = false;
  }
  function applyFields(value) {
    try {
      object = validateFields(value);
      const asset = state.templates.find(asset => asset.name === template);
      if (!asset) throw new Error('Select a saved template first.');
      html = renderTemplate(asset.content, object); confirming = false; error = '';
      message = 'Template fields applied. Save the draft to retain them.';
    } catch (reason) { error = reason.message; }
  }
  function applyPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { error = 'Payload must be an object.'; return; }
    if (value.audience) { error = 'Choose explicit recipients. Bulk audience delivery is not enabled.'; return; }
    html = String(value.html ?? html);
    const headers = {};
    for (const key of ['from', 'to', 'subject', 'replyTo', 'cc', 'bcc']) headers[key] = Array.isArray(value[key]) ? value[key].join(', ') : String(value[key] ?? '');
    headers.replyTo = String(value.reply_to ?? headers.replyTo);
    resend = headers; confirming = false;
    message = 'Payload applied. Save the draft to retain it.';
  }
  async function send() {
    if (!confirming || sending) return;
    sending = true; error = ''; message = ''; confirming = false;
    const reusable = state.attachments.filter(asset => selected.includes(asset.name)).map(asset => ({
      filename: asset.name, content: asset.content,
      ...(modes[asset.name] === 'cid' ? { content_id: asset.content_id } : {})
    }));
    try {
      const result = await request({ action: 'send', confirm_send: true, email: { ...resend, html, attachments: [...attachments, ...reusable] } });
      message = 'Resend accepted the email (' + result.id + '). Acceptance does not guarantee delivery.';
    } catch (reason) {
      error = reason.message === 'The calling component is not enabled or ready.'
        ? 'Enable the Email module in Workspace and complete its required integration setup before sending. Core blocked this request before contacting the email provider; no email was sent by this request.'
        : reason.message + ' Check provider logs before retrying; a timeout does not prove that no email was sent.';
    }
    finally { sending = false; }
  }
</script>
<main>
<nav class="flex gap _2" aria-label="Email views">
  <button class:active={tab === 'builder'} onclick={() => tab = 'builder'}>Builder</button>
  <button class:active={tab === 'assets'} onclick={() => tab = 'assets'}>Assets</button>
  <button class:active={tab==='communication'} onclick={()=>tab='communication'}>Communication recipients</button>
  <button onclick={saveDraft} disabled={!loaded || loading || saving}>{saving ? 'Saving...' : 'Save draft'}</button>
</nav>
{#if error}<p role="alert">{error}</p>{/if}
{#if message}<p role="status">{message}</p>{/if}
{#if loading}<p>Loading saved content...</p>
{:else if !loaded}<button onclick={load}>Retry loading saved content</button>
{:else if tab === 'builder'}
  <EmailBuilder {i18n} {html} {resend} {editorView} {sending} {attachments} {template} {object} templates={state.templates.map(asset => asset.name)}
    audienceEnabled={false} creditsEnabled={false} aiEnabled={false}
    reusableTemplates={state.templates} reusableAttachments={state.attachments}
    selectedReusableAttachments={selected} attachmentModes={modes}
    onEditorViewChange={value => editorView = value}
    onTemplateChange={value => { template = value; applyTemplate(state.templates.find(asset => asset.name === value) ?? { content: '' }); }}
    onResendChange={value => { resend = value; confirming = false; }}
    onHtmlSave={value => { html = value; template = 'zero'; object = {}; confirming = false; message = 'Content applied. Save the draft to retain it.'; }}
    onPayloadSave={applyPayload} onReusableTemplateApply={applyTemplate}
    onObjectSave={applyFields}
    onAttachmentsChange={value => { attachments = value; confirming = false; }}
    onReusableAttachmentToggle={name => { selected = selected.includes(name) ? selected.filter(value => value !== name) : [...selected, name]; confirming = false; }}
    onReusableAttachmentsClear={() => selected = []}
    onAttachmentModeChange={(name, value) => modes = { ...modes, [name]: value }}
    onSend={() => { confirming = true; message = ''; }} />
  {#if confirming}
    <dialog class="email-confirmation" use:showConfirmation aria-labelledby="email-confirm-title" oncancel={()=>confirming=false} onclose={()=>confirming=false}>
      <header><div><small>REVIEW / SEND EMAIL</small><h2 id="email-confirm-title">Confirm this email</h2></div><button type="button" aria-label="Close email confirmation" onclick={()=>confirming=false}>×</button></header>
      <dl><div><dt>From</dt><dd>{resend.from || 'Not set'}</dd></div><div><dt>To</dt><dd>{resend.to || 'Not set'}</dd></div><div><dt>CC</dt><dd>{resend.cc || 'None'}</dd></div><div><dt>BCC</dt><dd>{resend.bcc || 'None'}</dd></div><div><dt>Subject</dt><dd>{resend.subject || 'Not set'}</dd></div><div><dt>Attachments</dt><dd>{attachments.length+selected.length}</dd></div></dl>
      <p class="send-warning">This sends a real email through the configured Resend account. Check the recipients before confirming.</p>
      <footer><button type="button" onclick={()=>confirming=false} data-cancel>Cancel</button><button type="button" class="button _primary" onclick={send} disabled={sending}>Confirm and send</button></footer>
    </dialog>
  {/if}
{:else if tab==='communication'}
  <section class="box _outer _padding grid gap _2"><h2>Communication recipients</h2><p>Send the current applied message as separate emails. A contact account is not proof of consent; confirm your permission to contact the selected people. Known Resend opt-outs are excluded.</p><label>Communication module<select bind:value={communicationId} disabled={!!bulkPending||sending} onchange={()=>{contactData=null;bulkSelected=[];}}><option value="">Choose a module</option>{#each communicationModules as module}<option value={module.id}>{module.name} · {module.id}</option>{/each}</select></label>{#if !communicationModules.length}<p>No enabled Communication module is available in the same source and Application context.</p>{/if}<button onclick={loadContacts} disabled={!communicationId||contactLoading||sending||!!bulkPending}>{contactLoading?'Loading sources…':'Load contact groups'}</button>
  {#if contactData}{#each contactData.setup??[] as note}<p>{note}</p>{/each}{#each contactData.groups.filter(group=>group.status!=='ready') as group}<p role="alert">{group.error}</p>{/each}<label>Group<select bind:value={recipientGroup} disabled={!!bulkPending||sending} onchange={()=>bulkSelected=[]}><option value="all">All configured sources</option>{#each contactData.groups as group}<option value={group.id}>{group.label}</option>{/each}</select></label><p>{bulkSelected.length} selected · maximum 100 per private batch. Attachments are not supported by the provider's batch API.</p><div class="flex gap _2"><button onclick={()=>bulkSelected=usableRecipients.slice(0,100)} disabled={!!bulkPending||sending}>Select up to 100</button><button onclick={()=>bulkSelected=[]} disabled={!!bulkPending||sending}>Clear selection</button></div><label>Search recipients<input type="search" bind:value={recipientSearch} disabled={!!bulkPending||sending} placeholder="Email or name"></label><p>Up to 200 matching addresses are displayed; refine the search for larger lists. Builder To/CC/BCC fields are not used in this mode.</p><div class="recipient-list">{#each [...new Set(bulkRows.map(contact=>contact.email))].slice(0,200) as email}<label><input type="checkbox" value={email} bind:group={bulkSelected} disabled={optedOut.has(email)||!!bulkPending||sending}>{email}{optedOut.has(email)?' · Unsubscribed':''}</label>{:else}<p>No contacts in this group.</p>{/each}</div><button onclick={reviewBulk} disabled={sending||contactLoading||contactData.groups.some(group=>group.status!=='ready')||(!bulkPending&&!bulkSelected.length)}>{bulkPending?'Review unchanged retry':'Review private batch'}</button>{/if}
  {#if bulkPending}<p role="alert">A send request is awaiting confirmation. Retrying keeps its original content, recipients and duplicate-protection key.</p><label><input type="checkbox" bind:checked={checkedProviderLogs}> I checked provider logs and understand a new request can send duplicates.</label><button disabled={!checkedProviderLogs||sending} onclick={()=>{bulkPending=null;checkedProviderLogs=false;}}>Discard retry and prepare a new request</button>{/if}
  </section>
  {#if bulkConfirming}<dialog class="email-confirmation" use:showConfirmation aria-labelledby="bulk-confirm-title" oncancel={()=>bulkConfirming=false} onclose={()=>bulkConfirming=false}><header><h2 id="bulk-confirm-title">Confirm private batch</h2><button aria-label="Close confirmation" onclick={()=>bulkConfirming=false}>×</button></header><dl><div><dt>Recipients</dt><dd>{bulkPending?.selected_emails.length??bulkSelected.length} individually addressed emails</dd></div><div><dt>From</dt><dd>{bulkPending?.email.from??resend.from??'Not set'}</dd></div><div><dt>Subject</dt><dd>{bulkPending?.email.subject??resend.subject??'Not set'}</dd></div></dl><p class="send-warning">This sends real emails. No shared To, CC or BCC list is used. The server checks the current group membership and opt-outs again.</p><label class="bulk-permission"><input type="checkbox" bind:checked={bulkPermission}> I reviewed this selection and have permission to contact these recipients.</label><footer><button data-cancel onclick={()=>bulkConfirming=false}>Cancel</button><button disabled={!bulkPermission||sending} onclick={sendBulk}>Confirm private send</button></footer></dialog>{/if}
{:else}
  <section class="box _outer _padding grid gap _2">
    <h2>Reusable content</h2>
    <label>Collection<select bind:value={collection}><option value="templates">HTML templates</option><option value="components">HTML components</option><option value="snippets">HTML snippets</option></select></label>
    <label>Name<input bind:value={assetName} maxlength="160"></label>
    <label>HTML content<textarea bind:value={assetContent} rows="12"></textarea></label>
    <div class="flex gap _2"><button class="button _primary" onclick={saveAsset} disabled={saving || !assetName.trim()}>Save asset</button><button onclick={() => assetContent = html}>Use current message</button></div>
    <p>Templates are HTML with optional {'{{field_name}}'} text placeholders, not executable JavaScript. AI generation is not connected. Individually addressed batches are managed in Communication recipients.</p>
    {#each state[collection] ?? [] as asset}
      <article class="box _outer _padding flex gap _2"><strong>{asset.name}</strong><button onclick={() => { assetName = asset.name; assetContent = asset.content; }}>Edit</button><button onclick={() => { applyTemplate(asset); tab = 'builder'; }}>Use content</button></article>
    {/each}
  </section>
{/if}
</main>
<style>.recipient-list{display:grid;gap:4px;max-height:340px;overflow:auto;border:1px solid #d0d5dd;border-radius:8px;padding:12px;min-width:0}.recipient-list label{display:flex;align-items:start;gap:10px;padding:8px;overflow-wrap:anywhere}.recipient-list input,.bulk-permission input{width:18px;min-width:18px;height:18px;margin:3px 0;accent-color:#946600}.bulk-permission{display:flex;gap:10px;margin:16px 24px;font-size:14px;line-height:1.6}.recipient-list label:has(input:disabled){color:#667085}main{padding:16px}nav{margin-bottom:16px}section{margin:20px 0}article{align-items:center;justify-content:space-between}p[role="alert"]{color:#b42318}p[role="status"]{color:#067647}:global(.render-frame){width:100%;min-height:400px;border:1px solid var(--override-border)}.email-confirmation{position:fixed;inset:0;margin:auto;width:min(600px,calc(100% - 32px));max-height:calc(100dvh - 40px);box-sizing:border-box;padding:0;border:1px solid var(--override-border,#d0d5dd);border-radius:12px;background:var(--override-section,#fff);color:var(--override-text,#344054);box-shadow:0 30px 90px #10182840;overflow:auto;font-family:system-ui,sans-serif}.email-confirmation::backdrop{background:#10182877;backdrop-filter:blur(4px)}.email-confirmation header{display:flex;align-items:start;justify-content:space-between;gap:20px;padding:24px;border-bottom:1px solid var(--override-border,#d0d5dd)}.email-confirmation h2{margin:8px 0 0;color:var(--override-heading,#101828);font-size:1.4rem}.email-confirmation small{color:var(--override-muted,#667085);font:10px ui-monospace,monospace;letter-spacing:.1em}.email-confirmation header button{min-width:36px;min-height:36px;font-size:22px}.email-confirmation dl{display:grid;gap:0;margin:0;padding:8px 24px}.email-confirmation dl>div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:16px;padding:12px 0;border-bottom:1px solid var(--override-border,#d0d5dd)}.email-confirmation dt{color:var(--override-muted,#667085);font-size:.85rem}.email-confirmation dd{margin:0;overflow-wrap:anywhere;font-size:.9rem}.send-warning{margin:16px 24px;padding:14px;border-left:3px solid #a47700;background:#fffcf2;color:#51421d;font-size:.85rem;line-height:1.6}.email-confirmation footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;padding:20px 24px;border-top:1px solid var(--override-border,#d0d5dd)}.email-confirmation button{min-height:44px;padding:10px 16px;border-radius:6px;cursor:pointer}.email-confirmation button:focus-visible{outline:3px solid #8a6200;outline-offset:3px}@media(max-width:480px){.email-confirmation dl>div{grid-template-columns:1fr;gap:6px}.email-confirmation header,.email-confirmation footer{padding:20px}}</style>
