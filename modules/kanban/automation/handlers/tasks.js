import {randomUUID} from 'node:crypto';

export function createTask({payload}){
  const state=structuredClone(payload.state),settings=payload.settings;
  const board=state?.kanbans?.find(board=>board.id===settings.board_set);
  if(!board||!Array.isArray(board.boards)||!board.boards.some(column=>column.id===settings.column))throw new Error('Choose an existing board set and column in this Kanban.');
  if(!Array.isArray(board.cards)||board.cards.length>=2000)throw new Error('The task limit for this board has been reached.');
  const title=String(settings.title??'').trim(),description=String(settings.description??'').trim();
  if(!title||title.length>160||description.length>2000)throw new Error('Use a task title up to 160 characters and description up to 2000 characters.');
  const id=`task-${randomUUID()}`,now=new Date().toISOString();
  board.cards.push({id,board_id:settings.column,title,description,note:'',assigned:[],starts_at:'',ends_at:'',important:false,done:false,order:board.cards.length,created_at:now,updated_at:now});
  return {state,output:{task_id:id},message:'Task created in the selected Kanban column.'};
}
