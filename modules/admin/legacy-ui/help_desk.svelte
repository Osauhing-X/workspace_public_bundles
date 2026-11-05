<svelte:options runes={false} />

<script>
  import { page } from '$app/stores';
  import { openMailDraft } from './context.js';
  import { timeAgo } from '$lib/assets/scripts/helpers';

  export let data = null;
  export let mode = 'help';
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  const emptyDraft = {
    id: '',
    kind: 'abi',
    status: 'new',
    priority: 'normal',
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    target: { scope: 'one', id: '', emails: [], companies: [], groups: [], should_send: true },
    attachments: [],
    metadata: {}
  };

  let status = 'active';
  let kind = mode === 'help' ? 'abi' : 'all';
  let search = '';
  let saving = '';
  let localRows = null;
  let discordMessages = [];
  let discordReply = '';
  let discordLoading = false;
  let draft = { ...emptyDraft, target: { ...emptyDraft.target }, metadata: { ...emptyDraft.metadata } };
  $: if (mode === 'help' && kind !== 'abi') kind = 'abi';
  $: if (mode !== 'help' && kind === 'abi') kind = 'all';

  function normalizeRow(item = {}) {
    const target = typeof item.target === 'object' && item.target ? item.target : {};
    const kindAliases = {
      support: 'abi',
      help: 'abi',
      message: 'teavitus',
      notice: 'teavitus',
      offer: 'pakkumine',
      contact: 'kontakt'
    };
    const normalizedKind = kindAliases[item.kind] || item.kind || (item.source === 'contact_form' ? 'abi' : 'teavitus');
    return {
      ...item,
      kind: normalizedKind,
      status: item.status || 'new',
      priority: item.priority || 'normal',
      message: item.message ?? item.text ?? '',
      target: {
        scope: target.scope || 'one',
        id: target.id || '',
        emails: Array.isArray(target.emails) ? target.emails : [],
        companies: Array.isArray(target.companies) ? target.companies : [],
        groups: Array.isArray(target.groups) ? target.groups : [],
        should_send: target.should_send !== false
      },
      metadata: typeof item.metadata === 'object' && item.metadata ? item.metadata : {},
      attachments: Array.isArray(item.attachments) ? item.attachments : []
    };
  }

  function listText(value) {
    return Array.isArray(value) ? value.join(', ') : String(value || '');
  }

  function updateTargetList(key, value) {
    draft = {
      ...draft,
      target: {
        ...(draft.target || {}),
        [key]: String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
      }
    };
  }

  function scopedKind(item = {}) {
    return mode === 'help'
      ? item.kind === 'abi'
      : ['kontakt', 'pakkumine', 'teavitus'].includes(item.kind);
  }

  $: requests = (Array.isArray(localRows) ? localRows : (Array.isArray(adminData.help_requests) ? adminData.help_requests : [])).map(normalizeRow).filter(scopedKind);
  $: recipientOptions = buildRecipientOptions();
  $: rows = requests
    .filter((item) => kind === 'all' || item.kind === kind)
    .filter((item) => {
      if (status === 'all') return true;
      if (status === 'active') return !['done', 'spam', 'archived'].includes(item.status);
      return item.status === status;
    })
    .filter((item) => {
      const q = search.trim().toLowerCase();
      return !q || [item.email, item.name, item.subject, item.message, item.status, item.kind, item.priority]
        .some((value) => String(value ?? '').toLowerCase().includes(q));
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  $: counts = {
    all: requests.length,
    active: requests.filter((item) => !['done', 'spam', 'archived'].includes(item.status)).length,
    abi: requests.filter((item) => item.kind === 'abi').length,
    pakkumine: requests.filter((item) => item.kind === 'pakkumine').length,
    urgent: requests.filter((item) => item.priority === 'urgent' || item.priority === 'high').length
  };

  function resetDraft() {
    draft = { ...emptyDraft, kind: mode === 'help' ? 'abi' : 'kontakt', target: { ...emptyDraft.target }, metadata: { ...emptyDraft.metadata } };
  }

  async function selectRow(item) {
    draft = {
      ...emptyDraft,
      ...normalizeRow(item),
      target: { ...(item.target || {}) },
      metadata: { ...(item.metadata || {}) }
    };
    discordMessages = [];
    if (item.discord_thread_id) await loadDiscordMessages(item.discord_thread_id);
  }

  async function loadDiscordMessages(threadId = draft.discord_thread_id) {
    if (!threadId) return;
    discordLoading = true;
    const response = await fetch(`/@_api/admin/help?thread_id=${encodeURIComponent(threadId)}`);
    const result = await response.json().catch(() => ({}));
    discordLoading = false;
    discordMessages = response.ok ? (result.messages ?? []) : [];
    if (!response.ok) saving = result.error || 'Discord messages failed to load';
  }

  async function sendDiscordReply() {
    if (!draft.id || !draft.discord_thread_id || !discordReply.trim()) return;
    discordLoading = true;
    const response = await fetch('/@_api/admin/help', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discord_reply', id: draft.id, discord_thread_id: draft.discord_thread_id, message: discordReply })
    });
    const result = await response.json().catch(() => ({}));
    discordLoading = false;
    if (!response.ok) { saving = result.error || 'Discord reply failed'; return; }
    discordReply = '';
    syncRow({ ...draft, ...result, metadata: { ...(result.metadata ?? {}), workspace_help: true } });
    await loadDiscordMessages(draft.discord_thread_id);
  }

  function syncRow(row) {
    const next = normalizeRow(row);
    const list = requests.some((item) => item.id === next.id)
      ? requests.map((item) => item.id === next.id ? next : item)
      : [next, ...requests];
    localRows = list;
    selectRow(next);
  }

  async function saveRow() {
    if (!draft.subject && !draft.message) return;
    saving = 'Saving...';
    const response = await fetch('/@_api/admin/help', {
      method: draft.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      saving = result.error || 'Save failed';
      return;
    }
    syncRow(result);
    saving = 'Saved';
  }

  async function removeRow(item = draft) {
    if (!item.id || !confirm('Delete this row')) return;
    saving = 'Deleting...';
    const response = await fetch('/@_api/admin/help', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, workspace_help: !!item.metadata?.workspace_help })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      saving = result.error || 'Delete failed';
      return;
    }
    localRows = requests.filter((row) => row.id !== item.id);
    resetDraft();
    saving = 'Deleted';
  }

  async function setStatus(item, nextStatus) {
    const next = { ...normalizeRow(item), status: nextStatus };
    draft = next;
    await saveRow();
  }

  function replyTo(item) {
    const row = normalizeRow(item);
    openMailDraft({
      to: row.email,
      subject: row.subject ? `Re: ${row.subject}` : 'Re: Extaas',
      text: `Tere!\n\n`
    });
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function buildRecipientOptions() {
    const map = new Map();
    const sources = [
      ['Workspace', adminData.customer_users_data?.users],
      ['Staff', adminData.users_data?.users],
      ['Stripe', adminData.stripe_data?.customers]
    ];

    for (const [source, rows] of sources) {
      for (const row of Array.isArray(rows) ? rows : []) {
        const email = normalizeEmail(row.email || row.object?.email);
        if (!email || map.has(email)) continue;
        map.set(email, {
          email,
          id: row.id || row.object?.id || email,
          name: row.name || row.object?.name || row.user_metadata?.full_name || email,
          source
        });
      }
    }

    return [...map.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }

  function selectRecipient(value) {
    const recipient = recipientOptions.find((item) => item.email === value);
    if (!recipient) return;
    draft = {
      ...draft,
      name: recipient.name,
      email: recipient.email,
      target: {
        ...(draft.target || {}),
        id: recipient.id,
        emails: [recipient.email],
        scope: 'one'
      },
      metadata: {
        ...(draft.metadata || {}),
        me_dialog: true,
        recipient_source: recipient.source
      }
    };
  }
</script>

<section class="help-desk grid gap _5">
  <header class="flex gap _3 _space _wrap">
    <div class="grid gap _1">
      <small>{mode === 'help' ? 'help desk' : 'kirjavahetus'}</small>
      <h2>{mode === 'help' ? 'Help' : 'Kontaktid, pakkumised ja teavitused'}</h2>
      <p>{mode === 'help' ? 'Abi- ja support pöördumised ühes töövoos.' : 'Contact form rows, offers and staff notices live in one workflow.'}</p>
    </div>
    <div class="flex gap _2 _wrap">
      <span class="metric"><b>{counts.active}</b> active</span>
      <span class="metric"><b>{counts.pakkumine}</b> offers</span>
      <span class="metric"><b>{counts.urgent}</b> urgent</span>
      {#if saving}<span class="metric">{saving}</span>{/if}
    </div>
  </header>

  <div class="tools flex gap _2 _wrap">
    <input placeholder="Search email, subject, message..." bind:value={search}>
    <select bind:value={kind}>
      {#if mode === 'help'}
        <option value="abi">Help</option>
      {:else}
        <option value="all">All kinds</option>
        <option value="kontakt">Contact</option>
        <option value="pakkumine">Offer</option>
        <option value="teavitus">Notice</option>
      {/if}
    </select>
    <select bind:value={status}>
      <option value="active">Active</option>
      <option value="all">All statuses</option>
      <option value="new">New</option>
      <option value="open">Open</option>
      <option value="waiting">Waiting</option>
      <option value="done">Done</option>
      <option value="archived">Archived</option>
      <option value="spam">Spam</option>
    </select>
    <button type="button" class="btn _transparent" on:click={resetDraft}>New row</button>
  </div>

  <div class="desk-grid gap _3 grid">
    <div class="request-list grid gap _2">
      {#each rows as item}
        <button type="button" class="request-card gap grid" class:active={draft.id === item.id} on:click={() => selectRow(item)}>
          <span class="flex gap _2 _space">
            <b>{item.subject || 'No subject'}</b>
            <small>{item.kind}</small>
          </span>
          <span>{item.email || item.name || 'No contact'}</span>
          <small>{item.status} / {item.priority} / {timeAgo(item.created_at)}</small>
        </button>
      {:else}
        <article class="empty grid gap _2">
          <strong>No rows found</strong>
          <p>Contact form, offers and notices will appear here after they are saved.</p>
        </article>
      {/each}
    </div>

    <article class="editor grid gap _3">
      <header class="flex gap _2 _space _wrap">
        <div>
          <small>{draft.id ? 'edit row' : 'new row'}</small>
          <h3>{draft.subject || 'Kirjavahetus'}</h3>
        </div>
        <div class="flex gap _2 _wrap">
          {#if draft.id}
            <button type="button" class="btn _transparent" on:click={() => replyTo(draft)} disabled={!draft.email}>Reply</button>
            <button type="button" class="btn _transparent" on:click={() => removeRow(draft)}>Delete</button>
          {/if}
          <button type="button" class="btn" on:click={saveRow} disabled={!draft.subject && !draft.message}>Save</button>
        </div>
      </header>

      <div class="form-grid gap _2 grid">
        <label class="grid gap"><span>Kind</span><select bind:value={draft.kind}>
          {#if mode === 'help'}
            <option value="abi">Help</option>
          {:else}
            <option value="kontakt">Contact</option>
            <option value="pakkumine">Offer</option>
            <option value="teavitus">Notice</option>
          {/if}
        </select></label>
        <label class="grid gap"><span>Status</span><select bind:value={draft.status}>
          <option value="new">New</option>
          <option value="open">Open</option>
          <option value="waiting">Waiting</option>
          <option value="done">Done</option>
          <option value="archived">Archived</option>
          <option value="spam">Spam</option>
        </select></label>
        <label class="grid gap"><span>Priority</span><select bind:value={draft.priority}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select></label>
        <label class="grid gap"><span>Target</span><select bind:value={draft.target.scope}>
          <option value="one">One person</option>
          <option value="person">Person list</option>
          <option value="company">Company</option>
          <option value="group">Group</option>
          <option value="all">All</option>
        </select></label>
        <label class="check gap flex _2"><input type="checkbox" bind:checked={draft.target.should_send}> <span>Send to selected target</span></label>
      </div>

      <div class="form-grid gap _2 grid">
        {#if mode !== 'help'}
          <label class="grid gap"><span>Saaja</span><select value={draft.email} on:change={(event) => selectRecipient(event.currentTarget.value)}>
            <option value="">Vali kasutajate listist</option>
            {#each recipientOptions as recipient}
              <option value={recipient.email}>{recipient.name} ({recipient.email}) - {recipient.source}</option>
            {/each}
          </select></label>
        {/if}
        <label class="grid gap"><span>Name</span><input bind:value={draft.name} placeholder="Contact name"></label>
        <label class="grid gap"><span>Email</span><input type="email" bind:value={draft.email} placeholder="client@example.com"></label>
        <label class="grid gap"><span>Phone</span><input bind:value={draft.phone} placeholder="+372"></label>
        <label class="grid gap"><span>Target id</span><input bind:value={draft.target.id} placeholder="company, user or group id"></label>
      </div>

      <div class="form-grid gap _2 grid">
        <label class="grid gap"><span>Target emails</span><input value={listText(draft.target.emails)} on:input={(event) => updateTargetList('emails', event.currentTarget.value)} placeholder="one@example.com, two@example.com"></label>
        <label class="grid gap"><span>Companies</span><input value={listText(draft.target.companies)} on:input={(event) => updateTargetList('companies', event.currentTarget.value)} placeholder="company id, registry code or Stripe customer"></label>
        <label class="grid gap"><span>Groups</span><input value={listText(draft.target.groups)} on:input={(event) => updateTargetList('groups', event.currentTarget.value)} placeholder="vip, tenants, newsletter"></label>
      </div>

      <label class="grid gap _1">
        <span>Subject</span>
        <input bind:value={draft.subject} placeholder="Short title">
      </label>
      <label class="grid gap _1">
        <span>Message</span>
        <textarea rows="9" bind:value={draft.message} placeholder="Write the message, offer or internal note..."></textarea>
      </label>

      {#if draft.discord_thread_id}
        <section class="discord-chat grid gap _2">
          <header class="flex _space gap _2 _wrap">
            <div><strong>Discord conversation</strong><small> Thread {draft.discord_thread_id}</small></div>
            <button type="button" class="btn _transparent" on:click={() => loadDiscordMessages()} disabled={discordLoading}>Refresh</button>
          </header>
          <div class="discord-messages grid gap _2">
            {#each discordMessages as item}
              <article class:pinned={item.pinned}><strong>{item.author?.name || 'Discord'}</strong><p>{item.content}</p><small>{timeAgo(item.created_at)}</small>
                {#if item.attachments?.length}<div class="discord-attachments">{#each item.attachments as file}<a href={file.url} target="_blank" rel="noreferrer">{#if file.content_type?.startsWith('image/')}<img src={file.url} alt={file.filename}>{:else}{file.filename}{/if}</a>{/each}</div>{/if}
              </article>
            {:else}
              <small>{discordLoading ? 'Loading conversation...' : 'No Discord messages.'}</small>
            {/each}
          </div>
          <label class="grid gap _1"><span>Reply in Discord</span><textarea rows="4" bind:value={discordReply} maxlength="2000"></textarea></label>
          <button type="button" class="btn" on:click={sendDiscordReply} disabled={discordLoading || !discordReply.trim()}>Send reply</button>
        </section>
      {/if}

      {#if Array.isArray(draft.attachments) && draft.attachments.length}
        <div overflow>
          <table>
            <thead><tr><th>Attachment</th><th>Size</th></tr></thead>
            <tbody>
              {#each draft.attachments as file}
                <tr><td>{file.filename || file.name}</td><td>{file.bytes || '-'}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if draft.id}
        <div class="flex gap _2 _wrap">
          <button type="button" class="btn _transparent" on:click={() => setStatus(draft, 'open')}>Open</button>
          <button type="button" class="btn _transparent" on:click={() => setStatus(draft, 'waiting')}>Waiting</button>
          <button type="button" class="btn _transparent" on:click={() => setStatus(draft, 'done')}>Done</button>
        </div>
      {/if}
    </article>
  </div>
</section>

<style>
  .help-desk {
    width: min(1200px, 100%);
    margin: 0 auto;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  .metric,
  .tools,
  .editor,
  .empty {
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: var(--x_color_transparent_auto);
  }

  .metric {
    padding: 8px 10px;
    color: var(--x_text_color);
  }

  .metric b {
    color: var(--reverse);
  }

  .tools,
  .editor,
  .empty {
    padding: 12px;
  }

  .desk-grid {    grid-template-columns: minmax(260px, .75fr) minmax(320px, 1.25fr);
    align-items: start;
  }

  .request-list {
    max-height: 720px;
    overflow: auto;
    padding-right: 3px;
  }

  .request-card {    width: 100%;
    text-align: left;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--x_body_background) 92%, var(--reverse));
  }

  .request-card.active {
    border-color: color-mix(in srgb, var(--x_color, #da3) 70%, transparent);
    box-shadow: inset 3px 0 0 var(--x_color, #da3);
  }

  .request-card span:not(.flex),
  .request-card small,
  label span,
  p {
    color: color-mix(in srgb, var(--reverse) 68%, transparent);
  }

  .form-grid {    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  label.check {    align-items: center;  }

  textarea {
    resize: vertical;
  }

  .discord-chat { border-top: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent); padding-top: 14px; }
  .discord-messages { max-height: 360px; overflow: auto; }
  .discord-messages article { padding: 10px; border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent); border-radius: 8px; }
  .discord-messages article.pinned { border-left: 4px solid #d92d20; }
  .discord-messages p { white-space: pre-wrap; }
  .discord-attachments { columns: 180px; margin-top: 8px; }
  .discord-attachments img { display: block; width: 100%; max-height: 240px; object-fit: cover; border-radius: 6px; }

  @media (max-width: 900px) {
    .desk-grid {
      grid-template-columns: 1fr;
    }

    .request-list {
      max-height: 360px;
    }
  }
</style>
