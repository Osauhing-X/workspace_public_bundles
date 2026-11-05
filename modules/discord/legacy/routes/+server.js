import { json } from '@sveltejs/kit';
import { requireTenantAccess } from '$lib/server/auth.js';
import { activeThreads, createThread, discordInviteUrl, sendMessage, threadMessages } from '$lib/server/discord.js';

function publicSettings(tenant) {
  const value = tenant?.discord ?? {};
  return {
    guild_id: value.guild_id ?? '',
    forum_id: value.channel_id ?? value.forum_id ?? '',
    channel_name: value.channel_name ?? 'Discord channel',
    channel_type: value.channel_type ?? 15,
    enabled: !!value.enabled && !!value.verified,
    invite_url: value.application_id ? discordInviteUrl(value.guild_id, value.application_id) : ''
  };
}

export async function GET({ url, locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });
  const settings = publicSettings(locals.tenant);
  const threadId = url.searchParams.get('thread');

  try {
    const isForum = [15, 16].includes(settings.channel_type);
    const threads = settings.enabled && isForum ? await activeThreads(settings.guild_id, locals.tenant?.discord?.bot_token) : [];
    const ownThreads = isForum
      ? threads.filter((thread) => thread.parent_id === settings.forum_id)
      : [{ id: settings.forum_id, name: settings.channel_name, parent_id: settings.forum_id }];
    if (threadId && !ownThreads.some((thread) => thread.id === threadId)) {
      return json({ error: 'Thread does not belong to this tenant forum' }, { status: 403 });
    }
    const messages = threadId ? await threadMessages(threadId, locals.tenant?.discord?.bot_token) : null;
    return json({ settings, threads: ownThreads, messages, is_owner: access.isOwner || access.isStaff });
  } catch (error) {
    return json({ settings, threads: [], messages: null, is_owner: access.isOwner || access.isStaff, error: error.message }, { status: 502 });
  }
}

export async function POST({ request, locals, cookies }) {
  const body = await request.json().catch(() => ({}));

  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });
  const settings = publicSettings(locals.tenant);
  if (!settings.enabled) return json({ error: 'Discord module is not enabled' }, { status: 409 });

  try {
    if (body.action === 'create_thread') {
      if (![15, 16].includes(settings.channel_type)) {
        return json({ error: 'New rooms can only be created in a Discord forum channel' }, { status: 409 });
      }
      const name = String(body.name ?? '').trim();
      const content = String(body.content ?? '').trim();
      if (!name || !content) return json({ error: 'Name and message are required' }, { status: 400 });
      const thread = await createThread(settings.forum_id, name, content, locals.tenant?.discord?.bot_token);
      return json({ ok: true, thread: { id: thread.id, name: thread.name, parent_id: thread.parent_id } });
    }
    if (body.action === 'send') {
      const isForum = [15, 16].includes(settings.channel_type);
      const threads = isForum ? await activeThreads(settings.guild_id, locals.tenant?.discord?.bot_token) : [];
      const allowed = isForum
        ? threads.some((thread) => thread.id === body.thread_id && thread.parent_id === settings.forum_id)
        : body.thread_id === settings.forum_id;
      if (!allowed) return json({ error: 'Thread does not belong to this tenant forum' }, { status: 403 });
      const content = String(body.content ?? '').trim();
      if (!content) return json({ error: 'Message is required' }, { status: 400 });
      const message = await sendMessage(body.thread_id, content, locals.tenant?.discord?.bot_token);
      return json({ ok: true, message });
    }
    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return json({ error: error.message }, { status: 502 });
  }
}
