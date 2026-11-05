<script>
  import AudienceModule from '../ui/audience_module.svelte';

  let {
    i18n,
    contacts = [],
    loading = false,
    loaded = false,
    onRefresh,
    saving = false,
    error = null,
    message = null,
    publicEnabled = false,
    contactName,
    onAddContact,
    onUpdateContact,
    onRemoveContact,
    onSavePublicSetting
  } = $props();
</script>

<AudienceModule
  {i18n}
  {contacts}
  {loading}
  {loaded}
  {onRefresh}
  {saving}
  {error}
  {message}
  {publicEnabled}
  {contactName}
  {onAddContact}
  {onUpdateContact}
  {onRemoveContact}
  {onSavePublicSetting}
/>
