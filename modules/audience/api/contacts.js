const sources={resend:'Resend',stripe:'Stripe',supabase:'Supabase Auth'};
function normalize(value,source){
 const email=typeof value?.email==='string'?value.email.trim().toLowerCase():'';
 if(email.length>254||/[\s<>\r\n]/.test(email)||!/^([^@]+)@([^@]+)\.([^@]+)$/.test(email)||typeof value.id!=='string'||!value.id||value.id.length>200)return null;
 const text=value=>typeof value==='string'?value.slice(0,200):'';
 const first_name=text(value.first_name),last_name=text(value.last_name);
 return {id:value.id,email,name:text(value.name)||[first_name,last_name].filter(Boolean).join(' '),first_name,last_name,source,unsubscribed:typeof value.unsubscribed==='boolean'?value.unsubscribed:null,confirmed:typeof value.confirmed==='boolean'?value.confirmed:null};
}
/** Contact data contract shared by the Communication UI and consuming modules. */
export function contacts({payload}){
 const groups=[],setup=[];
 for(const [id,label] of Object.entries(sources)){
  const input=payload.inputs?.find(input=>input.id===id);
  if(!input||input.status==='not-configured'){setup.push(`${label}: select an updated, explicit read connection in Service connections.`);continue;}
  const values=input.result?.contacts;
  if(input.status!=='ready'||!Array.isArray(values)||values.length>10000){groups.push({id,label,status:'unavailable',contacts:[],error:`${label} contacts could not be loaded. No partial list is used.`});continue;}
  groups.push({id,label,status:'ready',contacts:values.map(value=>normalize(value,id)).filter(Boolean)});
 }
 const combined=new Map();
 for(const group of groups.filter(group=>group.status==='ready'))for(const contact of group.contacts){
  const row=combined.get(contact.email)??{email:contact.email,name:contact.name,sources:[],unsubscribed:false};
  if(!row.name)row.name=contact.name;
  if(!row.sources.includes(group.id))row.sources.push(group.id);
  if(contact.unsubscribed===true)row.unsubscribed=true;
  combined.set(contact.email,row);
 }
 return {groups,setup,contacts:groups.find(group=>group.id==='resend'&&group.status==='ready')?.contacts??[],all_contacts:[...combined.values()].sort((a,b)=>a.email.localeCompare(b.email))};
}
