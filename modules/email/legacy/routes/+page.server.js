import { getAllContacts } from '$lib/server/audience.js';
import { tenantOpenAI } from '$lib/server/openai.js';
import { tenant_resend } from '$lib/server/tenant.js';

export async function load({ parent, locals }) {
  await parent() // Required for getting domain

  let { resend } = locals.tenant ?? {}
  const tenantApi = tenant_resend(locals.tenant);
  let audience_count = 0;

  if (tenantApi) {
    const contacts = await getAllContacts(tenantApi.client);
    audience_count = (contacts.data ?? []).filter((contact) => !contact.unsubscribed).length;
  }

  return { resend_domain: resend?.domain, audience_count, openai_enabled: !!tenantOpenAI(locals.tenant) }
}
