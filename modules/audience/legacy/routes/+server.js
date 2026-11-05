import { json } from '@sveltejs/kit';
import { client as platform } from '$lib/server/supabase.js';
import { tenant_resend } from '$lib/server/tenant';
import { getAllContacts, subscribeContact, updateContact } from '$lib/server/audience.js';
import { requireTenantAccess } from '$lib/server/auth.js';
import { companyTable, matchTenantRow } from '$lib/server/platform_db.js';

function hasResource(tenant, id) {
  return (tenant?.resource ?? []).some((resource) => resource.ID === id);
}

async function setAudiencePublic(tenant, enabled) {
  const resource = Array.isArray(tenant.resource) ? [...tenant.resource] : [];
  const index = resource.findIndex((item) => item.ID === 'AUDIENCE_PUBLIC');
  if (enabled && index === -1) {
    resource.push({ ID: 'AUDIENCE_PUBLIC', type: 'landing', created: new Date().toISOString().slice(0, 10) });
  } else if (!enabled && index !== -1) {
    resource.splice(index, 1);
  }

  const { error } = await matchTenantRow(
    companyTable(platform).update({ resource }),
    tenant
  );

  if (error) return { error: error.message };
  tenant.resource = resource;
  return { ok: true, enabled };
}

export async function GET({ locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });

  const tenantApi = tenant_resend(locals.tenant);
  if (!tenantApi) {
    return json({ error: 'No Resend connection' }, { status: 500 });
  }

  const { data, error } = await getAllContacts(tenantApi.client);

  return json({
    contacts: data ?? [],
    error,
    public_enabled: hasResource(locals.tenant, 'AUDIENCE_PUBLIC')
  });
}

export async function POST({ request, locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });

  const tenantApi = tenant_resend(locals.tenant);
  if (!tenantApi) {
    return json({ error: 'No Resend connection' }, { status: 500 });
  }

  const client = tenantApi.client;
  const body = await request.json();

  if (body.action === 'settings') {
    const result = await setAudiencePublic(locals.tenant, !!body.public_enabled);
    return json(result, { status: result.error ? 500 : 200 });
  }

  if (body.action === 'add') {
    const { data, error, existed } = await subscribeContact({
      email: body.email,
      first_name: body.first_name,
      last_name: body.last_name,
      tenant_data: locals.tenant
    });

    return json({ data, error, existed });
  }

  if (body.action === 'remove') {
    const { data, error } = await client.contacts.remove(body.id);
    return json({ data, error });
  }

  if (body.action === 'update') {
    const { data, error } = await updateContact({
      id: body.id,
      email: body.email,
      first_name: body.first_name,
      last_name: body.last_name,
      unsubscribed: body.unsubscribed,
      tenant_data: locals.tenant
    });
    return json({ data, error }, { status: error ? 400 : 200 });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}

