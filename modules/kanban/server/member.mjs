/** Core supplies the current module's board state and verified local identity. */
export function member({payload,actor}){
  if(payload?.operation!=='member'||actor?.source!=='dashboard'||!actor.subject||!actor.email)throw Error('Verified Dashboard access is required.');
  const result=settings=>({settings,exists:true,user_email:actor.email});
  if(payload.action==='read')return {result:result(payload.state)};
  if(payload.action==='setup')return {result:result(payload.state)};
  if(payload.action==='settings'){
    if(!payload.body?.settings||typeof payload.body.settings!=='object'||Array.isArray(payload.body.settings))throw Error('Provide board settings.');
    // Core validates all identifiers, board references, assignments and dates
    // before committing into this instance's existing Kanban storage.
    return {state:payload.body.settings,result:result(payload.body.settings)};
  }
  throw Error('Unsupported board operation.');
}
