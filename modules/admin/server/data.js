import { randomUUID } from 'node:crypto';

const text = (value = '', limit = 4000, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('Invalid text.');
  return value.trim();
};
const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,119}$/.test(value)) throw new Error('Invalid record ID.');
  return value;
};
const tables = { project: 'projects', task: 'tasks' };
const statuses = { project: ['planned', 'active', 'paused', 'done'], task: ['todo', 'in-progress', 'done'] };
function stateOf(input = {}) {
  const state = { projects: input.projects ?? [], tasks: input.tasks ?? [] };
  for (const rows of Object.values(state)) if (!Array.isArray(rows)) throw new Error('Admin data is damaged; restore a backup.');
  return structuredClone(state);
}
function project(state, value) {
  if (!value) return '';
  const row = state.projects.find(row => row.id === id(value) && !row.archived_at);
  if (!row) throw new Error('Linked project is unavailable.');
  return row.id;
}
export function manage({ payload }) {
  const state = stateOf(payload.state);
  if (payload.operation === 'read') return { result: state };
  if (payload.operation !== 'write') throw new Error('Only private administrator operations are supported.');
  const body = payload.body ?? {}, now = new Date().toISOString();
  if (Object.hasOwn(tables, body.action)) {
    const table = tables[body.action], input = body.record ?? {};
    const recordId = id(input.id || randomUUID()), previous = state[table].find(row => row.id === recordId);
    if (previous?.archived_at) throw new Error('Restore the record before editing.');
    if (!previous && state[table].length >= 1000) throw new Error('Record limit reached.');
    if (!statuses[body.action].includes(input.status)) throw new Error('Invalid status.');
    const row = { id: recordId, title: text(input.title, 240, true), note: text(input.note), status: input.status, created_at: previous?.created_at ?? now, updated_at: now, archived_at: null };
    if (body.action === 'project') {
      row.customer = text(input.customer, 240);
      row.type = text(input.type, 120);
      row.highlight = input.highlight === true;
    } else {
      row.project_id = project(state, input.project_id);
      row.assignee = text(input.assignee, 240);
      row.priority = input.priority ?? 'normal';
      if (!['normal', 'high', 'urgent'].includes(row.priority)) throw new Error('Invalid priority.');
      row.due = text(input.due, 10);
      if (row.due && (!/^\d{4}-\d{2}-\d{2}$/.test(row.due) || !Number.isFinite(Date.parse(row.due)) || new Date(row.due).toISOString().slice(0, 10) !== row.due)) throw new Error('Invalid deadline.');
    }
    state[table] = previous ? state[table].map(value => value.id === row.id ? row : value) : [row, ...state[table]];
  } else if (['archive', 'restore'].includes(body.action)) {
    if (!['projects', 'tasks'].includes(body.table)) throw new Error('Invalid collection.');
    const row = state[body.table].find(row => row.id === id(body.id));
    if (!row) throw new Error('Record not found.');
    if (body.action === 'restore' && body.table === 'tasks') project(state, row.project_id);
    // Do not strand active tasks under an archived project.
    if (body.action === 'archive' && body.table === 'projects' && state.tasks.some(task => task.project_id === row.id && !task.archived_at)) throw new Error('Archive or unlink this project’s tasks first.');
    row.archived_at = body.action === 'archive' ? now : null;
    row.updated_at = now;
  } else throw new Error('Unknown Admin operation.');
  return { state, result: state };
}
