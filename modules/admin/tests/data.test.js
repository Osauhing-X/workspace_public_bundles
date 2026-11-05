import test from 'node:test';
import assert from 'node:assert/strict';
import { manage } from '../server/data.js';
const apply = (state, body) => manage({ payload: { operation: 'write', state, body } }).state;
const project = { id: 'project-test', title: 'TEST Website', status: 'active', customer: 'TEST customer', type: 'Website', note: '<script>not executable</script>', highlight: true };
const task = { id: 'task-test', title: 'TEST review', status: 'todo', project_id: project.id, assignee: 'TEST team', due: '2026-10-08', priority: 'high' };
test('retrying an uncertain write with its retained draft ID does not duplicate the record', () => {
  let state = apply({}, { action: 'project', record: project });
  state = apply(state, { action: 'project', record: project });
  assert.equal(state.projects.length, 1);
  state = apply(state, { action: 'task', record: task });
  state = apply(state, { action: 'task', record: task });
  assert.equal(state.tasks.length, 1);
});
test('projects and linked tasks create, edit, complete, reopen and survive serialized reload', () => {
  let state = apply({}, { action: 'project', record: project });
  const before = structuredClone(state);
  state = apply(state, { action: 'task', record: task });
  assert.equal(before.tasks.length, 0);
  assert.deepEqual(state.projects, before.projects);
  state = apply(state, { action: 'task', record: { ...state.tasks[0], status: 'done' } });
  assert.equal(state.tasks[0].status, 'done');
  state = apply(state, { action: 'task', record: { ...state.tasks[0], status: 'in-progress', title: 'Updated' } });
  state = apply(state, { action: 'project', record: { ...state.projects[0], status: 'done' } });
  assert.equal(state.tasks[0].title, 'Updated');
  assert.equal(state.projects.length, 1);
  assert.deepEqual(manage({ payload: { operation: 'read', state: JSON.parse(JSON.stringify(state)) } }).result, state);
});
test('archive preserves records and prevents stranded task relationships', () => {
  let state = apply({}, { action: 'project', record: project });
  state = apply(state, { action: 'task', record: task });
  assert.throws(() => apply(state, { action: 'archive', table: 'projects', id: project.id }), /tasks first/);
  state = apply(state, { action: 'archive', table: 'tasks', id: task.id });
  state = apply(state, { action: 'archive', table: 'projects', id: project.id });
  assert.throws(() => apply(state, { action: 'restore', table: 'tasks', id: task.id }), /unavailable/);
  assert.throws(() => apply(state, { action: 'task', record: task }), /Restore/);
  state = apply(state, { action: 'restore', table: 'projects', id: project.id });
  state = apply(state, { action: 'restore', table: 'tasks', id: task.id });
  assert.equal(state.tasks[0].archived_at, null);
});
test('invalid inputs, foreign relationships and public writes fail without altering state', () => {
  const state = apply({}, { action: 'project', record: project });
  for (const changes of [{ status: 'root' }, { due: '2026-02-30' }, { due: 'bad' }, { priority: 'root' }, { project_id: 'foreign-project' }, { title: '' }, { note: 'x'.repeat(4001) }]) assert.throws(() => apply(state, { action: 'task', record: { ...task, ...changes } }));
  for (const action of ['__proto__', 'constructor', 'delete']) assert.throws(() => apply(state, { action }));
  assert.throws(() => apply(state, { action: 'archive', table: '__proto__', id: project.id }));
  assert.throws(() => manage({ payload: { state, operation: 'public-submit' } }), /private administrator/);
  assert.equal(state.tasks.length, 0);
  assert.throws(() => manage({ payload: { operation: 'read', state: { tasks: {} } } }), /damaged/);
});
