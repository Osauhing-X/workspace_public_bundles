import test from 'node:test';
import assert from 'node:assert/strict';
import {member} from '../server/member.mjs';

const actor={source:'dashboard',subject:'synthetic-verified-user',email:'worker@example.test'};
const state={active_kanban_id:'work',kanbans:[{id:'work',name:'Delivery',boards:[],cards:[]},{id:'plans',name:'Planning',boards:[],cards:[]}]};
test('member reads preserve all shared board sets and use the verified actor',()=>{
 const response=member({actor,payload:{operation:'member',action:'read',state,body:{actor:{email:'forged@example.test'}}}});
 assert.deepEqual(response.result.settings,state);assert.equal(response.result.user_email,actor.email);assert.equal(response.result.exists,true);assert.equal(Object.hasOwn(response,'state'),false);
});
test('member writes return a proposed state for Core validation, never credentials or file paths',()=>{
 const changed=structuredClone(state);changed.kanbans[0].name='Updated';
 const response=member({actor,payload:{operation:'member',action:'settings',state,body:{settings:changed,instance_id:'other'}}});
 assert.deepEqual(response.state,changed);assert.equal(response.result.user_email,actor.email);assert.deepEqual(state.kanbans[0].name,'Delivery');
 for(const body of [{},{settings:[]},{settings:null}])assert.throws(()=>member({actor,payload:{operation:'member',action:'settings',state,body}}),/board settings/);
});
test('owner operation names and unverified actors cannot select member actions',()=>{
 for(const operation of ['provider','integration-result','module-api'])assert.throws(()=>member({actor,payload:{operation,action:'read',state}}),/Verified/);
 for(const action of ['provider','admin','remove-instance'])assert.throws(()=>member({actor,payload:{operation:'member',action,state}}),/Unsupported/);
 assert.throws(()=>member({actor:{...actor,source:'browser'},payload:{operation:'member',action:'read',state}}),/Verified/);
});
