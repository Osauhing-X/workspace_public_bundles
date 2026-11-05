import { json } from '@sveltejs/kit';
import { GET as listAssets } from '../../../../../../(api + other)/@_supabase/tenant/resend/+server.js';
import { POST as setupAssets } from '../../../../../../(api + other)/@_supabase/tenant/resend/setup/+server.js';
import { POST as createAsset } from '../../../../../../(api + other)/@_supabase/tenant/resend/create/+server.js';
import { POST as deleteAsset } from '../../../../../../(api + other)/@_supabase/tenant/resend/delete/+server.js';
import { POST as renderTemplate } from '../../../../../../(api + other)/@_supabase/tenant/resend/render/+server.js';
import { PUT as saveAsset } from '../../../../../../(api + other)/@_supabase/tenant/resend/save/+server.js';

export const GET = listAssets;
export const PUT = saveAsset;

export async function POST(event) {
  const body = await event.request.clone().json().catch(() => ({}));
  const action = String(body.action ?? '');

  if (action === 'setup') return setupAssets(event);
  if (action === 'create') return createAsset(event);
  if (action === 'delete') return deleteAsset(event);
  if (action === 'render' || body.template) return renderTemplate(event);

  return json({ error: 'Invalid email asset action' }, { status: 400 });
}
