<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let data = $state({ settings: {}, threads: [], messages: null, is_owner: false });
  let selected = $state('');
  let draft = $state({ name: '', content: '' });
  let message = $state('');

  function integrationHref() {
    return $page.url.pathname.replace(/\/modules\/discord\/?$/, '/integration/discord');
  }

  async function api(options = {}, query = '') {
    const response = await fetch(`${location.pathname}${query}`, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Discord request failed');
    return body;
  }

  async function load(thread = '') {
    loading = true;
    error = '';
    try {
      data = await api({}, thread ? `?thread=${encodeURIComponent(thread)}` : '');
      selected = thread;
    } catch (reason) {
      error = reason.message;
    } finally {
      loading = false;
    }
  }

  async function post(body) {
    saving = true;
    error = '';
    try {
      return await api({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (reason) {
      error = reason.message;
      return null;
    } finally {
      saving = false;
    }
  }


  async function create() {
    const result = await post({ action: 'create_thread', ...draft });
    if (!result) return;
    draft = { name: '', content: '' };
    await load(result.thread.id);
  }

  async function send() {
    const result = await post({ action: 'send', thread_id: selected, content: message });
    if (!result) return;
    message = '';
    await load(selected);
  }

  onMount(() => load());
</script>

<svelte:head><title>Discord | Workspace</title></svelte:head>

<main class="grid gap _3">
  <header class="module-hero box _outer grid gap _2">
    <small>Tenant module</small>
    <h1>Discord chat rooms</h1>
    <p>Bring conversations from your Discord server into the tenant portal. Members can read messages and reply without leaving Workspace.</p>
    <p>Connect a text channel for one shared room or a forum channel where every Discord thread becomes a separate chat room.</p>
  </header>

  <section class="feature-grid grid gap _3" aria-label="Discord module features">
    <article class="feature box _outer grid gap">
      <h2>Shared conversations</h2>
      <p>Messages stay synchronized with the selected Discord channel or forum.</p>
    </article>
    <article class="feature box _outer grid gap">
      <h2>Forum rooms</h2>
      <p>Create rooms from the portal and continue the same discussion in Discord threads.</p>
    </article>
    <article class="feature box _outer grid gap">
      <h2>Controlled access</h2>
      <p>The bot only works in the server and channel verified by the tenant owner.</p>
    </article>
  </section>

  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p>Loading…</p>
  {:else if data.settings.enabled}
    <section class="connection box _outer flex _space _center _y gap _2">
      <div>
        <small>Connected {[15, 16].includes(data.settings.channel_type) ? 'forum' : 'channel'}</small>
        <h2>#{data.settings.channel_name}</h2>
      </div>
      {#if data.is_owner}<a class="button _secondary" href={integrationHref()}>Integration settings</a>{/if}
    </section>
    <section class="chat grid gap _2">
      <aside class="box _outer grid gap _2">
        <h2>Rooms</h2>
        {#each data.threads as thread}
          <button class:active={selected === thread.id} onclick={() => load(thread.id)}>{thread.name}</button>
        {:else}<small>No active rooms.</small>{/each}
        {#if [15, 16].includes(data.settings.channel_type)}
          <hr>
          <input placeholder="Room name" bind:value={draft.name}>
          <textarea placeholder="First message" bind:value={draft.content}></textarea>
          <button onclick={create} disabled={saving || !draft.name.trim() || !draft.content.trim()}>Create room</button>
        {/if}
      </aside>
      <section class="box _outer grid gap _2">
        {#if selected}
          <div class="messages grid gap _2">
            {#each data.messages ?? [] as item}
              <article><b>{item.author.name}</b><p>{item.content}</p><small>{new Date(item.created_at).toLocaleString()}</small></article>
            {/each}
          </div>
          <textarea placeholder="Message" bind:value={message}></textarea>
          <button onclick={send} disabled={saving || !message.trim()}>Send</button>
        {:else}<p>Select or create a room.</p>{/if}
      </section>
    </section>
  {:else}
    <section class="setup box _outer grid gap _2">
      <h2>Connect Discord to start</h2>
      <p>Add the Extaas bot, verify your Discord server and choose the channel or forum this tenant may use.</p>
      {#if data.is_owner}
        <a class="button _primary" href={integrationHref()}>Set up Discord integration</a>
      {:else}
        <small>Ask the tenant owner to configure the Discord integration.</small>
      {/if}
    </section>
  {/if}
</main>

<style>
  main { width: min(1100px, 100%); margin: 0 auto; padding: 24px 16px 56px; }
  h1, h2, p { margin: 0; }
  label { display: grid; gap: 6px; }
  .chat { grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); }
  .feature-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .module-hero, .feature, .setup, .connection,
  .chat > aside, .chat > section { padding: 16px; }
  .feature p, .setup p { color: var(--override-muted, #667085); }
  .setup .button { width: fit-content; }
  .messages { max-height: 58vh; overflow: auto; }
  .messages article { border-bottom: 1px solid var(--override-border, #ddd); padding: 10px 0; }
  .messages article p { white-space: pre-wrap; overflow-wrap: anywhere; }
  button.active { outline: 2px solid currentColor; }
  .error { border: 1px solid #fecdca; background: #fff4f2; color: #912018; padding: 10px; }
  @media (max-width: 720px) {
    .chat, .feature-grid { grid-template-columns: 1fr; }
    .connection { align-items: flex-start; flex-direction: column; }
  }
</style>
