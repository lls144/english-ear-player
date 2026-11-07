import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function verifyCheckpoint(materials,state,source){
 if(state.sourceHash!==hash(source.replace(/\r\n/g,'\n').trimEnd()))throw Error('Private checkpoint source hash mismatch');
 const blocks=new Set(state.blocks.map(b=>b.id));
 for(const c of materials.chapters)for(const s of c.segments){
  if(state.rendered[s.id]!==hash(s.text)||s.sourceIds?.some(id=>!blocks.has(id)))throw Error('Private checkpoint does not match published material: '+s.id);
 }
}
