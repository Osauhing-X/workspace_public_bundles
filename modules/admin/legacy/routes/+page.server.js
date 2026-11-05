import { error } from '@sveltejs/kit';
import { client } from '$lib/server/supabase.js';
import { workspaceClient, workspaceSupabaseConfigured } from '$lib/server/workspace_supabase.js';
import { accountStripeBilling, stripeAdminData, stripeSyncHealth } from '$lib/server/stripe_sync.js';
import { developer_log } from '$lib/assets/developer.js';
import { loadTenantLandingData } from '$lib/server/tenant_landing_data.js';
import {
  publicDiscordIntegration,
  publicResendIntegration,
  publicStripeIntegration,
  publicSupabaseIntegration,
  tenantRouteKey
} from '$lib/server/platform_db.js';
import { getContactFormSettings } from '$lib/server/contact_form.js';
import { getMaintenanceSettings, listInfoScreens, listNotices } from '$lib/server/maintenance.js';
import {
  canManageStaff,
  canViewStaffFinancials,
  getRequestUser,
  isStaff
} from '$lib/server/auth.js';

const LOG_FILE = 'src/routes/(admin panel)/[who]/+page.server.js';

function adminLog(where, data) {
  developer_log(where, data, { file: LOG_FILE });
}

function isLocalOrigin(url) {
  return ['localhost', '127.0.0.1'].includes(url.hostname);
}
async function staffUserForRequest({ cookies, params, url }) {
  const requestedUserId = decodeURIComponent(params.who ?? '').trim();
  if (!requestedUserId) throw error(404, 'Page not found');

  if (import.meta.env.DEV && isLocalOrigin(url)) {
    if (requestedUserId !== 'local') throw error(404, 'Page not found');
    const user = {
      id: 'local',
      email: 'admin',
      app_metadata: { oux: ['admin'], dev: true },
      user_metadata: { name: 'Local developer' }
    };

    adminLog('admin.staffUserForRequest', {
      mode: 'dev',
      requestedUserId,
      matched_auth_user: false,
      oux_permissions: user.app_metadata?.oux ?? []
    });

    return { user, requestedUserId, accessMode: 'dev-local' };
  }

  const user = await getRequestUser(client, cookies);
  if (!user || !isStaff(user)) throw error(404, 'Page not found');
  if (user.id !== requestedUserId) throw error(404, 'Page not found');

  return { user, requestedUserId, accessMode: 'session' };
}

function missingTable(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return ['42P01', '42703', 'PGRST106', 'PGRST204', 'PGRST205'].includes(error?.code) ||
    message.includes('does not exist') ||
    message.includes('not found') ||
    message.includes('column') ||
    message.includes('could not find');
}

async function optionalRows(label, query, fallback = []) {
  let data;
  let dbError;
  try {
    ({ data, error: dbError } = await within(query, {
      data: fallback,
      error: new Error(`${label} request timed out.`)
    }));
  } catch (reason) {
    dbError = reason;
  }
  if (!dbError) return { data: data ?? fallback, error: null };

  return {
    data: fallback,
    error: {
      source: label,
      code: dbError.code || '',
      message: dbError.message || 'Unknown Supabase error',
      missing: missingTable(dbError)
    }
  };
}
async function optionalRowsAny(label, attempts = [], fallback = []) {
  const errors = [];
  for (const attempt of attempts) {
    if (!attempt?.query) continue;
    const result = await optionalRows(attempt.label || label, attempt.query, fallback);
    if (!result.error) return result;
    errors.push(result.error);
    if (!result.error.missing) return result;
  }

  return {
    data: fallback,
    error: errors[0]
      ? { ...errors[0], source: label, attempts: errors.map((item) => item.source) }
      : null
  };
}

async function optionalRowsMerge(label, attempts = [], fallback = []) {
  const errors = [];
  const rows = [];
  let loaded = false;

  for (const attempt of attempts) {
    if (!attempt?.query) continue;
    const result = await optionalRows(attempt.label || label, attempt.query, []);
    if (!result.error) {
      loaded = true;
      rows.push(...(Array.isArray(result.data) ? result.data : []));
      continue;
    }
    errors.push(result.error);
    if (!result.error.missing) return { data: rows.length ? rows : fallback, error: result.error };
  }

  if (loaded) {
    const seen = new Set();
    return {
      data: rows
        .filter((row) => {
          const key = row?.id || `${row?.started_at || ''}:${row?.worker_id || row?.worker_email || ''}:${row?.service || row?.title || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)),
      error: null
    };
  }

  return {
    data: fallback,
    error: errors[0]
      ? { ...errors[0], source: label, attempts: errors.map((item) => item.source) }
      : null
  };
}

function workspaceRows(table) {
  return workspaceSupabaseConfigured() ? workspaceClient.from(table).select('*') : null;
}

function normalizeProjectRow(row = {}) {
  return row ? { ...row, ettevote_id: row.ettevote_id ?? row.company_id ?? null } : row;
}

function normalizeInvoiceRow(row = {}) {
  return row ? {
    ...row,
    arve_nr: row.arve_nr ?? row.invoice_nr ?? null,
    ettevote_id: row.ettevote_id ?? row.company_id ?? null,
    projekt_id: row.projekt_id ?? row.project_id ?? null,
    view: row.view ?? row.visible_to ?? []
  } : row;
}

function reconcileInvoiceWithStripe(row = {}, stripeInvoices = []) {
  const invoice = normalizeInvoiceRow(row);
  const stripeId = String(invoice.stripe_invoice_id ?? '').trim();
  if (!stripeId) return invoice;

  const stripeInvoice = stripeInvoices.find((item) => String(item?.id ?? '') === stripeId);
  if (!stripeInvoice) return invoice;

  const paid = String(stripeInvoice.status ?? '').toLowerCase() === 'paid'
    || (Number(stripeInvoice.amount_paid ?? 0) > 0 && Number(stripeInvoice.amount_remaining ?? 0) === 0)
    || Boolean(stripeInvoice.paid_at);

  return {
    ...invoice,
    stripe_status: stripeInvoice.status ?? null,
    stripe_amount_paid: stripeInvoice.amount_paid ?? null,
    stripe_amount_remaining: stripeInvoice.amount_remaining ?? null,
    ...(paid ? {
      total_due: 0,
      paid_at: invoice.paid_at || stripeInvoice.paid_at || null
    } : {})
  };
}

function normalizePortalRow(row = {}) {
  if (!row) return row;
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    ...row,
    route_mode: row.route_mode || metadata.route_mode || (!row.domain && row.who_id ? 'who' : 'dns'),
    access: Array.isArray(row.access) ? row.access : (Array.isArray(metadata.access) ? metadata.access : []),
    dns_status: row.dns_status || metadata.dns_status || (row.domain ? 'pending' : 'not_required'),
    dns_verify_txt: row.dns_verify_txt || row.dns_verify_token || metadata.dns_verify_txt || null
  };
}

async function optionalHelpRequests() {
  const result = await optionalRowsAny('päringud', [
    { label: 'päringud', query: client.from('päringud').select('*').order('created_at', { ascending: false }).limit(500) }
  ]);
  return result.error?.missing ? { data: [], error: null } : result;
}

async function listAuthUsers(authClient, source) {
  const perPage = 1000;
  const users = [];
  let total = 0;
  let page = 1;

  while (page < 10) {
    let data;
    let error;
    try {
      ({ data, error } = await authClient.auth.admin.listUsers({ page, perPage }));
    } catch (reason) {
      return { users: [], total: 0, source, error: reason?.message ?? 'Auth connection failed.' };
    }
    if (error) return { users: [], total: 0, source, error: error.message };

    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch.map((item) => ({ ...item, _auth_source: source })));
    total = Number(data?.total ?? users.length ?? 0);

    if (batch.length < perPage || users.length >= total) break;
    page += 1;
  }

  return { source, users, total: total || users.length };
}

function within(promise, fallback, timeoutMs = 5000) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch((reason) => typeof fallback === 'function' ? fallback(reason) : fallback),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(typeof fallback === 'function'
        ? fallback(new Error(`Request timed out after ${timeoutMs} ms.`))
        : fallback), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

export async function _loadAdminDashboard(event, { portal = false } = {}) {
  let staffAccess;
  if (portal) {
    let user;
    let accessMode = 'portal';

    if (import.meta.env.DEV && isLocalOrigin(event.url)) {
      user = {
        id: 'dev-local-admin',
        email: 'admin',
        app_metadata: { oux: ['admin'], dev: true },
        user_metadata: { name: 'Local developer' }
      };
      accessMode = 'portal-dev-local';
    } else {
      user = await getRequestUser(client, event.cookies);
      if (!user || !isStaff(user)) throw error(404, 'Page not found');
    }

    staffAccess = { user, requestedUserId: user.id, accessMode };
  } else {
    staffAccess = await staffUserForRequest(event);
  }
  const { user, requestedUserId, accessMode } = staffAccess;
  adminLog('admin.load.start', {
    requestedUserId,
    accessMode,
    workspace_supabase_configured: workspaceSupabaseConfigured()
  });

  const [
    users_data,
    customer_users_data,
    projectsResult,
    companiesResult,
    adminProjectsResult,
    invoicesResult,
    b2bResult,
    workLogsResult,
    inventoryResult,
    kanbanResult,
    calendarResult,
    helpResult,
    clientErrorsResult,
    emailAssetsResult,
    stripe_data,
    stripe_health,
    account_stripe,
    maintenance_settings,
    info_screens,
    notices
  ] = await Promise.all([
    within(listAuthUsers(client, 'extaas.com'), (reason) => ({
      users: [], total: 0, source: 'extaas.com', error: reason.message
    })),
    workspaceSupabaseConfigured()
      ? within(listAuthUsers(workspaceClient, 'workspace.extaas.com'), (reason) => ({
          users: [], total: 0, source: 'workspace.extaas.com', error: reason.message
        }))
      : { users: [], total: 0, source: 'workspace.extaas.com', error: 'Workspace Supabase is not configured.' },
    optionalRowsAny('projects', [
      { label: 'projektid', query: client.from('projektid').select('*') }
    ]),
    optionalRowsAny('companies', [
      { label: 'ettev\u00f5tted', query: client.from('ettev\u00f5tted').select('*') }
    ]),
    optionalRowsAny('projekt', [
      { label: 'projektid', query: client.from('projektid').select('*') }
    ]),
    { data: [], error: null },
    optionalRowsAny('portaal', [
      { label: 'workspace.portaal', query: workspaceRows('portaal') },
      { label: 'workspace.\u00fc\u00fcrnik', query: workspaceRows('\u00fc\u00fcrnik') }
    ]),
    optionalRowsMerge('work_logs', [
      { label: 'work_logs', query: client.from('work_logs').select('*').order('started_at', { ascending: false }).limit(500) }
    ]),
    optionalRowsAny('inventory_items', [
      { label: 'inventuur', query: client.from('inventuur').select('*').order('created_at', { ascending: false }).limit(500) }
    ]),
    optionalRowsAny('kanban_boards', [
      { label: 'kanban', query: client.from('kanban').select('*').order('created_at', { ascending: false }).limit(100) }
    ]),
    optionalRowsAny('calendar_events', [
      { label: 'kalender', query: client.from('kalender').select('*').order('starts_at', { ascending: true }).limit(500) }
    ]),
    optionalHelpRequests(),
    optionalRows('workspace client errors', workspaceRows('ajalugu')
      ?.eq('type', 'client_error')
      .order('created_at', { ascending: false })
      .limit(500) ?? Promise.resolve({ data: [], error: null })),
    optionalRows('email_assets', client.from('email_assets').select('*').order('created_at', { ascending: false }).limit(500)),
    within(stripeAdminData(100), {}),
    within(stripeSyncHealth(), { connected: false, first_error: 'Stripe sync health request timed out.' }),
    within(accountStripeBilling(user?.email), {}),
    within(getMaintenanceSettings(), {}),
    within(listInfoScreens(), { screens: [], error: 'Info screens request timed out.' }),
    within(listNotices(), { notices: [], error: 'Notices request timed out.' })
  ]);

  adminLog('admin.load.stripe', {
    customers: stripe_data?.customers?.length ?? 0,
    invoices: stripe_data?.invoices?.length ?? 0,
    subscriptions: stripe_data?.subscriptions?.length ?? 0,
    transactions: stripe_data?.transactions?.length ?? 0,
    refunds: stripe_data?.refunds?.length ?? 0,
    disputes: stripe_data?.disputes?.length ?? 0,
    terminal: stripe_data?.terminal?.length ?? 0,
    connected: stripe_health?.connected ?? false,
    visible_table_count: stripe_health?.visible_table_count ?? 0,
    first_error: stripe_health?.first_error ?? null
  });

  const data_errors = [
    users_data.error ? { source: 'auth.extaas.com', message: users_data.error } : null,
    customer_users_data.error ? { source: 'auth.workspace.extaas.com', message: customer_users_data.error } : null,
    projectsResult.error,
    companiesResult.error,
    adminProjectsResult.error,
    invoicesResult.error,
    b2bResult.error,
    workLogsResult.error,
    inventoryResult.error,
    kanbanResult.error,
    calendarResult.error,
    helpResult.error,
    clientErrorsResult.error,
    emailAssetsResult.error
  ].filter(Boolean);

  return {
    ui: 'dashboard',
    users_data,
    customer_users_data,
    payments_data: stripe_data?.transactions ?? [],
    projects_data: projectsResult.data,
    ettevote_data: companiesResult.data,
    projekt_data: adminProjectsResult.data.map(normalizeProjectRow),
    arve_data: stripe_data?.invoices ?? [],
    b2b_data: b2bResult.data.map(normalizePortalRow),
    work_logs_data: workLogsResult.data,
    inventory_data: inventoryResult.data,
    kanban_data: kanbanResult.data,
    calendar_data: calendarResult.data,
    stripe_data,
    stripe_health,
    account_stripe,
    maintenance_settings,
    info_screens: info_screens?.screens ?? [],
    notices: notices?.notices ?? [],
    help_requests: helpResult.data,
    client_errors: clientErrorsResult.data,
    email_assets_data: emailAssetsResult.data,
    data_errors,
    staff_permissions: {
      manage_staff: canManageStaff(user),
      view_financials: canViewStaffFinancials(user),
      current_user_id: user?.id,
      current_user_email: user?.email,
      requested_user_id: requestedUserId,
      access_mode: accessMode
    }
  };
}

export async function load(event) {
  if (event.locals.mode === 'tenant' && event.locals.tenant) {
    const parent = await event.parent();
    const localAdmin = import.meta.env.DEV && isLocalOrigin(event.url);
    if (!localAdmin && !parent.is_staff) throw error(404, 'Page not found');

    const tenant = event.locals.tenant;
    const resources = Array.isArray(tenant.resource) ? tenant.resource : [];
    const resourceIds = resources.map((item) => item?.ID).filter(Boolean);
    const metadata = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
    const access = Array.isArray(tenant.access) ? tenant.access : [];
    const accessEmails = access
      .map((entry) => String(typeof entry === 'string' ? entry : entry?.email ?? '').trim().toLowerCase())
      .filter(Boolean);

    let contactSettings = null;
    let contactSettingsError = null;
    if (resourceIds.includes('SUPABASE_CONTACT_FORM')) {
      try {
        const result = await getContactFormSettings(tenant);
        contactSettings = result.settings ?? null;
        contactSettingsError = result.error ?? null;
      } catch (reason) {
        contactSettingsError = reason?.message ?? 'Contact form settings could not be loaded.';
      }
    }

    const stripe = publicStripeIntegration(tenant.stripe);
    const notifications = [
      { source: 'Credit usage', enabled: tenant.credit_notify?.enabled !== false, emails: tenant.credit_notify?.emails ?? [] },
      { source: 'Booking requests', enabled: !!parent.booking_settings, emails: parent.booking_settings?.notify_emails ?? [] },
      { source: 'Rental requests', enabled: !!parent.rent_settings, emails: parent.rent_settings?.notify_emails ?? [] },
      { source: 'Contact form', enabled: !!contactSettings?.enabled, emails: contactSettings?.notify_emails ?? [], error: contactSettingsError },
      { source: 'Store orders', enabled: !!stripe.checkout?.store_enabled, emails: stripe.store?.notify_emails ?? [] }
    ].map((item) => ({
      ...item,
      emails: [...new Set((Array.isArray(item.emails) ? item.emails : []).map((email) => String(email).trim().toLowerCase()).filter(Boolean))]
    }));

    const supabase = publicSupabaseIntegration(tenant.supabase);
    const resend = publicResendIntegration(tenant.resend);
    const discord = publicDiscordIntegration(tenant.discord);
    const needsSupabase = resourceIds.some((id) => id.startsWith('SUPABASE_'));
    const needsResend = resourceIds.includes('SUPABASE_RESEND_STORAGE');
    const needsStripe = !!(stripe.checkout?.booking_enabled || stripe.checkout?.rent_enabled || stripe.checkout?.store_enabled);
    const needsOpenAI = !!tenant.openai?.enabled;
    const needsDiscord = !!(tenant.discord?.enabled || tenant.discord?.guild_id || tenant.discord?.channel_id);
    const integrations = [
      { id: 'supabase', name: 'Supabase', required: needsSupabase, configured: !!supabase.id && supabase.has_SERVICE_OUX_ROLE, detail: supabase.id || 'Project ID missing', href: '/integration/supabase', keys: { anon_key: !!supabase.anon_key, SERVICE_OUX_ROLE: supabase.has_SERVICE_OUX_ROLE } },
      { id: 'resend', name: 'Resend', required: needsResend, configured: resend.has_api_key && !!resend.domain, detail: resend.domain || resend.from_email || 'Domain missing', href: '/integration/resend', keys: { api_key: resend.has_api_key } },
      { id: 'stripe', name: 'Stripe', required: needsStripe, configured: stripe.enabled && !!stripe.publishable_key && !!stripe.secret_key, detail: `${stripe.mode} mode`, href: '/integration/stripe', keys: { publishable_key: !!stripe.publishable_key, secret_key: !!stripe.secret_key, webhook_secret: !!stripe.webhook_secret } },
      { id: 'openai', name: 'OpenAI', required: needsOpenAI, configured: !!tenant.openai?.api_key, detail: tenant.openai?.model || 'Model not selected', href: '/integration/openai', keys: { api_key: !!tenant.openai?.api_key } },
      { id: 'discord', name: 'Discord', required: needsDiscord, configured: discord.enabled && discord.verified, detail: [discord.guild_name || discord.guild_id, discord.channel_name || discord.channel_id].filter(Boolean).join(' / ') || 'Server not linked', href: '/integration/discord', keys: { guild_id: !!discord.guild_id, channel_id: !!discord.channel_id } }
    ];

    const issues = [
      ...(parent.setup_errors ?? []).map((item) => ({ level: item.severity === 'error' ? 'error' : 'warning', source: item.source, message: item.message })),
      ...integrations.filter((item) => item.required && !item.configured)
        .map((item) => ({ level: 'error', source: item.name, message: 'Required integration is incomplete.' })),
      ...notifications.filter((item) => item.enabled && !item.emails.length)
        .map((item) => ({ level: 'warning', source: item.source, message: 'Enabled, but no notification email is assigned.' })),
      ...(tenant.domain && !tenant.dns_verified_at && !metadata.dns_verified_at
        ? [{ level: 'warning', source: 'Custom domain', message: 'DNS ownership has not been verified.' }]
        : []),
      ...(!parent.billing_state?.active
        ? [{ level: 'warning', source: 'Billing', message: 'No active workspace subscription.' }]
        : [])
    ];

    return {
      staff_tenant_overview: {
        portal: {
          id: tenant.id ?? null,
          key: tenantRouteKey(tenant),
          name: tenant.name ?? null,
          owner: tenant.client ?? null,
          status: tenant.status ?? 'unknown',
          domain: tenant.domain ?? null,
          who_id: tenant.who_id ?? null,
          dns_verified: !!(tenant.dns_verified_at || metadata.dns_verified_at),
          created_at: tenant.created_at ?? null,
          updated_at: tenant.updated_at ?? null
        },
        access: [...new Set([String(tenant.client ?? '').trim().toLowerCase(), ...accessEmails].filter(Boolean))],
        integrations,
        notifications,
        resources: resourceIds,
        module_entitlements: parent.module_entitlements ?? {},
        billing: parent.billing_state ?? {},
        attention: parent.attention_items ?? [],
        issues,
        checked_at: new Date().toISOString(),
        access_mode: localAdmin ? 'dev-local' : 'staff'
      }
    };
  }
  return await _loadAdminDashboard(event);
}
