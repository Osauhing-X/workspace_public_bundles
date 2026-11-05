const clean = (value, limit = 2000) => String(value ?? '').slice(0, limit);
const room = value => ({ id: clean(value.id, 22), name: clean(value.name, 100), type: value.type, parent_id: value.parent_id ?? null });
const message = value => ({ id: clean(value.id, 22), channel_id: clean(value.channel_id, 22), content: clean(value.content), author: clean(value.author, 100), timestamp: clean(value.timestamp, 40),embeds:Array.isArray(value.embeds)?JSON.parse(JSON.stringify(value.embeds.slice(0,10))):[],embeds_complete:value.embeds_complete!==false,editable:value.editable===true,revision:typeof value.revision==='string'&&/^[a-f0-9]{64}$/.test(value.revision)?value.revision:null });
function boundCache(state){
 while(Buffer.byteLength(JSON.stringify(state.messages),'utf8')>192*1024){const id=Object.keys(state.messages)[0];if(!id)break;if(state.messages[id].length)state.messages[id].shift();else delete state.messages[id];}
}
const stateOf = value => ({ channel: value?.channel ?? null, rooms: Array.isArray(value?.rooms) ? value.rooms : [], messages: value?.messages && typeof value.messages === 'object' && !Array.isArray(value.messages) ? value.messages : {} });

export function manage({ payload }) {
  const state = stateOf(payload.state);
  if (payload.operation === 'read') return { result: state };
  if (payload.operation === 'integration-result') {
    const result = payload.body.result;
    if (payload.body.action === 'refresh-rooms') {
      state.channel = room(result.channel);
      state.rooms = result.rooms.slice(0, 100).map(room);
      state.messages = Object.fromEntries(Object.entries(state.messages).filter(([id]) => state.rooms.some(value => value.id === id)));
    } else if (['read-messages', 'create-room', 'send-message','compose-message','edit-message','delete-message'].includes(payload.body.action)) {
      const selected = room(result.room);
      if (!state.rooms.some(value => value.id === selected.id)) state.rooms = [...state.rooms, selected].slice(-100);
      const list = ['send-message','compose-message','edit-message'].includes(payload.body.action) ? [...(state.messages[selected.id] ?? []), result.message] : payload.body.action==='delete-message'?(state.messages[selected.id]??[]).filter(value=>value.id!==result.message_id):result.messages;
      state.messages[selected.id] = [...new Map(list.map(value => [value.id, message(value)])).values()].slice(-50);
      // Bound the private cache to fit Core's request/persistence envelope.
      state.messages = Object.fromEntries(Object.entries(state.messages).slice(-5));
      boundCache(state);
    } else throw new Error('Unknown Discord provider result.');
  } else throw new Error('Unknown Discord operation.');
  return { state, result: state };
}
