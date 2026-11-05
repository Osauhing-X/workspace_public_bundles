import test from 'node:test';
import assert from 'node:assert/strict';
import { manage } from '../server/data.js';
import { readFileSync } from 'node:fs';

const selected = { id: '333333333333333333', name: '<Community>', type: 11, parent_id: '222222222222222222' };
const update = (state, action, result) => manage({ payload: { operation: 'integration-result', state, body: { action, result } } }).state;
test('Discord results stay private and legacy publication operations are rejected', () => {
  let state = update({}, 'refresh-rooms', { channel: { id: '222222222222222222', name: 'Forum', type: 15 }, rooms: [selected] });
  state = update(state, 'read-messages', { room: selected, messages: [{ id: '444444444444444444', channel_id: selected.id, author: 'Private sender', content: '<script>bad()</script>', timestamp: '2026-10-07T00:00:00Z' }] });
  state = update(state, 'send-message', { room: selected, message: { id: '555555555555555555', content: 'New private message' } });
  for (const action of ['publish', 'unpublish']) {
    assert.throws(() => manage({ payload: { operation: 'write', state, body: { action, confirm_public: true } } }), /Unknown/);
  }
  const result = manage({ payload: { operation: 'read', state: { ...state, publication: { title: 'Legacy snapshot' } } } }).result;
  assert.equal(Object.hasOwn(result, 'publication'), false);
  assert.equal(state.messages[selected.id].length, 2);
  assert.throws(() => manage({ payload: { operation: 'write', state, body: { action: 'refresh-rooms', result: {} } } }), /Unknown/);
});
test('Discord message cache is bounded and unknown rooms are removed on refresh', () => {
  let state = {};
  for (let n = 0; n < 10; n++) state = update(state, 'read-messages', { room: { ...selected, id: `${333333333333333300n + BigInt(n)}` }, messages: Array.from({ length: 70 }, (_, index) => ({ id: String(index), content: 'sample' })) });
  assert.equal(Object.keys(state.messages).length, 5);
  assert.ok(Object.values(state.messages).every(messages => messages.length === 50));
  state = update(state, 'refresh-rooms', { channel: { id: selected.parent_id }, rooms: [] });
  assert.deepEqual(state.messages, {});
});
test('Discord package has a real opaque-origin UI without a Website renderer declaration', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(manifest.ui.document, 'ui/index.html');
  assert.equal(manifest.application_imports, undefined);
  assert.equal(manifest.ui.data.public_export, undefined);
  const ui = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  assert.match(ui, /event.source!==parent/);
  assert.match(ui, /connect-src 'none'/);
  assert.doesNotMatch(ui, /innerHTML\s*=/);
  assert.match(ui, /textContent=text/);
});

test('embed edits and deletes update private cache',()=>{
 const original={id:'444444444444444444',channel_id:selected.id,author:'Bot',content:'Original',embeds:[{title:'Original embed'}],editable:true};
 let state=update({},'read-messages',{room:selected,messages:[original]});
 state=update(state,'edit-message',{room:selected,message:{...original,content:'Updated',embeds:[{title:'Changed'}]}});
 assert.equal(state.messages[selected.id].length,1);assert.equal(state.messages[selected.id][0].embeds[0].title,'Changed');assert.equal(state.messages[selected.id][0].editable,true);
 state=update(state,'delete-message',{room:selected,message_id:original.id,deleted:true});assert.equal(state.messages[selected.id].length,0);
});

test('rich message cache stays within the Core envelope',()=>{
 let state={};
 for(let n=0;n<6;n++)state=update(state,'read-messages',{room:{...selected,id:String(333333333333333300n+BigInt(n))},messages:Array.from({length:50},(_,i)=>({id:String(i),content:'Text',embeds:[{description:'a'.repeat(6000)}]}))});
 assert.ok(Buffer.byteLength(JSON.stringify(state.messages),'utf8')<=192*1024);
});
