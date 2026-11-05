<svelte:options runes={false} />

<script>
  import { page } from '$app/stores';
  import EmailBuilder from '$lib/site/modules/email/email_builder.svelte';
  import { mail_draft } from '$lib/site/modules/admin/context.js';
  import { remoteI18n } from '$lib/site/core_scripts/remote_i18n.js';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  const remote = remoteI18n('modules_email');
  $: i18n = {
    ...$remote,
    composerEyebrow: 'Staff email',
    composerTitle: 'Send platform email',
    composerDescription: 'Compose, preview and send direct Extaas email with the same builder used by tenant workspaces.',
    reusableAttachments: 'Assets',
    reusableAttachmentsDescription: 'Templates and reusable attachments live in the staff email assets layer. Select the files that should travel with this message.',
    assets: 'Assets',
    emailAssets: 'Email assets',
    assetsTitle: 'Reusable templates and attachments',
    assetsDescription: 'Use staff-approved snippets and persistent attachments without leaving the composer.',
    useTemplate: 'Apply asset'
  };

  let editorView = 'preview';
  let html = '<p>Tere!</p><p>Kirjuta kiri siia.</p>';
  let object = {};
  let resend = {
    subject: '',
    from: 'Extaas <server@extaas.com>',
    to: '',
    replyTo: 'mail@extaas.com'
  };
  let result = null;
  let renderError = null;
  let sending = false;
  let attachments = [];
  let template = 'zero';
  let selectedReusableAttachments = [];
  let appliedDraft = null;
  let emailAssets = [];
  let assetSaving = false;
  let assetStatus = '';
  let assetDraft = blankAsset();
  const templates = ['support_reply', 'invoice_reminder', 'project_update'];
  const templateHtml = {
    support_reply: '<p>Tere!</p><p>Aitäh, et kirjutasid. Vaatasin teema üle ja annan kohe täpsema vastuse.</p><p>Parimat<br>Extaas</p>',
    invoice_reminder: '<p>Tere!</p><p>Saadan sõbraliku meeldetuletuse tasumata arve kohta. Kui makse on juba tehtud, anna palun teada.</p><p>Parimat<br>Extaas</p>',
    project_update: '<p>Tere!</p><p>Väike uuendus projekti seisust:</p><ul><li>Tehtud:</li><li>Järgmine samm:</li></ul><p>Parimat<br>Extaas</p>'
  };
  const builtinReusableTemplates = [
    {
      name: 'Support follow-up',
      description: 'Friendly response for contact form and support messages.',
      html: '<p>Tere!</p><p>Aitah, et kirjutasid. Vaatasin teema ule ja annan kohe tapsema vastuse.</p><p>Parimat<br>Extaas</p>'
    },
    {
      name: 'Invoice reminder',
      description: 'Short reminder for unpaid invoices.',
      html: '<p>Tere!</p><p>Saadan sobraliku meeldetuletuse tasumata arve kohta. Kui makse on juba tehtud, anna palun teada.</p><p>Parimat<br>Extaas</p>'
    },
    {
      name: 'Project update',
      description: 'Reusable structure for project status updates.',
      html: '<p>Tere!</p><p>Vaike uuendus projekti seisust:</p><ul><li>Tehtud:</li><li>Jargmine samm:</li></ul><p>Parimat<br>Extaas</p>'
    }
  ];
  const builtinReusableAttachments = [
    {
      name: 'Extaas company details',
      description: 'Company details for procurement and contact handover.',
      filename: 'extaas-company-details.txt',
      content: 'T3Nhw7xoaW5nIFgKRXh0YWFzCm1haWxAZXh0YWFzLmNvbQ=='
    },
    {
      name: 'Payment instructions',
      description: 'Reusable payment note for invoice follow-up emails.',
      filename: 'payment-instructions.txt',
      content: 'TWFrc2Ugc2VsZ2l0dXNzZSBsaXNhIGFydmUgbnVtYmVyLiBLw7xzaW11c3RlIGtvcnJhbCB2YXN0YSBzZWxsZWxlIGtpcmphbGUu'
    }
  ];

  $: reusableTemplates = [...builtinReusableTemplates, ...emailAssets.filter((asset) => ['template', 'snippet', 'component'].includes(asset.type) && asset.html)];
  $: reusableAttachments = [...builtinReusableAttachments, ...emailAssets.filter((asset) => asset.type === 'attachment' && (asset.content || asset.text || asset.html))];
  $: if (!emailAssets.length && Array.isArray(adminData.email_assets_data)) {
    emailAssets = adminData.email_assets_data.map(normalizeEmailAsset);
  }

  $: draftKey = $mail_draft ? JSON.stringify($mail_draft) : '';
  $: if (draftKey && draftKey !== appliedDraft) {
    resend = {
      ...resend,
      to: $mail_draft.to || resend.to,
      subject: $mail_draft.subject || resend.subject
    };
    if ($mail_draft.text) html = textToHtml($mail_draft.text);
    appliedDraft = draftKey;
  }

  function textToHtml(value = '') {
    return String(value)
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')}</p>`)
      .join('');
  }

  function htmlToText(value = '') {
    return String(value)
      .replace(/<br\s*\/>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  async function send() {
    if (!resend.to || !resend.subject || !html) return;
    if (!confirm(`Send email to ${resend.to}`)) return;

    sending = true;
    result = null;
    const reusable = reusableAttachments
      .filter((asset) => selectedReusableAttachments.includes(assetKey(asset)))
      .map(attachmentPayload)
      .filter(Boolean);
    const response = await fetch('/@_resend/our_domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        what: 'direct',
        ...resend,
        html,
        text: htmlToText(html),
        attachments: [...attachments, ...reusable].length ? [...attachments, ...reusable] : undefined
      })
    });
    const json = await response.json().catch(() => ({}));
    sending = false;
    result = json;
  }

  function changeTemplate(value) {
    template = value;
    if (templateHtml[value]) html = templateHtml[value];
  }

  function assetKey(asset = {}) {
    return asset.key || asset.id || asset.name || asset.filename || asset.label || '';
  }

  function blankAsset() {
    return {
      type: 'template',
      name: '',
      subject: '',
      filename: '',
      content: '',
      html: '',
      text: '',
      encoding: 'base64',
      content_type: 'text/plain'
    };
  }

  function normalizeEmailAsset(row = {}) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const filename = metadata.filename || String(row.storage_path || '').split('/').filter(Boolean).pop() || row.name;
    const content = metadata.content || row.text || row.html || '';
    return {
      ...row,
      key: row.id || row.name || filename,
      label: row.name || filename,
      description: row.subject || metadata.description || row.storage_path || filename,
      filename,
      content,
      encoding: metadata.encoding || (metadata.content ? 'base64' : 'text'),
      content_type: metadata.content_type || 'text/plain',
      html: row.html || (row.type === 'template' || row.type === 'snippet' ? row.text : '')
    };
  }

  function toBase64(value = '') {
    try {
      return btoa(unescape(encodeURIComponent(String(value))));
    } catch {
      return btoa(String(value));
    }
  }

  function attachmentPayload(asset = {}) {
    const filename = asset.filename || asset.name || asset.label;
    const raw = asset.content || asset.metadata?.content || asset.text || asset.html || '';
    if (!filename || !raw) return null;
    return {
      filename,
      content: asset.encoding === 'base64' || asset.metadata?.encoding === 'base64' ? raw : toBase64(raw),
      content_type: asset.content_type || asset.metadata?.content_type || 'text/plain'
    };
  }

  function toggleReusableAttachment(name) {
    if (!name) return;
    selectedReusableAttachments = selectedReusableAttachments.includes(name)
      ? selectedReusableAttachments.filter((item) => item !== name)
      : [...selectedReusableAttachments, name];
  }

  function clearReusableAttachments() {
    selectedReusableAttachments = [];
  }

  function readAssetFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      assetDraft = {
        ...assetDraft,
        name: assetDraft.name || file.name,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        encoding: 'base64',
        content: result.includes(',') ? result.split(',').pop() : result
      };
    };
    reader.readAsDataURL(file);
  }

  function applyReusableTemplate(asset) {
    if (!asset.html && !asset.text) return;
    html = asset.html || textToHtml(asset.text);
    if (asset.subject) resend = { ...resend, subject: asset.subject };
    template = 'zero';
    editorView = 'preview';
  }

  async function saveAsset() {
    if (!assetDraft.name.trim()) return;
    assetSaving = true;
    assetStatus = 'Saving...';
    const response = await fetch('/@_api/admin/email-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: assetDraft.type,
        name: assetDraft.name,
        subject: assetDraft.subject,
        filename: assetDraft.filename,
        content: assetDraft.content,
        html: assetDraft.type === 'attachment' ? '' : assetDraft.html,
        text: assetDraft.type === 'attachment' ? assetDraft.content : assetDraft.text,
        encoding: assetDraft.type === 'attachment' ? assetDraft.encoding : undefined,
        content_type: assetDraft.content_type || 'text/plain'
      })
    });
    const body = await response.json().catch(() => ({}));
    assetSaving = false;
    if (!response.ok) {
      assetStatus = body.error || 'Save failed';
      return;
    }
    emailAssets = [normalizeEmailAsset(body), ...emailAssets];
    assetDraft = blankAsset();
    assetStatus = 'Saved';
  }

  async function deleteAsset(asset) {
    if (!asset.id || !confirm(`Delete asset ${asset.name || asset.label}`)) return;
    const response = await fetch('/@_api/admin/email-assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      assetStatus = body.error || 'Delete failed';
      return;
    }
    emailAssets = emailAssets.filter((item) => item.id !== asset.id);
    selectedReusableAttachments = selectedReusableAttachments.filter((key) => key !== assetKey(asset));
    assetStatus = 'Deleted';
  }
</script>

<section class="staff-email-assets _padding grid gap _3 css">
  <header class="flex _space _center _y gap _wrap">
    <div class="grid gap">
      <small>Assets</small>
      <h2>Staff email assets</h2>
      <p>Lisa korduvkasutatav mall või manus. Builderi Assets popup kasutab sama nimekirja.</p>
    </div>
    {#if assetStatus}<span>{assetStatus}</span>{/if}
  </header>

  <form class="asset-form grid gap _2" on:submit|preventDefault={saveAsset}>
    <select bind:value={assetDraft.type} aria-label="Asset type">
      <option value="template">Template</option>
      <option value="snippet">Snippet</option>
      <option value="attachment">Attachment</option>
    </select>
    <input placeholder="Asset name" bind:value={assetDraft.name}>
    {#if assetDraft.type !== 'attachment'}
      <input placeholder="Subject" bind:value={assetDraft.subject}>
      <textarea rows="4" placeholder="HTML content" bind:value={assetDraft.html}></textarea>
    {:else}
      <input placeholder="Filename" bind:value={assetDraft.filename}>
      <input type="file" on:change={readAssetFile}>
      <select bind:value={assetDraft.encoding} aria-label="Attachment encoding">
        <option value="base64">base64</option>
        <option value="text">plain text</option>
      </select>
      <input placeholder="Content type" bind:value={assetDraft.content_type}>
      <textarea rows="4" placeholder="Attachment content" bind:value={assetDraft.content}></textarea>
    {/if}
    <button class="btn _color" type="submit" disabled={assetSaving || !assetDraft.name.trim()}>{assetSaving ? 'Saving...' : 'Save asset'}</button>
  </form>

  {#if emailAssets.length}
    <div class="asset-admin-list grid gap">
      {#each emailAssets.slice(0, 8) as asset}
        <article class="flex _space _center _y gap _wrap">
          <span class="grid gap"><b>{asset.label || asset.name}</b><small>{asset.type} · {asset.description || asset.filename}</small></span>
          <button class="btn _transparent" type="button" on:click={() => deleteAsset(asset)}>Delete</button>
        </article>
      {/each}
    </div>
  {/if}
</section>

<EmailBuilder
  {i18n}
  {templates}
  {template}
  {editorView}
  {html}
  {object}
  {resend}
  {result}
  {renderError}
  {sending}
  {attachments}
  {reusableAttachments}
  {reusableTemplates}
  {selectedReusableAttachments}
  creditEstimate={0}
  audienceEnabled={false}
  creditsEnabled={false}
  onTemplateChange={changeTemplate}
  onEditorViewChange={(value) => editorView = value}
  onResendChange={(value) => resend = value}
  onAttachmentsChange={(value) => attachments = value}
  onReusableAttachmentToggle={toggleReusableAttachment}
  onReusableAttachmentsClear={clearReusableAttachments}
  onReusableTemplateApply={applyReusableTemplate}
  onHtmlSave={(value) => { html = value; editorView = 'preview'; }}
  onObjectSave={(value) => object = value}
  onPayloadSave={(value) => resend = value}
  onSend={send}
/>

<style>
  .staff-email-assets {
    width: min(100%, 1000px);
    margin: 24px auto 0;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    border-radius: 8px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 24rem),
      color-mix(in srgb, var(--reverse, #fff) 6%, transparent);
    color: var(--reverse, #fff);
  }

  .staff-email-assets h2,
  .staff-email-assets p {
    margin: 0;
  }

  .staff-email-assets small,
  .staff-email-assets p {
    color: color-mix(in srgb, var(--reverse, #fff) 68%, transparent);
  }

  .asset-form {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    align-items: start;
  }

  .asset-form :is(input, select, textarea) {
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    background: color-mix(in srgb, var(--reverse, #fff) 7%, transparent);
    color: var(--reverse, #fff);
    border-radius: 6px;
  }

  .asset-form textarea {
    min-height: 112px;
    grid-column: 1 / -1;
  }

  .asset-admin-list article {
    padding: 10px 0;
    border-top: 1px solid color-mix(in srgb, var(--reverse, #fff) 10%, transparent);
  }

</style>
