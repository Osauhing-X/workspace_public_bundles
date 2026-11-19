import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTagInput, taskMatches, tagKey} from '../ui/tags.js';

test('label drafts retain Unicode, normalize equivalent labels and reject oversized input',()=>{
  assert.deepEqual(parseTagInput(' UI/UX, ui/ux, Töö, 🔧, '),['UI/UX','Töö','🔧']);
  assert.deepEqual(parseTagInput(''),[]);
  assert.equal(tagKey(' Töö '),'töö');
  assert.equal(parseTagInput('🔧'.repeat(32))[0].length,64);
  for(const value of ['x'.repeat(33),'a\nb',Array.from({length:21},(_,i)=>'tag'+i).join(',')])assert.throws(()=>parseTagInput(value));
});

test('search and label filters are combined without changing cards or hiding matching completed cards',()=>{
  const cards=[{id:'old',title:'Legacy task',done:false},{id:'new',title:'Prepare launch',description:'Client approval',tags:['UI','Review'],done:true}];
  const original=structuredClone(cards);
  assert.equal(taskMatches(cards[0]),true);
  assert.equal(taskMatches(cards[0],'','ui'),false);
  assert.equal(taskMatches(cards[1],'approval','ui'),true);
  assert.equal(taskMatches(cards[1],'missing','ui'),false);
  assert.equal(taskMatches(cards[1],'review'),true);
  assert.deepEqual(cards,original);
});
