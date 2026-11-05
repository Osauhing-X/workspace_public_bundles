const name = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
export function templateFields(source, existing = {}) {
  return Object.fromEntries([...String(source).matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_-]{0,63})\}\}/g)].map(match => [match[1], String(existing[match[1]] ?? '')]));
}
export function validateFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length > 100) throw new Error('Template fields must be a JSON object with up to 100 entries.');
  const next = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!name.test(key) || ['constructor', 'prototype'].includes(key) || typeof value !== 'string' || value.length > 10000) throw new Error('Template fields need valid names and text values up to 10,000 characters.');
    next[key] = value;
  }
  return next;
}
export function renderTemplate(source, fields) {
  const values = validateFields(fields);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return String(source).replace(/\{\{([a-zA-Z][a-zA-Z0-9_-]{0,63})\}\}/g, (_match, key) => escape(values[key] ?? ''));
}
