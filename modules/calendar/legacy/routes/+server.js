import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { requireTenantAccess } from '$lib/server/auth.js';
import { tenant_supabase } from '$lib/server/tenant.js';
import { listBookings } from '$lib/server/booking.js';
import { listRentRequests } from '$lib/server/rent.js';

const CALENDAR_BUCKET = 'CALENDAR';

async function textFromDownload(data) {
  return data ? await data.text() : null;
}

async function ensureCalendarBucket(tenant) {
  const supabase = tenant_supabase(tenant)?.client;
  if (!supabase) return { ok: false, error: 'No Supabase connection' };

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) return { ok: false, error: listError.message };

  const exists = (buckets ?? []).some((bucket) => bucket.name === CALENDAR_BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(CALENDAR_BUCKET, { public: false });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, supabase };
}

async function listReminders(tenant) {
  const ready = await ensureCalendarBucket(tenant);
  if (!ready.ok) return { reminders: [], error: ready.error };

  const { data: files, error } = await ready.supabase.storage.from(CALENDAR_BUCKET).list('reminders');
  if (error) return { reminders: [], error: error.message };

  const reminders = [];
  for (const file of files ?? []) {
    if (!file.name?.endsWith('.json')) continue;
    const { data } = await ready.supabase.storage.from(CALENDAR_BUCKET).download(`reminders/${file.name}`);
    try {
      const reminder = JSON.parse(await textFromDownload(data));
      reminders.push(reminder);
    } catch {
      // Ignore broken reminder files so one bad upload does not break the calendar.
    }
  }

  return { reminders };
}

async function saveReminder(tenant, input, email) {
  const ready = await ensureCalendarBucket(tenant);
  if (!ready.ok) return ready;

  const title = String(input.title ?? '').trim();
  const starts_at = String(input.starts_at ?? '').trim();
  if (!title || !starts_at) return { ok: false, error: 'Reminder title and date are required' };

  const reminder = {
    id: randomUUID(),
    type: 'reminder',
    title,
    starts_at,
    note: String(input.note ?? '').trim(),
    created_by: email,
    created_at: new Date().toISOString()
  };

  const { error } = await ready.supabase.storage
    .from(CALENDAR_BUCKET)
    .upload(`reminders/${reminder.id}.json`, new Blob([JSON.stringify(reminder, null, 2)], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json'
    });

  if (error) return { ok: false, error: error.message };
  return { ok: true, reminder };
}

async function removeReminder(tenant, id) {
  const ready = await ensureCalendarBucket(tenant);
  if (!ready.ok) return ready;

  const { error } = await ready.supabase.storage.from(CALENDAR_BUCKET).remove([`reminders/${id}.json`]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function eventsFromBookings(bookings = []) {
  return bookings
    .filter((booking) => ['requested', 'confirmed', 'billing'].includes(booking.status))
    .map((booking) => ({
      id: `booking:${booking.id}`,
      type: 'booking',
      title: booking.service_name,
      subtitle: `${booking.name} - ${booking.status}`,
      customer: booking.name,
      email: booking.email,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      status: booking.status,
      href: '/modules/booking'
    }));
}

function eventsFromRent(requests = []) {
  return requests
    .filter((request) => ['requested', 'approved', 'active'].includes(request.status))
    .map((request) => ({
      id: `rent:${request.id}`,
      type: 'rent',
      title: request.listing_title,
      subtitle: `${request.name} - ${request.status}`,
      customer: request.name,
      email: request.email,
      starts_at: request.desired_start ? `${request.desired_start}T09:00:00` : request.created_at,
      ends_at: request.desired_end ? `${request.desired_end}T17:00:00` : '',
      status: request.status,
      href: '/modules/rent'
    }));
}

export async function GET({ locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });

  const [bookings, rent, reminders] = await Promise.all([
    listBookings(locals.tenant),
    listRentRequests(locals.tenant),
    listReminders(locals.tenant)
  ]);

  const events = [
    ...eventsFromBookings(bookings.bookings),
    ...eventsFromRent(rent.requests),
    ...(reminders.reminders ?? [])
  ].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));

  return json({
    events,
    errors: [bookings.error, rent.error, reminders.error].filter(Boolean)
  });
}

export async function POST({ request, locals, cookies }) {
  const access = await requireTenantAccess(cookies, locals.tenant);
  if (access.error) return json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));

  if (body.action === 'reminder') {
    const result = await saveReminder(locals.tenant, body.reminder ?? {}, access.user?.email);
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'delete_reminder') {
    const result = await removeReminder(locals.tenant, body.id);
    return json(result, { status: result.ok ? 200 : 400 });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}
