<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Header from '$lib/components/header/import.svelte';
  import { workspaceBackPath } from '$lib/site/dns_route/tenant_portal/workspace/navigation.js';
  import { onMount } from 'svelte';
  import { language } from '$lib/site/core_scripts/language.js';
  import { remoteI18n } from '$lib/site/core_scripts/remote_i18n.js';
  import Assets from './assets.svelte';
  import Builder from './builder.svelte';

  let { data } = $props();
  const remote = remoteI18n('modules_email');
  const i18n = $derived($remote);
  let templates = $state([]);
  let template = $state('zero');
  let editorView = $state('preview');
  let html = $state('<p>Hello,</p><p>Write your message here.</p>');
  let object = $state({});
  let resend = $state({ subject: '', from: '', to: '', audience: false });

  $effect(() => {
    if (!resend.from && data.resend_domain) resend = { ...resend, from: `Team <noreply@${data.resend_domain}>` };
  });
  let result = $state(null);
  let renderError = $state(null);
  let sending = $state(false);
  let attachments = $state([]);
  let reusableAttachments = $state([]);
  let selectedReusableAttachments = $state([]);
  let reusableAttachmentModes = $state({});
  let aiBusy = $state(false);
  let aiStatus = $state(null);

  const activeTab = $derived($page.url.searchParams.get('tab') === 'assets' ? 'assets' : 'builder');
  const creditEstimate = $derived(resend.audience ? Number(data.audience_count ?? 0) : uniqueRecipients(resend).length);
  const crudEndpoint = $derived(routeHref('/modules/email/api/CRUD'));
  const sendEndpoint = $derived(routeHref('/modules/email/api/send_email'));
  const openaiEndpoint = $derived(routeHref('/modules/email/api/openai'));

  function routeHref(path = '/') {
    const target = path === '/' ? '/' : path;
    const hostedPrefix = $page.url.pathname.match(/^\/t\/[^/]+/)?.[0];
    if (hostedPrefix) return `${hostedPrefix}${target}`;
    if ($page.url.pathname.startsWith('/@')) return `/@${target}`;
    return path;
  }

  function templateName(file) {
    return String(file ?? '').replace(/^templates\//, '').replace(/\.(html|md|txt|js)$/i, '');
  }

  function uniqueRecipients(payload = {}) {
    return [...new Set([payload.to, payload.cc, payload.bcc]
      .flatMap((value) => Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean))];
  }

  onMount(async () => {
    const res = await fetch(crudEndpoint);
    const json = await res.json().catch(() => ({}));
    templates = (json.templates ?? []).map((item) => templateName(item.name ?? item)).filter(Boolean);
    reusableAttachments = json.attachments ?? [];
    const to = $page.url.searchParams.get('to');
    if (to && !resend.to) resend = { ...resend, to };
  });

  async function renderTemplate(name = template, dataObject = object) {
    if (!name || name === 'zero') return;
    renderError = null;
    const res = await fetch(crudEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'render', template: name, data: dataObject })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      renderError = json.error ?? i18n.templateRenderFailed;
      if (json.object) object = json.object;
      return;
    }
    html = json.html;
    object = json.object ?? dataObject;
  }

  async function changeTemplate(value) {
    template = value;
    if (value === 'zero') return;
    await renderTemplate(value, {});
    editorView = 'preview';
  }

  async function send() {
    sending = true;
    result = null;
    const selectedAssets = reusableAttachments
      .filter((asset) => selectedReusableAttachments.includes(asset.name))
      .map((asset) => ({
        filename: asset.name,
        storage_path: asset.path ?? `attachments/${asset.name}`,
        contentType: asset.content_type || undefined,
        ...(reusableAttachmentModes[asset.name] === 'cid' && asset.content_id ? { contentId: asset.content_id } : {})
      }));
    const payloadAttachments = [...selectedAssets, ...attachments];
    const payload = { ...resend, html, attachments: payloadAttachments.length ? payloadAttachments : undefined };
    const res = await fetch(sendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: payload })
    });
    const json = await res.json().catch(() => ({}));
    sending = false;
    result = json;
  }

  async function generateAI(prompt, mode = 'email_html') {
    aiBusy = true;
    aiStatus = null;
    const res = await fetch(openaiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, purpose: mode })
    });
    const json = await res.json().catch(() => ({}));
    aiBusy = false;
    if (!res.ok || json.error) {
      aiStatus = json.error ?? i18n.aiGenerationFailed;
      return;
    }
    html = json.text;
    editorView = mode === 'email_template_js' ? 'html' : 'preview';
    aiStatus = mode === 'email_template_js'
      ? i18n.aiTemplateReady
      : i18n.aiContentReady;
  }
</script>

<Header>
  {#snippet slot_main()}
    <div class="flex gap _3 _center _y"><b>{i18n.title}</b><span class="css _black">{i18n.builder}</span></div>
  {/snippet}
  {#snippet slot_btns()}
    <button class="back" onclick={() => goto(workspaceBackPath())}>{i18n.back}</button>
    <button class:active={activeTab === 'builder'} onclick={() => goto(routeHref('/modules/email?tab=builder'), { replaceState: true })}>{i18n.builder}</button>
    <button class:active={activeTab === 'assets'} onclick={() => goto(routeHref('/modules/email?tab=assets'), { replaceState: true })}>{i18n.assets}</button>
  {/snippet}
</Header>

{#if activeTab === 'assets'}
  <Assets />
{:else}
  <Builder
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
    {selectedReusableAttachments}
    attachmentModes={reusableAttachmentModes}
    {creditEstimate}
    aiEnabled={!!data.openai_enabled}
    {aiBusy}
    {aiStatus}
    onAiGenerate={generateAI}
    onTemplateChange={changeTemplate}
    onEditorViewChange={(value) => editorView = value}
    onResendChange={(value) => resend = value}
    onAttachmentsChange={(value) => attachments = value}
    onReusableAttachmentToggle={(name) => selectedReusableAttachments = selectedReusableAttachments.includes(name)
      ? selectedReusableAttachments.filter((item) => item !== name)
      : [...selectedReusableAttachments, name]}
    onAttachmentModeChange={(name, mode) => reusableAttachmentModes = { ...reusableAttachmentModes, [name]: mode }}
    onHtmlSave={(value) => { html = value; editorView = 'preview'; }}
    onObjectSave={(value) => { object = value; renderTemplate(template, value); }}
    onPayloadSave={(value) => resend = value}
    onSend={send}
    onBuyCredits={() => goto(routeHref('/plan'))}
  />
{/if}
