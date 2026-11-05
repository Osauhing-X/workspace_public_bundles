import { json } from '@sveltejs/kit';
import { requireTenantAccess } from '$lib/server/auth.js';
import { ensureKanbanStorage, getKanban, saveKanban } from '$lib/server/kanban.js';

export async function GET({ locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });
  const result = await getKanban(locals.tenant);
  return json({ ...result, user_email: access.user?.email ?? '' });
}

export async function POST({ request, locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));

  if (body.action === 'setup') {
    const result = await ensureKanbanStorage(locals.tenant);
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'settings') {
    const result = await saveKanban(locals.tenant, body.settings ?? {});
    return json(result, { status: result.ok ? 200 : 400 });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}
