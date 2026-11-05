<script>
  let {
    i18n = {},
    templates = [],
    template = 'zero',
    editorView = 'preview',
    html = '',
    object = {},
    resend = {},
    result = null,
    renderError = null,
    sending = false,
    attachments = [],
    reusableAttachments = [],
    reusableTemplates = [],
    selectedReusableAttachments = [],
    attachmentModes = {},
    creditEstimate = 0,
    audienceEnabled = true,
    creditsEnabled = true,
    aiEnabled = false,
    aiBusy = false,
    aiStatus = null,
    onTemplateChange,
    onEditorViewChange,
    onResendChange,
    onAttachmentsChange,
    onReusableAttachmentToggle,
    onReusableAttachmentsClear,
    onAttachmentModeChange,
    onReusableTemplateApply,
    onHtmlSave,
    onObjectSave,
    onPayloadSave,
    onSend,
    onBuyCredits,
    onAiGenerate
  } = $props();

  let htmlDraft = $state('');
  let mdxDraft = $state('');
  let objectDraft = $state('');
  let payloadDraft = $state('');
  let aiPrompt = $state('');
  let aiMode = $state('email_html');
  let previewContainer = $state();
  let shadow = null;

  $effect(() => {
    if (editorView === 'html') htmlDraft = html ?? '';
    if (editorView === 'mdx' && !mdxDraft) mdxDraft = htmlToMarkdown(html ?? '');
    if (editorView === 'object') objectDraft = JSON.stringify(object ?? {}, null, 2);
    if (editorView === 'resend') payloadDraft = JSON.stringify(payloadPreview(), null, 2);
  });

  $effect(() => {
    if (!previewContainer || editorView !== 'preview') return;
    if (!previewContainer.shadowRoot) shadow = previewContainer.attachShadow({ mode: 'open' });
    else shadow = previewContainer.shadowRoot;
    shadow.innerHTML = html ?? '';
  });

  function updateResend(key, value) {
    onResendChange?.({ ...resend, [key]: value });
  }

  function assetKey(asset = {}) {
    return asset.key ?? asset.id ?? asset.name ?? asset.filename ?? asset.label ?? '';
  }

  function assetLabel(asset = {}) {
    return asset.label ?? asset.name ?? asset.filename ?? 'Asset';
  }

  function assetDescription(asset = {}) {
    return asset.description ?? asset.filename ?? asset.name ?? '';
  }

  function selectedAssets() {
    return reusableAttachments.filter((asset) => selectedReusableAttachments.includes(assetKey(asset)));
  }

  function selectedAssetCount() {
    return selectedAssets().length;
  }

  function isAssetSelected(asset = {}) {
    return selectedReusableAttachments.includes(assetKey(asset));
  }

  function toggleAsset(asset = {}) {
    const key = assetKey(asset);
    if (!key) return;
    onReusableAttachmentToggle?.(key);
  }

  function assetPayloadPreview(asset = {}) {
    const filename = asset.filename ?? asset.name ?? asset.label ?? '';
    const content = asset.content ?? asset.metadata?.content ?? asset.text ?? asset.html ?? '';
    const storagePath = asset.storage_path ?? asset.path;
    if (!filename || (!content && !storagePath)) return null;
    return {
      filename,
      ...(content ? { content } : {}),
      ...(storagePath ? { storage_path: storagePath } : {}),
      contentType: asset.contentType ?? asset.content_type ?? asset.metadata?.content_type ?? 'application/octet-stream',
      ...(attachmentModes[assetKey(asset)] === 'cid' && (asset.contentId ?? asset.content_id) ? { contentId: asset.contentId ?? asset.content_id } : {}),
      source: asset.id ? 'email_assets' : 'builtin'
    };
  }

  function payloadPreview() {
    const reusable = selectedAssets().map(assetPayloadPreview).filter(Boolean);
    const allAttachments = [
      ...attachments.map((attachment) => ({ ...attachment, source: attachment.source ?? 'one_time' })),
      ...reusable
    ];
    return {
      ...resend,
      html: html || undefined,
      attachments: allAttachments.length ? allAttachments : undefined
    };
  }

  async function readAttachments(files) {
    const next = [];
    for (const file of Array.from(files ?? [])) {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      next.push({ filename: file.name, content });
    }
    onAttachmentsChange?.(next);
  }
  function saveJson(value, callback) {
    try {
      callback?.(JSON.parse(value || '{}'));
    } catch (error) {
      alert(error?.message ?? i18n.invalidJson);
    }
  }

  function escapeText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function markdownToHtml(source = '') {
    const inline = (value) => escapeText(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    return String(source).split(/\r?\n/).map((line) => {
      if (/^###\s+/.test(line)) return `<h3>${inline(line.slice(4))}</h3>`;
      if (/^##\s+/.test(line)) return `<h2>${inline(line.slice(3))}</h2>`;
      if (/^#\s+/.test(line)) return `<h1>${inline(line.slice(2))}</h1>`;
      if (/^---+$/.test(line.trim())) return '<hr>';
      if (/^[-*]\s+/.test(line)) return `<p>• ${inline(line.slice(2))}</p>`;
      return line.trim() ? `<p>${inline(line)}</p>` : '<br>';
    }).join('\n');
  }

  function htmlToMarkdown(source = '') {
    return String(source).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n').replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**').replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*').replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<[^>]+>/g, '').trim();
  }
</script>

<main class="grid gap _3 email-workbench">
    <section area="controls" class="grid gap _2 _padding css">
      <header class="panel-head">
        <div>
          <span>{i18n.composerEyebrow}</span>
          <h1>{i18n.composerTitle}</h1>
          <p>{i18n.composerDescription}</p>
        </div>
      </header>

      <label class="grid gap _2">{i18n.template}
        <select value={template} onchange={(event) => onTemplateChange?.(event.currentTarget.value)}>
          <option value="zero">{i18n.noTemplate}</option>
          {#each templates as item}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>
      {#if aiEnabled}
        <div class="ai-panel grid gap _3">
          <div class="grid gap"><b>{i18n.aiAssistant}</b><small>{i18n.aiDescription}</small></div>
          <label class="grid gap _2">{i18n.output}
            <select bind:value={aiMode}>
              <option value="email_html">{i18n.readyEmailHtml}</option>
              <option value="email_template_js">{i18n.reusableTemplate}</option>
            </select>
          </label>
          <textarea rows="3" bind:value={aiPrompt} placeholder={i18n.aiPlaceholder}></textarea>
          {#if aiMode === 'email_template_js'}
            <small>{i18n.templateExportHint}</small>
          {/if}
          <button type="button" class="button _secondary" onclick={() => onAiGenerate?.(aiPrompt, aiMode)} disabled={aiBusy || aiPrompt.trim().length < 8}>{aiBusy ? i18n.generating : i18n.generateWithChatGPT}</button>
          {#if aiStatus}<small>{aiStatus}</small>{/if}
        </div>
      {/if}

      <label class="grid gap">{i18n.subject}
        <input value={resend.subject ?? ''} disabled={editorView === 'resend'} oninput={(event) => updateResend('subject', event.currentTarget.value)}>
      </label>

      <label class="grid gap">{i18n.from}
        <input value={resend.from ?? ''} disabled={editorView === 'resend' || resend.audience} oninput={(event) => updateResend('from', event.currentTarget.value)}>
      </label>

      {#if audienceEnabled}
        <label class="audience-toggle flex _center _y gap _2">
          <input type="checkbox" checked={!!resend.audience} disabled={editorView === 'resend'} onchange={(event) => updateResend('audience', event.currentTarget.checked)}>
          {i18n.audience}
        </label>
      {/if}

      <label class="grid gap">{i18n.to}
        <input value={resend.to ?? ''} disabled={editorView === 'resend' || resend.audience} oninput={(event) => updateResend('to', event.currentTarget.value)}>
      </label>

      <details open class="grid gap _2">
        <div class="grid gap _2">
          <div class="view-switch grid gap">
            <button type="button" class:active={editorView === 'preview'} onclick={() => onEditorViewChange?.('preview')}>{i18n.preview}</button>
            <button type="button" class:active={editorView === 'html'} onclick={() => onEditorViewChange?.('html')}>HTML</button>
            <button type="button" class:active={editorView === 'mdx'} onclick={() => onEditorViewChange?.('mdx')}>MDX</button>
            {#if template !== 'zero'}
              <button type="button" class:active={editorView === 'object'} onclick={() => onEditorViewChange?.('object')}>{i18n.object}</button>
            {/if}
            <button type="button" class:active={editorView === 'resend'} onclick={() => onEditorViewChange?.('resend')}>{i18n.payload}</button>
          </div>

          <label class="grid gap">{i18n.replyTo}
            <input value={resend.replyTo ?? ''} disabled={editorView === 'resend'} oninput={(event) => updateResend('replyTo', event.currentTarget.value)}>
          </label>

          <label class="grid gap">{i18n.cc}
            <input value={resend.cc ?? ''} disabled={editorView === 'resend'} oninput={(event) => updateResend('cc', event.currentTarget.value)}>
          </label>

          <label class="grid gap">{i18n.bcc}
            <input value={resend.bcc ?? ''} disabled={editorView === 'resend'} oninput={(event) => updateResend('bcc', event.currentTarget.value)}>
          </label>
        </div>
      </details>


      <label class="grid gap">{i18n.oneTimeAttachments}
        <input type="file" multiple onchange={(event) => readAttachments(event.currentTarget.files)}>
        {#if attachments.length}
          <small>{attachments.length === 1 ? i18n.oneFileAttached : `${i18n.filesAttachedPrefix} ${attachments.length}`}</small>
        {/if}
      </label>
      {#if reusableAttachments.length}<button type="button" class="button _secondary" popovertarget="email-assets-popover">From Assets{selectedAssetCount() ? ` (${selectedAssetCount()})` : ''}</button>{/if}
      {#if reusableAttachments.length || reusableTemplates.length}
        <hr class="css _x _transparent">
        <div area="asset-attachments" class="asset-control grid gap _2">
          <div class="flex _space _center _y gap">
            <div class="grid gap">
              <b>{i18n.reusableAttachments}</b>
              <small>{i18n.reusableAttachmentsDescription}</small>
            </div>
            <button type="button" class="button _secondary" popovertarget="email-assets-popover">
              {i18n.assets ?? i18n.emailAssets ?? 'Assets'}{selectedAssetCount() ? ` (${selectedAssetCount()})` : ''}
            </button>
          </div>

          {#if selectedAssetCount()}
            <div class="asset-pills flex _wrap gap">
              {#each selectedAssets() as asset}
                <button type="button" class="css _padding gap" onclick={() => toggleAsset(asset)} title="Remove attachment">
                  {assetLabel(asset)}
                  <span aria-hidden="true">x</span>
                </button>
              {/each}
            </div>
          {:else}
            <small>{i18n.attachmentsGuide ?? 'Open Assets to add reusable templates or attachments to this email.'}</small>
          {/if}
        </div>

        <div id="email-assets-popover" class="email-assets-popover grid gap _3" popover>
          <header class="grid gap">
            <span>{i18n.emailAssets ?? i18n.assets ?? 'Email assets'}</span>
            <h2>{i18n.assetsTitle ?? 'Templates and attachments'}</h2>
            <p>{i18n.assetsDescription ?? i18n.reusableAttachmentsDescription}</p>
          </header>

          {#if reusableTemplates.length}
            <div class="grid gap _2">
              <div class="asset-section-head flex _space _center _y gap">
                <b>{i18n.templates ?? 'Templates'}</b>
                <small>{reusableTemplates.length}</small>
              </div>
              <div class="asset-list grid gap">
                {#each reusableTemplates as asset}
                  <article class="asset-row grid gap">
                    <div>
                      <b>{assetLabel(asset)}</b>
                      <small>{assetDescription(asset)}</small>
                    </div>
                    <button type="button" class="button _secondary" onclick={() => onReusableTemplateApply?.(asset)} popovertarget="email-assets-popover" popovertargetaction="hide">
                      {i18n.useTemplate ?? 'Use template'}
                    </button>
                  </article>
                {/each}
              </div>
            </div>
          {/if}

          {#if reusableAttachments.length}
            <div class="grid gap _2">
              <div class="asset-section-head flex _space _center _y gap">
                <b>{i18n.attachments ?? i18n.reusableAttachments ?? 'Attachments'}</b>
                <small>{selectedAssetCount()}/{reusableAttachments.length}</small>
              </div>
              {#if selectedAssetCount()}
                <div class="asset-selected-summary flex _space _center _y gap _wrap">
                  <span class="grid gap">
                    <b>{selectedAssetCount()} selected</b>
                    <small>{selectedAssets().map(assetLabel).join(', ')}</small>
                  </span>
                  <button type="button" class="button _secondary" onclick={() => onReusableAttachmentsClear?.()}>
                    Clear
                  </button>
                </div>
              {/if}
              <div class="asset-list grid gap">
                {#each reusableAttachments as asset}
                  {@const key = assetKey(asset)}
                  <label class="asset-row asset-check grid gap" class:selected={isAssetSelected(asset)}>
                    <input
                      type="checkbox"
                      checked={isAssetSelected(asset)}
                      onchange={() => toggleAsset(asset)}
                    >
                    <span>
                      <b>{assetLabel(asset)}</b>
                      <small>{assetDescription(asset)}</small>
                    </span>
                    <strong>{isAssetSelected(asset) ? 'Selected' : 'Attach'}</strong>
                  </label>
                  {#if isAssetSelected(asset) && (asset.content_id || asset.contentId)}
                    <label class="asset-mode grid gap"><span>Send mode</span><select value={attachmentModes[key] ?? 'attachment'} onchange={(event) => onAttachmentModeChange?.(key, event.currentTarget.value)}><option value="attachment">Regular attachment</option><option value="cid">Inline CID ({asset.content_id || asset.contentId})</option></select></label>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}

          <footer class="flex _end gap">
            <button type="button" class="button _primary" popovertarget="email-assets-popover" popovertargetaction="hide">Done</button>
          </footer>
        </div>
      {/if}
      {#if creditsEnabled}
        <hr class="css _x _transparent">
        <div class="credit-note grid gap _2">
          <b>{creditEstimate} {creditEstimate === 1 ? i18n.credit : i18n.credits}</b>
          <small>{i18n.creditEstimateDescription}</small>
        </div>
      {/if}

      <hr class="css _x _transparent">
      <button class="button _primary" onclick={onSend} disabled={sending}>
        {sending ? i18n.sending : i18n.send}
      </button>

      {#if result}
        {#if result.error === 'Not enough credits'}
          <div class="error-box grid gap _2">
            <b>{i18n.notEnoughCredits}</b>
            <p>
              {i18n.needed} {result.credits_needed}, {i18n.available} {result.credits_available}.
              {i18n.noEmailSent}
            </p>
            <button class="button _primary" onclick={onBuyCredits}>{i18n.buyCredits}</button>
          </div>
        {:else}
          <pre>{JSON.stringify(result, null, 2)}</pre>
        {/if}
      {/if}
    </section>

    <section area="preview-editor" class="preview">
      {#if renderError}
        <div class="render-error grid gap _2">
          <b>{i18n.templateRenderFailed}</b>
          <p>{renderError}</p>
        </div>
      {/if}

      {#if editorView === 'html'}
        <form class="full_width" onsubmit={(event) => { event.preventDefault(); onHtmlSave?.(htmlDraft); }}>
          <textarea required bind:value={htmlDraft}></textarea>
          <input class="button _primary" type="submit" value={i18n.save}>
        </form>
      {:else if editorView === 'mdx'}
        <form class="full_width" onsubmit={(event) => { event.preventDefault(); onHtmlSave?.(markdownToHtml(mdxDraft)); }}>
          <label class="grid gap"><b>MDX / Markdown content</b><small>Write headings, paragraphs, links, bold and italic text without HTML tags.</small><textarea required bind:value={mdxDraft}></textarea></label>
          <input class="button _primary" type="submit" value={i18n.save}>
        </form>
      {:else if editorView === 'object'}
        <form class="full_width" onsubmit={(event) => { event.preventDefault(); saveJson(objectDraft, onObjectSave); }}>
          <textarea required bind:value={objectDraft}></textarea>
          <input class="button _primary" type="submit" value={i18n.save}>
        </form>
      {:else if editorView === 'resend'}
        <form class="full_width" onsubmit={(event) => { event.preventDefault(); saveJson(payloadDraft, onPayloadSave); }}>
          <textarea required bind:value={payloadDraft}></textarea>
          <input class="button _primary" type="submit" value={i18n.save}>
        </form>
      {:else}
        <div class="render-frame full_width" bind:this={previewContainer}></div>
      {/if}
    </section>
</main>

<style>
  .email-workbench {
    width: min(100%, 1000px);
    margin: 0 auto;
    padding: 24px 16px 56px;
    grid-template-columns: 360px minmax(0, 1fr);
  }

  [area="controls"] {
    border: 1px solid var(--override-border, color-mix(in srgb, var(--x_body_color, #101010) 12%, transparent));
    border-radius: 8px;
    background: var(--override-section, var(--x_element_background, #fff));
    color: var(--override-text, var(--x_body_color, #101010));
    box-shadow: 0 18px 50px rgba(16, 24, 40, .08);
  }

  [area="controls"] :is(label, b, h1) {
    color: var(--override-heading, var(--x_heading_color, #101010));
  }

  [area="controls"] :is(input, select, textarea) {
    border: 1px solid var(--override-border, color-mix(in srgb, var(--x_body_color, #101010) 16%, transparent));
    background: var(--override-box, var(--x_input_background, #fff));
    color: var(--override-text, var(--x_body_color, #101010));
  }

  .panel-head span {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  .panel-head h1,
  .panel-head p,
  .email-assets-popover header :is(h2, p) {
    margin: 0;
  }

  .panel-head h1 {
    margin-top: 4px;
    font-size: 28px;
    letter-spacing: 0;
  }

  .panel-head p {
    margin-top: 8px;
    color: var(--override-text, #475467);
    line-height: 1.45;
  }

  textarea {
    min-height: 560px !important;
  }

  .credit-note,
  .error-box,
  .render-error,
  .asset-control {
    border: 1px solid var(--override-border, color-mix(in srgb, var(--x_body_color, #101010) 12%, transparent));
    border-radius: 8px;
    background: var(--override-box, var(--x_element_background, #fff));
    color: var(--override-text, var(--x_body_color, #101010));
    padding: 12px;
  }

  .asset-control {
    background: color-mix(in srgb, var(--override-box, var(--x_input_background, #fff)) 88%, var(--x_color, #da3));
  }

  .asset-pills button {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--x_color, #da3) 34%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--x_color, #da3) 12%, var(--override-box, #fff));
    color: var(--override-text, var(--x_body_color, #101010));
    font-size: 12px;
    cursor: pointer;
  }

  .asset-pills button span {
    color: color-mix(in srgb, currentColor 64%, transparent) !important;
  }

  .ai-panel {
    background: color-mix(in srgb, var(--override-box, #fcfcfd) 72%, #e0f2fe);
  }

  .ai-panel textarea {
    min-height: 88px !important;
  }

  .credit-note small {
    color: var(--override-muted, #667085);
  }

  .preview input[type="submit"],
  .error-box button {
    border-radius: 7px;
  }

  .preview input[type="submit"] {
    margin-top: 10px;
  }

  .view-switch {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    padding: 4px;
    border: 1px solid var(--override-border, #d0d5dd);
    border-radius: 8px;
    background: var(--override-box, #f9fafb);
  }

  .view-switch button {
    min-height: 34px;
    border-radius: 6px;
    background: transparent;
    color: var(--override-text, #344054);
  }

  .view-switch button.active {
    background: var(--override-primary-button, #111827);
    color: var(--override-primary-button-text, #fff);
  }

  .email-assets-popover {
    width: min(720px, calc(100vw - 28px));
    max-height: min(760px, calc(100dvh - 28px));
    overflow: auto;
    margin: auto;
    border: 1px solid var(--override-border, color-mix(in srgb, var(--x_body_color, #101010) 18%, transparent));
    border-radius: 10px;
    background: var(--override-section, var(--x_body_background, #fff));
    color: var(--override-text, var(--x_body_color, #101010));
    padding: 18px;
    box-shadow: 0 24px 70px #0004;
  }

  .email-assets-popover:not(:popover-open) {
    display: none;
  }

  .email-workbench {
    --override-section: #101010;
    --override-box: #181818;
    --override-text: #f7f7f7;
    --override-heading: #fff;
    --override-muted: #b8b8b8;
    --override-border: #ffffff24;
    --override-primary-button: var(--x_color, #da3);
    --override-primary-button-text: #000;
  }

  .email-assets-popover::backdrop {
    background: #0008;
  }

  .email-assets-popover header span,
  .asset-row small,
  .asset-section-head small {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }

  .asset-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border: 1px solid var(--override-border, color-mix(in srgb, var(--x_body_color, #101010) 12%, transparent));
    border-radius: 8px;
    background: var(--override-box, color-mix(in srgb, var(--x_body_background, #fff) 92%, #000));
    padding: 12px;
  }

  .asset-check {
    grid-template-columns: auto minmax(0, 1fr) auto;
    cursor: pointer;
  }

  .asset-check.selected {
    border-color: color-mix(in srgb, var(--x_color, #da3) 48%, transparent);
    background: color-mix(in srgb, var(--x_color, #da3) 12%, var(--override-box, #fff));
  }

  .asset-row :is(b, small) {
    display: block;
  }

  .asset-check strong {
    align-self: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--x_body_color, #101010) 8%, transparent);
    color: var(--override-text, var(--x_body_color, #101010));
    padding: 5px 9px;
    font-size: 12px;
  }

  .asset-check.selected strong {
    background: color-mix(in srgb, var(--x_color, #da3) 24%, transparent);
    color: var(--override-heading, var(--x_heading_color, #101010));
  }

  .asset-selected-summary {
    border: 1px solid color-mix(in srgb, var(--x_color, #da3) 30%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--x_color, #da3) 10%, transparent);
    padding: 10px;
  }

  .asset-selected-summary span {
    min-width: 0;
  }

  .asset-selected-summary small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .render-frame {
    min-height: 560px;
    overflow: auto;
    border: 0;
    background: transparent;
  }

  [area="preview-editor"] { backdrop-filter: brightness(.9); }

  .error-box {
    border-color: #fecdca;
    background: #fff4f2;
    color: #912018;
  }

  .error-box p,
  .render-error p {
    margin: 0;
  }

  .render-error {
    margin-bottom: 12px;
    border-color: #fedf89;
    background: #fffaeb;
    color: #b54708;
  }

  @media (max-width: 920px) {
    .email-workbench {
      grid-template-columns: 1fr;
    }

    textarea {
      min-height: 360px;
    }

    .asset-row {
      grid-template-columns: 1fr;
    }
  }
</style>
