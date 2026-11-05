import test from 'node:test';
import assert from 'node:assert/strict';
import { manage } from '../server/data.js';
import { cloneDraft } from '../ui/drafts.js';
import { readFileSync } from 'node:fs';

test('customer tags update before save and new customers require an explicit company choice', () => {
  const editor = readFileSync(new URL('../legacy/routes/crm-customers.svelte', import.meta.url), 'utf8');
  assert.match(editor, /Tags \(comma-separated\).*bind:value=\{tagDraft\}/);
  assert.match(editor, /tags: tagDraft\.split\(','\)/);
  assert.match(editor, /company_id: ''/);
  assert.doesNotMatch(editor, /company_id: companies\[0\]/);
});
test('reactive proxies produce independent editable JSON drafts', () => {
  const original = { stages: [{ id: 'lead', label: 'Lead' }], tags: ['VIP'] };
  const proxy = new Proxy(original, {});
  assert.throws(() => structuredClone(proxy));
  const draft = cloneDraft(proxy);
  draft.stages[0].label = 'Changed'; draft.tags.push('New');
  assert.equal(original.stages[0].label, 'Lead');
  assert.deepEqual(original.tags, ['VIP']);
});
const apply = (state, body) => manage({ payload: { operation: 'write', state, body } }).state;
test('original company/customer/activity fields save, update, complete and reopen without mutating prior state', () => {
  let state = apply({}, { action: 'company', company: { id: 'company-test', name: 'TEST Company', website: 'https://example.invalid', email: 'Business@example.invalid', note: 'Private company note' } });
  const before = structuredClone(state);
  state = apply(state, { action: 'customer', customer: { id: 'customer-test', name: 'TEST customer', email: 'Customer@example.invalid', company_id: 'company-test', stage: 'lead', tags: ['VIP'], value: 42, note: 'Private customer note' } });
  assert.deepEqual(before.companies, state.companies); assert.equal(before.customers.length, 0);
  state = apply(state, { action: 'activity', activity: { id: 'activity-test', title: 'Follow up', type: 'task', customer_id: 'customer-test', company_id: 'company-test', body: 'Private task', due_at: '2026-10-06T12:00:00Z' } });
  state = apply(state, { action: 'customer', customer: { ...state.customers[0], name: 'Renamed', stage: 'active' } });
  assert.equal(state.customers.length, 1); assert.equal(state.customers[0].email, 'customer@example.invalid'); assert.equal(state.activities[0].customer_id, 'customer-test');
  state = apply(state, { action: 'activity', activity: { ...state.activities[0], done: true } }); assert.equal(state.activities[0].done, true);
  state = apply(state, { action: 'activity', activity: { ...state.activities[0], done: false } }); assert.equal(state.activities[0].done, false);
  assert.deepEqual(manage({ payload: { operation: 'read', state } }).result, state);
});
test('archive preserves relationships and restoration requires available parents', () => {
  let state = apply({}, { action: 'company', company: { id: 'company-test', name: 'Company' } });
  state = apply(state, { action: 'customer', customer: { id: 'customer-test', name: 'Customer', company_id: 'company-test', stage: 'lead' } });
  state = apply(state, { action: 'archive', table: 'customers', id: 'customer-test' });
  state = apply(state, { action: 'archive', table: 'companies', id: 'company-test' });
  assert.equal(state.customers[0].company_id, 'company-test');
  assert.throws(() => apply(state, { action: 'restore', table: 'customers', id: 'customer-test' }), /unavailable/);
  state = apply(state, { action: 'restore', table: 'companies', id: 'company-test' });
  state = apply(state, { action: 'restore', table: 'customers', id: 'customer-test' }); assert.equal(state.customers[0].deleted_at, null);
});
test('CRM rejects invalid foreign relationships, executable URLs, stage/value and public/provider operations', () => {
  const valid = { id: 'customer-test', name: 'Customer', stage: 'lead' };
  for (const changes of [{ company_id: 'foreign-id' }, { stage: 'unknown' }, { value: -1 }, { email: 'invalid' }]) assert.throws(() => apply({}, { action: 'customer', customer: { ...valid, ...changes } }));
  assert.throws(() => apply({}, { action: 'company', company: { name: 'Company', website: 'javascript:alert(1)' } }));
  assert.throws(() => apply({}, { action: 'activity', activity: { title: 'Test', type: 'task', due_at: '2026-10-06T12:00' } }));
  assert.throws(() => apply({}, { action: 'archive', table: '__proto__', id: 'test-id' }));
  for (const operation of ['public-submit', 'integration-result']) assert.throws(() => manage({ payload: { operation, state: {}, body: {} } }), /private administrator/);
});
test('stage settings cannot invalidate active or archived customer records', () => {
  let state = apply({}, { action: 'customer', customer: { id: 'customer-test', name: 'Customer', stage: 'lead' } });
  state = apply(state, { action: 'archive', table: 'customers', id: 'customer-test' });
  assert.throws(() => apply(state, { action: 'settings', settings: { stages: [{ id: 'active', label: 'Active' }], tags: [] } }), /cannot be removed/);
  state = apply(state, { action: 'settings', settings: { stages: [{ id: 'lead', label: 'Potential customer' }], tags: ['TEST'] } });
  assert.equal(state.settings.stages[0].label, 'Potential customer');
  assert.equal(state.customers[0].stage, 'lead');
});
