// Disposable loopback fixture. It has no credentials and never calls Discord.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const provider = await import(process.env.WORKSPACE_DISCORD_TEST_PROVIDER ? pathToFileURL(process.env.WORKSPACE_DISCORD_TEST_PROVIDER).href : new URL('../../../integrations/discord/server/actions.js', import.meta.url).href);
import {manage} from '../server/data.js';
const guild='111111111111111111',channel='222222222222222222',thread='333333333333333333',bot='888888888888888888';
export async function createDiscordPreview(){
 const environment={DISCORD_GUILD_ID:guild,DISCORD_CHANNEL_ID:channel,DISCORD_BOT_TOKEN:'synthetic-not-a-real-token'};
 const parent={id:channel,guild_id:guild,type:15,name:'TEST community forum'},room={id:thread,guild_id:guild,parent_id:channel,type:11,name:'TEST introductions'};
 let messages=[{id:'444444444444444444',channel_id:thread,author:{id:bot,username:'TEST bot'},content:'TEST — this is a synthetic message, not a Discord conversation.',timestamp:'2026-10-25T10:15:32.123Z',embeds:[{title:'Example announcement',description:'Edit this safe fixture to test the builder.',color:0x5865f2,fields:[{name:'Location',value:'Local preview only',inline:true}]}]},{id:'555555555555555555',channel_id:thread,author:{id:'999999999999999999',username:'TEST participant'},content:'TEST — this author cannot be edited by the bot.',timestamp:'2026-10-25T10:16:00Z',embeds:[]}];
 const receipts=[];
 const fetch=async(url,options)=>{
  if(!url.startsWith('https://discord.com/api/v10/'))throw Error('Fixture rejected an unexpected destination.');
  const path=url.slice('https://discord.com/api/v10'.length),body=options.body?JSON.parse(options.body):null;
  let result;
  if(path===`/channels/${channel}`)result=parent;
  else if(path===`/channels/${thread}`)result=room;
  else if(path==='/users/@me')result={id:bot};
  else if(path===`/guilds/${guild}/threads/active`)result={threads:[room]};
  else if(path===`/channels/${thread}/messages?limit=50`)result=[...messages].reverse();
  else if(path===`/channels/${thread}/messages`&&options.method==='POST'){
   result={id:String(666666666666666660n+BigInt(receipts.length)),channel_id:thread,author:{id:bot,username:'TEST bot'},timestamp:new Date().toISOString(),content:'',embeds:[],...body};messages.push(result);receipts.push({method:'POST',content:result.content,embeds:result.embeds});
  }else if(path.startsWith(`/channels/${thread}/messages/`)){
   const id=path.split('/').at(-1),index=messages.findIndex(value=>value.id===id);if(index<0)return new Response('{}',{status:404});
   if(options.method==='GET')result=messages[index];
   else if(options.method==='PATCH'){messages[index]={...messages[index],...body};result=messages[index];receipts.push({method:'PATCH',content:result.content,embeds:result.embeds});}
   else if(options.method==='DELETE'){messages.splice(index,1);receipts.push({method:'DELETE',id});return new Response(null,{status:204});}
   else throw Error('Unsupported synthetic method.');
  }else throw Error('This local fixture does not implement that operation.');
  return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
 };
 const context={environment,fetch};
 let state=manage({payload:{operation:'integration-result',state:{},body:{action:'read-messages',result:await provider.listMessages({...context,payload:{room_id:thread}})}}}).state;
 state.channel={id:channel,name:parent.name,type:15};
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
 const source=JSON.stringify(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8')).replaceAll('<','\\u003c');
 const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEST — Discord builder preview</title><style>body{margin:0;font:14px system-ui;background:#fafafa}header{padding:14px 20px;background:#fff4d6;color:#493600;border-bottom:1px solid #dfc275}iframe{display:block;width:100%;height:1100px;border:0}details{padding:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><header><strong>TEST / SYNTHETIC ONLY</strong> · No real Discord connection, credentials or messages.</header><iframe id="module" title="Discord module fixture" sandbox="allow-scripts"></iframe><details open><summary>Synthetic provider receipts</summary><pre id="receipts">No synthetic writes yet.</pre></details><script>const frame=document.getElementById('module');frame.srcdoc=${source};window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow)return;const data=event.data;if(data?.type==='workspace:resize'){frame.style.height=Math.min(6000,Math.max(800,data.height))+'px';return;}if(data?.type!=='workspace:request')return;try{const response=await fetch('/fixture/module',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data.body??null)}),result=await response.json();frame.contentWindow.postMessage({type:'workspace:response',id:data.id,status:response.status,result:result.state??{error:result.error}},'*');document.getElementById('receipts').textContent=JSON.stringify(result.receipts??[],null,2);}catch(error){frame.contentWindow.postMessage({type:'workspace:response',id:data.id,status:500,result:{error:'Synthetic fixture unavailable.'}},'*');}});</script></body></html>`;
 const server=createServer(async(request,response)=>{
  response.setHeader('cache-control','no-store');
  if(request.method==='GET'&&request.url==='/'){response.setHeader('content-type','text/html;charset=utf-8');response.end(page);return;}
  if(request.method!=='POST'||request.url!=='/fixture/module'){response.writeHead(404);response.end();return;}
  const origin=`http://127.0.0.1:${server.address().port}`;
  if(request.headers.origin!==origin){response.writeHead(403);response.end();return;}
  try{
   const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;if(bytes>65536)throw Error('Synthetic request too large.');chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(body?.action==='provider'){
    const definition=manifest.ui.provider_actions.find(value=>value.id===body.operation),action=definition&&({ 'list-rooms':'listRooms','list-messages':'listMessages','send-message':'sendMessage','compose-message':'sendMessage','create-room':'createRoom','edit-message':'editMessage','delete-message':'deleteMessage' })[definition.action];
    if(!action)throw Error('Undeclared fixture action.');
    const result=await provider[action]({...context,payload:body.payload});state=manage({payload:{operation:'integration-result',state,body:{action:body.operation,result}}}).state;
   }else if(body)state=manage({payload:{operation:'write',state,body}}).state;
   response.setHeader('content-type','application/json');response.end(JSON.stringify({state,receipts}));
  }catch(error){response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({error:error.message,receipts}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=await createDiscordPreview();console.log(`Synthetic Discord preview: http://127.0.0.1:${server.address().port}/`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));}
