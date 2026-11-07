import {createHash} from 'node:crypto';
import {rename} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function verifyCheckpoint(materials,state,source){
 if(state.sourceHash!==hash(source.replace(/\r\n/g,'\n').trimEnd()))throw Error('Private checkpoint source hash mismatch');
 const blocks=new Set(state.blocks.map(b=>b.id));
 for(const c of materials.chapters)for(const s of c.segments){
  if(state.rendered[s.id]!==hash(s.text)||s.sourceIds?.some(id=>!blocks.has(id)))throw Error('Private checkpoint does not match published material: '+s.id);
 }
}
export async function retainCheckpoint(pending,target,move=rename,pause=wait){
 // Antivirus/indexing can briefly hold a just-written Windows directory open.
 for(let attempt=0;;attempt++){
  try{await move(pending,target);return;}
  catch(error){if(!['EPERM','EBUSY'].includes(error.code)||attempt===7)throw error;await pause(250*(attempt+1));}
 }
}
