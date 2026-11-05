import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const name of ['customers-crm', 'private-pages']) {
  test(`${name} bridge snapshots deep reactive drafts and cleans up failed sends`, async () => {
    const source = readFileSync(new URL(`../../${name}/ui/bridge.js`, import.meta.url), 'utf8').replace('export function', 'function');
    const messages = [], timers = new Map();
    let receive, fail = false, sequence = 0;
    const parent = { postMessage(message) { if (fail) throw new Error('Send failed'); messages.push(structuredClone(message)); } };
    const context = { parent, window: { addEventListener(_type, handler) { receive = handler; } },
      setTimeout(handler) { const id = ++sequence; timers.set(id, handler); return id; }, clearTimeout(id) { timers.delete(id); } };
    runInNewContext(source + '\nthis.request = moduleRequest;', context);
    const company = new Proxy({ name: 'TEST', metadata: new Proxy({ tags: ['VIP'] }, {}) }, {});
    assert.throws(() => structuredClone(company));
    const pending = context.request({ action: 'company', company });
    company.name = 'Later change';
    assert.equal(messages[0].body.company.name, 'TEST');
    assert.equal(messages[0].body.company.metadata.tags[0], 'VIP');
    receive({ source: parent, data: { type: 'workspace:response', id: messages[0].id, status: 200, result: { saved: true } } });
    assert.deepEqual(await (await pending).json(), { saved: true });
    assert.equal(timers.size, 0);
    fail = true;
    await assert.rejects(context.request({ action: 'company', company }), /Send failed/);
    assert.equal(timers.size, 0);
    const cyclic = {}; cyclic.self = cyclic;
    await assert.rejects(context.request(cyclic), /circular/i);
    assert.equal(timers.size, 0);
  });
}
