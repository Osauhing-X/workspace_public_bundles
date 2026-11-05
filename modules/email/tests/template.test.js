import test from 'node:test';
import assert from 'node:assert/strict';
import { templateFields, validateFields, renderTemplate } from '../ui/template.js';
test('Email templates use shared HTML and escaped text fields without evaluating author code', () => {
  const source = '<h1>{{title}}</h1><p>{{description}}</p>';
  assert.deepEqual(templateFields(source), { title: '', description: '' });
  assert.equal(renderTemplate(source, { title: '<script>TEST</script>', description: 'A & B' }), '<h1>&lt;script&gt;TEST&lt;/script&gt;</h1><p>A &amp; B</p>');
  assert.throws(() => validateFields([]));
  assert.throws(() => validateFields({ constructor: 'x' }));
  assert.throws(() => validateFields({ title: 123 }));
});
