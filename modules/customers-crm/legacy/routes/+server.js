import { json } from '@sveltejs/kit';
import {
  deleteCrmRow,
  ensureCrmStorage,
  getCrmData,
  saveCrmActivity,
  saveCrmCompany,
  saveCrmCustomer,
  saveCrmSettings
} from '$lib/server/crm.js';
import { requireTenantAccess, requireTenantOwner } from '$lib/server/auth.js';

function isDevLocal(url) {
  return import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(url.hostname);
}

function devAccess() {
  return { ok: true, user: { id: 'dev-local-tenant', email: 'admin' }, isOwner: true, isTrusted: true, isStaff: true };
}

async function accessFor(request, cookies, tenant) {
  return isDevLocal(new URL(request.url)) ? devAccess() : await requireTenantAccess(cookies, tenant);
}

async function ownerFor(request, cookies, tenant) {
  return isDevLocal(new URL(request.url)) ? devAccess() : await requireTenantOwner(cookies, tenant);
}

export async function GET({ request, locals, cookies }) {
  const access = await accessFor(request, cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });
  return json(await getCrmData(locals.tenant));
}

export async function POST({ request, locals, cookies }) {
  const body = await request.json().catch(() => ({}));

  if (['setup', 'settings'].includes(body.action)) {
    const owner = await ownerFor(request, cookies, locals.tenant);
    if (owner.error) return json({ error: owner.error }, { status: owner.status });
  } else {
    const access = await accessFor(request, cookies, locals.tenant);
    if (access.error) return json({ error: access.error }, { status: access.status });
  }

  if (body.action === 'setup') {
    const result = await ensureCrmStorage(locals.tenant);
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'settings') {
    const result = await saveCrmSettings(locals.tenant, body.settings ?? {});
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'customer') {
    const result = await saveCrmCustomer(locals.tenant, body.customer ?? {});
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'company') {
    const result = await saveCrmCompany(locals.tenant, body.company ?? {});
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'activity') {
    const result = await saveCrmActivity(locals.tenant, body.activity ?? {});
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'delete') {
    const result = await deleteCrmRow(locals.tenant, body.table, body.id);
    return json(result, { status: result.ok ? 200 : 400 });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}
