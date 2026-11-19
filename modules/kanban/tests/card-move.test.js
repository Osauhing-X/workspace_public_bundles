import test from 'node:test';
import assert from 'node:assert/strict';
import {relocatedCards,beginCardDrag} from '../ui/card-move.js';

const board=()=>({boards:[{id:'todo'},{id:'doing'}],cards:[{id:'source',board_id:'todo',order:0,title:'Keep me',note:'Keep note',tags:['UI'],assigned:['fixture@example.test'],done:true},{id:'target',board_id:'doing',order:100,title:'Existing task'}]});
test('moving appends after sparse target orders and preserves every card field without mutating the source',()=>{
 const input=board(),before=structuredClone(input),cards=relocatedCards(input,'source','doing','2026-11-19T17:00:00.000Z');
 assert.deepEqual(input,before);assert.equal(cards.length,before.cards.length);
 assert.deepEqual(cards[0],{...before.cards[0],board_id:'doing',order:101,updated_at:'2026-11-19T17:00:00.000Z'});
 assert.deepEqual(cards[1],before.cards[1]);
 assert.equal(relocatedCards(input,'missing','doing'),null);
 assert.equal(relocatedCards(input,'source','foreign-column'),null);
 assert.equal(relocatedCards(input,'source','todo'),null);
});
test('maximum imported order values are reindexed safely without losing completed tasks or labels',()=>{
 const input=board();input.cards[1].order=Number.MAX_SAFE_INTEGER;
 const cards=relocatedCards(input,'source','doing');
 assert.equal(cards[0].order,1);assert.equal(cards[1].order,0);
 assert.equal(cards[0].done,true);assert.deepEqual(cards[0].tags,['UI']);
 assert.equal(input.cards[1].order,Number.MAX_SAFE_INTEGER);
});
test('native drag supplies transfer data and blocks editable controls and disabled drafts',()=>{
 function event(interactive=false){return {prevented:false,stopped:false,target:{closest:()=>interactive},dataTransfer:{values:[],setData(type,value){this.values.push([type,value]);}},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};}
 const accepted=event();assert.equal(beginCardDrag(accepted,'source'),'source');
 assert.deepEqual(accepted.dataTransfer.values,[['text/plain','source']]);assert.equal(accepted.dataTransfer.effectAllowed,'move');assert.equal(accepted.stopped,true);
 for(const [input,disabled] of [[event(true),false],[event(),true],[{...event(),dataTransfer:null},false]]){
  assert.equal(beginCardDrag(input,'source',disabled),null);assert.equal(input.prevented,true);
 }
});
