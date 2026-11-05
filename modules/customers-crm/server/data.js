import { randomUUID } from 'node:crypto';
const defaults = { stages: [{ id: 'lead', label: 'Lead' }, { id: 'active', label: 'Active' }, { id: 'vip', label: 'VIP' }, { id: 'paused', label: 'Paused' }], tags: ['VIP', 'Invoice', 'Support', 'Repeat customer'] };
const text = (value, maximum = 4000, required = false) => { if (typeof (value ?? '') !== 'string' || (value ?? '').length > maximum || (required && !value.trim())) throw new Error('Invalid CRM text.'); return (value ?? '').trim(); };
const identifier = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,119}$/.test(value)) throw new Error('Invalid CRM ID.'); return value; };
const strings = (value = []) => { if (!Array.isArray(value) || value.length > 50) throw new Error('Invalid tags.'); return [...new Set(value.map(entry => text(entry, 80, true)))]; };
const email = value => { const result = text(value, 320).toLowerCase(); if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('Invalid email address.'); return result; };
function stateOf(value = {}) {
  const result = { settings: value.settings ?? structuredClone(defaults), customers: value.customers ?? [], companies: value.companies ?? [], activities: value.activities ?? [] };
  if (['customers', 'companies', 'activities'].some(key => !Array.isArray(result[key]))) throw new Error('CRM state is damaged; restore from backup.');
  return structuredClone(result);
}
function relation(state, table, id) { if (!id) return ''; identifier(id); if (!state[table].some(row => row.id === id && !row.deleted_at)) throw new Error('Linked CRM record is unavailable.'); return id; }
function normalized(state, type, input, previous, now) {
  const common = { id: identifier(input.id || randomUUID()), created_at: previous?.created_at ?? now, updated_at: now, deleted_at: previous?.deleted_at ?? null };
  if (common.deleted_at) throw new Error('Restore the record before editing.');
  if (type === 'activity') {
    if (!['note', 'call', 'email', 'meeting', 'task'].includes(input.type)) throw new Error('Invalid activity type.');
    const due = input.due_at ? new Date(input.due_at) : null; if (due && (!Number.isFinite(due.valueOf()) || typeof input.due_at !== 'string' || !input.due_at.endsWith('Z'))) throw new Error('Activity deadline must be an ISO UTC timestamp.');
    return { ...common, title: text(input.title, 240, true), body: text(input.body), type: input.type, due_at: due?.toISOString() ?? null, done: input.done === true, customer_id: relation(state, 'customers', input.customer_id), company_id: relation(state, 'companies', input.company_id) };
  }
  const result = { ...common, name: text(input.name, 240, true), email: email(input.email), phone: text(input.phone, 120), note: text(input.note), metadata: { sources: ['crm'], virtual: false } };
  if (type === 'customer') {
    if (!state.settings.stages.some(stage => stage.id === input.stage)) throw new Error('Unknown CRM stage.');
    const value = Number(input.value ?? 0); if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('Invalid estimated value.');
    return { ...result, company_id: relation(state, 'companies', input.company_id), stage: input.stage, value, tags: strings(input.tags) };
  }
  const website = text(input.website, 2048); if (website) { const url = new URL(website); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS company website.'); }
  return { ...result, website };
}
export function manage({ payload }) {
  const state = stateOf(payload.state);
  if (payload.operation === 'read') return { result: state };
  if (payload.operation !== 'write') throw new Error('CRM only accepts private administrator operations.');
  const body = payload.body ?? {}, now = new Date().toISOString();
  if (['customer', 'company', 'activity'].includes(body.action)) {
    const table = { customer: 'customers', company: 'companies', activity: 'activities' }[body.action], input = body[body.action] ?? {}, previous = state[table].find(row => row.id === input.id);
    if (!previous && state[table].length >= 1000) throw new Error('CRM record limit reached.');
    const row = normalized(state, body.action, input, previous, now);
    state[table] = previous ? state[table].map(value => value.id === row.id ? row : value) : [row, ...state[table]];
  } else if (body.action === 'settings') {
    const stages = body.settings?.stages;
    if (!Array.isArray(stages) || !stages.length || stages.length > 30) throw new Error('Use between one and 30 CRM stages.');
    const normalized = stages.map(stage => ({ id: identifier(stage.id), label: text(stage.label, 120, true) }));
    if (new Set(normalized.map(stage => stage.id)).size !== normalized.length || state.customers.some(row => !normalized.some(stage => stage.id === row.stage))) throw new Error('Stage IDs must be unique; stages used by customers cannot be removed.');
    state.settings = { stages: normalized, tags: strings(body.settings.tags) };
  } else if (['archive', 'restore'].includes(body.action)) {
    if (!['customers', 'companies', 'activities'].includes(body.table)) throw new Error('Invalid CRM collection.');
    const row = state[body.table].find(value => value.id === identifier(body.id)); if (!row) throw new Error('CRM record not found.');
    if (body.action === 'restore') { if (row.company_id) relation(state, 'companies', row.company_id); if (row.customer_id) relation(state, 'customers', row.customer_id); }
    row.deleted_at = body.action === 'archive' ? now : null; row.updated_at = now;
  } else throw new Error('Unknown CRM operation.');
  return { state, result: state };
}
