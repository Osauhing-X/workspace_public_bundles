import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../server/public.js';
test('Audience Website renderer requires publication and explicit consent', () => {
  assert.match(render({ payload: { public_enabled: false } }), /not published/);
  const html = render({ payload: { public_enabled: true, instance_id: 'audience-test' } });
  assert.match(html, /action="\/@_module_forms\/audience-test"/);
  assert.match(html, /name="answer:consent" value="yes" required/);
  assert.match(html, /name="answer:email"[^>]*required/);
  assert.doesNotMatch(html, /RESEND_API_KEY|contact list/);
  const ui = readFileSync(new URL('../legacy/ui/audience_module.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /<form/);
  assert.match(ui, /Confirm permanent removal/);
  assert.match(ui,/aria-label="Search audience"/);
});
