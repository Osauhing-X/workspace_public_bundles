import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { advanceDayDrag } from '../legacy/ui/day_drag.js';

test('mobile month rows shrink empty space but retain all occupied event lanes', () => {
  const source = readFileSync(new URL('../legacy/ui/calendar_month_view.svelte', import.meta.url), 'utf8');
  assert.match(source, /Math.max\(2, \.\.\.bars.map\(event => event.lane \+ 1\)\)/);
  assert.match(source, /--event-lanes:\$\{lanes\}/);
  assert.match(source, /min-height: calc\(38px \+ var\(--event-lanes, 2\) \* 24px\)/);
  assert.match(source, /\{#each bars as event\}/);
  const page = readFileSync(new URL('../legacy/routes/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /max-width: 1440px; margin-inline: auto/);
});
test('Reminder save uses a button action compatible with the no-forms sandbox', () => {
  const source = readFileSync(new URL('../legacy/ui/calendar_reminder_form.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<form\b/);
  assert.match(source, /<button type="button"[^>]*onclick=\{onSave\}/);
});

test('drag advances hours without requiring physical overflow and retains sub-hour movement',()=>{
  let drag={pointerId:1,x:500,remainder:0};
  drag=advanceDayDrag(drag,470,60);assert.equal(drag.steps,0);assert.equal(drag.remainder,30);
  drag=advanceDayDrag(drag,439,60);assert.equal(drag.steps,1);assert.equal(drag.remainder,1);
  drag=advanceDayDrag(drag,619,60);assert.equal(drag.steps,-2);assert.equal(drag.remainder,-59);
  drag=advanceDayDrag(drag,620,60);assert.equal(drag.steps,-1);assert.equal(drag.remainder,0);
  assert.equal(drag.pointerId,1);
});

test('drag handles both directions and several day boundaries without scrollLeft clamping',()=>{
  const start={pointerId:7,x:0,remainder:0};
  assert.equal(advanceDayDrag(start,-1560,52).steps,30);
  assert.equal(advanceDayDrag(start,1560,52).steps,-30);
  for(const width of [52,62.5,100])assert.equal(advanceDayDrag(start,-width*3,width).steps,3);
  const source=readFileSync(new URL('../legacy/ui/calendar_day_view.svelte',import.meta.url),'utf8');
  const move=source.split('function moveDayDrag(event) {')[1].split('function endDayDrag')[0];
  assert.match(move,/advanceDayDrag\(dayDrag, event.clientX, DAY_HOUR_WIDTH\)/);
  assert.doesNotMatch(move,/scrollLeft/);
  assert.match(source,/event.pointerId !== dayDrag.pointerId/);
  assert.match(source,/onlostpointercapture=\{endDayDrag\}/);
  assert.match(source,/touch-action: pan-y/);
});

test('day timeline supports keyboard navigation, visible focus and a truthful illustrated empty state',()=>{
  const source=readFileSync(new URL('../legacy/ui/calendar_day_view.svelte',import.meta.url),'utf8');
  assert.match(source,/tabindex="0"/);assert.match(source,/onkeydown=\{moveWithKeyboard\}/);
  assert.match(source,/ArrowLeft: -1, ArrowRight: 1, PageUp: -6, PageDown: 6/);
  assert.match(source,/event.target !== event.currentTarget/);
  assert.match(source,/event.target.closest\('button'\)/);
  assert.match(source,/day-view:focus-visible/);
  assert.match(source,/\{#if !dayEvents.length\}/);assert.match(source,/No events in this time window/);
  assert.match(source,/<svg[^>]*aria-hidden="true"/);
});
