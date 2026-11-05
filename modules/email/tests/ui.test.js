import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('original Email builder runs in the opaque sandbox without executable previews or native submits', () => {
  const builder = readFileSync(new URL('../legacy/ui/email_builder.svelte', import.meta.url), 'utf8');
  assert.match(builder, /title="Email preview" sandbox=""/);
  assert.doesNotMatch(builder, /innerHTML|attachShadow|<form|type="submit"/);
  assert.doesNotMatch(builder, /--override-section:\s*#101010|--override-text:\s*#f7f7f7|backdrop-filter:\s*brightness/);
  const module = readFileSync(new URL('../ui/Module.svelte', import.meta.url), 'utf8');
  assert.match(module, /Confirm and send/);
  assert.match(module, /confirm_send: true/);
  assert.match(module, /dialog.showModal\(\)/);
  assert.match(module,/type:'workspace:dialog',open:true/);
  assert.match(module,/type:'workspace:dialog',open:false/);
  assert.match(module, /aria-labelledby="email-confirm-title"/);
  assert.match(module, /oncancel=\{\(\)=>confirming=false\}/);
  assert.match(module, /blocked this request before contacting the email provider/);
  assert.match(module, /Retry loading saved content/);
  assert.match(module, /audienceEnabled=\{false\}/);
});
