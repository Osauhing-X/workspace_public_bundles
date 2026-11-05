<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/header/import.svelte';
  import { workspaceBackPath } from '$lib/site/dns_route/tenant_portal/workspace/navigation.js';
  import { language } from '$lib/site/core_scripts/language.js';
  import { remoteI18n } from '$lib/site/core_scripts/remote_i18n.js';
  import AudienceBoard from './audience-board.svelte';

  const remote = remoteI18n('modules_audience');
  const i18n = $derived($remote);

  let contacts = $state([]);
  let publicEnabled = $state(false);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state(null);
  let message = $state(null);

  const endpoint = () => `${window.location.pathname.replace(/\/$/, '')}/api/CRUD`;

  async function load() {
    loading = true;
    error = null;

    try {
      const res = await fetch(endpoint());
      const json = await res.json();

      contacts = Array.isArray(json)
        ? json
        : json.contacts ?? [];
      publicEnabled = !!json.public_enabled;

      if (!Array.isArray(json) && json.error) {
        error = json.error?.message ?? json.error;
      }
    } catch (e) {
      error = e?.message ?? 'Load failed';
    }

    loading = false;
  }

  onMount(load);

  function contactName(contact) {
    return [
      contact.first_name ?? contact.firstName,
      contact.last_name ?? contact.lastName
    ].filter(Boolean).join(' ');
  }

  async function addContact(payload) {
    error = null;
    message = null;
    saving = true;

    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', ...payload })
    });

    const json = await res.json();
    saving = false;

    if (!res.ok || json.error) {
      error = json.error?.message ?? json.error ?? 'Could not add contact';
      return false;
    }

    message = json.existed ? 'Contact was already in the audience.' : 'Contact added to the audience.';
    await load();
    return true;
  }

  async function removeContact(id) {
    error = null;
    message = null;
    saving = true;

    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id })
    });

    const json = await res.json();
    saving = false;

    if (!res.ok || json.error) {
      error = json.error?.message ?? json.error ?? 'Could not remove contact';
      return false;
    }

    message = 'Contact removed from the audience.';
    await load();
    return true;
  }

  async function updateAudienceContact(payload) {
    error = null;
    message = null;
    saving = true;

    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', ...payload })
    });

    const json = await res.json().catch(() => ({}));
    saving = false;

    if (!res.ok || json.error) {
      error = json.error?.message ?? json.error ?? 'Could not update contact';
      return false;
    }

    message = 'Contact updated.';
    await load();
    return true;
  }

  async function savePublicSetting(value) {
    saving = true;
    error = null;
    message = null;
    publicEnabled = value;

    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', public_enabled: publicEnabled })
    });

    const json = await res.json();
    saving = false;

    if (!res.ok || json.error) {
      error = json.error ?? 'Could not save landing visibility';
      return false;
    }

    message = publicEnabled ? 'Subscribe box is visible on the landing page.' : 'Subscribe box is hidden from the landing page.';
    return true;
  }
</script>

<Header>
  {#snippet slot_main()}
    <div class="flex gap _3 _center _y">
      <b>{i18n.title}</b>
      <span class="css _black">{i18n.module}</span>
    </div>
  {/snippet}

  {#snippet slot_btns()}
    <button class="back" onclick={() => goto(workspaceBackPath())}>{i18n.back}</button>
  {/snippet}
</Header>

<AudienceBoard
  {i18n}
  {contacts}
  {loading}
  {saving}
  {error}
  {message}
  {publicEnabled}
  {contactName}
  onAddContact={addContact}
  onUpdateContact={updateAudienceContact}
  onRemoveContact={removeContact}
  onSavePublicSetting={savePublicSetting}
/>
