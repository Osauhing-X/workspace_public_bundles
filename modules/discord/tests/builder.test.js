import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDiscordPreview} from './preview.mjs';
test('builder script parses and uses safe DOM previews, explicit edits and preserved drafts',()=>{
 const html=readFileSync(new URL('../ui/index.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(script));
 for(const feature of ['Message builder','embed-fields','builder-confirm','confirm_delete:true','rememberDraft','Restore previous draft','localTimestamp','dataset.initialValue','width:min(100%,1440px)'])assert.ok(html.includes(feature),feature);
 assert.doesNotMatch(html,/innerHTML\s*=|new Function\(|eval\(/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/if\(value.editable\)/);
 assert.match(html,/\$\(button\)\.onclick=event/);
 assert.match(html,/reportValidity\(\)/);
 assert.match(html,/id="builder-submit" class="primary" type="button"/);
});
test('disposable preview exercises real send/edit/delete handlers without a Discord connection',async t=>{
 const server=await createDiscordPreview();t.after(()=>new Promise(resolve=>server.close(resolve)));const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async body=>{const response=await fetch(origin+'/fixture/module',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,result.error);return result;};
 assert.match(await(await fetch(origin)).text(),/SYNTHETIC ONLY/);
 const initial=await call(null),room=initial.state.rooms[0].id;
 const sent=await call({action:'provider',operation:'compose-message',payload:{room_id:room,content:'',embeds:[{title:'TEST send'}]}});
 assert.equal(sent.receipts.at(-1).method,'POST');const message=sent.state.messages[room].at(-1);
 const edited=await call({action:'provider',operation:'edit-message',payload:{room_id:room,message_id:message.id,expected_revision:message.revision,embeds:[{title:'TEST edit'}],confirm_edit:true}});assert.equal(edited.receipts.at(-1).embeds[0].title,'TEST edit');
 const current=edited.state.messages[room].find(value=>value.id===message.id);
 const deleted=await call({action:'provider',operation:'delete-message',payload:{room_id:room,message_id:message.id,expected_revision:current.revision,confirm_delete:true}});assert.equal(deleted.state.messages[room].some(value=>value.id===message.id),false);
 const blocked=await fetch(origin+'/fixture/module',{method:'POST',headers:{origin:'https://unrelated.example','content-type':'application/json'},body:'null'});assert.equal(blocked.status,403);
});
