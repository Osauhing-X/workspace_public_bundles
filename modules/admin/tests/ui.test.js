import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const html = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
test('Admin script parses and declares a network-disabled sandbox document', () => {
  assert.doesNotThrow(() => new Script(script));
  assert.match(html, /connect-src 'none'; form-action 'none'; base-uri 'none'/);
  assert.doesNotMatch(script, /innerHTML|fetch\(|localStorage|document\.cookie|eval\(/);
  assert.match(script, /event\.source!==parent/);
  assert.match(script, /clearTimeout\(item.timer\)/);
});
test('project and task editor retains unsaved drafts on errors and guarded navigation', () => {
  assert.match(script, /if\(dirty&&!await ask\('Discard unsaved changes\?'/);
  assert.doesNotMatch(script, /\bconfirm\(/);
  assert.match(html, /role="alertdialog"/);
  assert.match(script, /catch\(error\)\{notice\(error.message,true\);return false;/);
  assert.match(script, /if\(!dirty\)setEditor\(\)/);
  assert.match(script, /\$\('save'\)\.type='button'/);
  assert.match(script, /\$\('save'\)\.onclick=save/);
  assert.match(script, /form\.reportValidity\(\)/);
  assert.match(script, /field\.disabled=blocked/);
  assert.match(script, /setEditor\(\);render\(\);load\(\)/);
  assert.match(script, /editing\?\?=crypto.randomUUID\(\);record.id=editing/);
  assert.match(script, /\},45000\)/);
  assert.match(html, /aria-live="polite"/);
  for (const field of ['title', 'status', 'customer', 'type', 'highlight', 'project_id', 'assignee', 'priority', 'due', 'note']) assert.match(html, new RegExp('name="'+field+'"'));
});

test('confirmation isolates controls and supports keyboard cancellation and focus return', () => {
  assert.match(html, /aria-modal="true"/);
  assert.match(script, /busy\|\|!ready\|\|answer/);
  assert.match(script, /area\.inert=Boolean\(answer\)/);
  assert.match(script, /event\.key==='Escape'/);
  assert.match(script, /event\.key==='Tab'/);
  assert.match(script, /returnFocus\.focus\(\)/);
});

test('resize uses content height rather than the frame viewport minimum', () => {
  const source = script.match(/function resize\(\)\{[^\n]+\}/)[0];
  const messages = [];
  const context = { document: { body: { getBoundingClientRect: () => ({ height: 823.2 }) }, documentElement: { scrollHeight: 10000 } }, parent: { postMessage: message => messages.push(message) } };
  new Script(source+'; resize(); resize();').runInNewContext(context);
  assert.deepEqual(messages.map(message => message.height), [824, 824]);
});
