<script>
  import CreditUsageNote from '$lib/site/modules/credit_usage_note.svelte';
  import EmailBuilder from '$lib/site/modules/email/email_builder.svelte';

  let {
    i18n,
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
    selectedReusableAttachments = [],
    attachmentModes = {},
    creditEstimate = 0,
    aiEnabled = false,
    aiBusy = false,
    aiStatus = null,
    onAiGenerate,
    onTemplateChange,
    onEditorViewChange,
    onResendChange,
    onAttachmentsChange,
    onReusableAttachmentToggle,
    onAttachmentModeChange,
    onHtmlSave,
    onObjectSave,
    onPayloadSave,
    onSend,
    onBuyCredits
  } = $props();
</script>

<div class="email-note">
  <CreditUsageNote module="email" />
</div>

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
  {selectedReusableAttachments}
  {attachmentModes}
  {creditEstimate}
  {aiEnabled}
  {aiBusy}
  {aiStatus}
  {onAiGenerate}
  {onTemplateChange}
  {onEditorViewChange}
  {onResendChange}
  {onAttachmentsChange}
  {onReusableAttachmentToggle}
  {onAttachmentModeChange}
  {onHtmlSave}
  {onObjectSave}
  {onPayloadSave}
  {onSend}
  {onBuyCredits}
/>

<style>
  .email-note {
    width: min(100%, 1000px);
    margin: 0 auto;
    padding: 24px 16px 0;
  }
</style>
