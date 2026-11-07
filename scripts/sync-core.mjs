import {createHash} from 'node:crypto';
export const hash=s=>createHash('sha256').update(s).digest('hex');
const order=['picture','theme-trends','reasons','connectors','conclusion'];
export const clean=s=>s.replace(/^\s*(?:>\s*)+/,'').replace(/^\s*(?:[-*+]|\d+[.)])\s+/,'').replace(/\*\*|==|\x60/g,'').replace(/（[^）]*）|\([^)]*[\u3400-\u9fff][^)]*\)/g,'').replace(/[\u3400-\u9fff，。；：]/g,'').replace(/\s+/g,' ').trim();
export function chapterFor(headings,rules=[]){
 const custom=rules.find(r=>headings.includes(r.heading));if(custom)return custom.id;
 const h=headings.join('/');
 if(/三段|第三段/.test(h))return 'conclusion';
 if(/连接词/.test(h))return 'connectors';
 if(/一段|首段/.test(h))return 'picture';
 if(/二段|第二段/.test(h))return /主题句|社会进入|通用趋势/.test(h)?'theme-trends':'reasons';
 return null;
}
export function parseNote(source,rules=[]){
 const headers=[],blocks=[];let fenced=false;
 source.replace(/\r\n/g,'\n').split('\n').forEach((raw,index)=>{
  if(/^\s*\x60{3}/.test(raw)){fenced=!fenced;return;}if(fenced)return;
  const heading=raw.match(/^(#{1,6})\s+(.+)/);
  if(heading){headers.length=heading[1].length;headers[heading[1].length-1]=heading[2].trim();return;}
  if(!/[a-zA-Z]/.test(raw)||/^\s*>?\s*\[!/.test(raw))return;
  const scope=headers.filter(Boolean).join('/'),chapter=chapterFor(headers.filter(Boolean),rules),normalized=clean(raw);
  if((normalized.match(/[A-Za-z]+/g)??[]).length<3)return;
  blocks.push({raw,normalized,chapter,scope,line:index+1,fingerprint:hash(scope+'\0'+normalized)});
 });
 const joined=[];
 for(const b of blocks){
  const last=joined.at(-1);
  if(last&&last.scope===b.scope&&(last.endLine??last.line)+1===b.line&&!/[.!?]$/.test(last.normalized)&&!/[|]|^\s*>?\s*[-*+]/.test(last.raw+b.raw)){
   last.raw+='\n'+b.raw;last.normalized=clean(last.raw);last.endLine=b.line;last.fingerprint=hash(last.scope+'\0'+last.normalized);
  }else joined.push(b);
 }
 return joined;
}
export function bootstrap(source,materials){
 const blocks=parseNote(source).map((b,i)=>({...b,id:'note-'+hash(b.fingerprint+':'+i).slice(0,16)})),m=structuredClone(materials);
 for(const c of m.chapters)for(const s of c.segments){
  s.sourceIds=blocks.filter(b=>s.sourceLines.some(([a,z])=>b.line>=a&&b.line<=z)).map(b=>b.id);
  if(s.kind!=='user-authored'&&!s.sourceIds.length)throw Error('No source anchor for '+s.id);
 }
 return {materials:m,state:{schemaVersion:1,sourceHash:hash(source.replace(/\r\n/g,'\n').trimEnd()),blocks,rendered:Object.fromEntries(m.chapters.flatMap(c=>c.segments.map(s=>[s.id,hash(s.text)])))}};
}
function align(old,newer){
 const n=old.length,m=newer.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=old[i].fingerprint===newer[j].fingerprint?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 const pairs=[[-1,-1]];let i=0,j=0;
 while(i<n&&j<m){if(old[i].fingerprint===newer[j].fingerprint){pairs.push([i++,j++]);}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
 pairs.push([n,m]);return pairs;
}
export function synchronize(state,source,materials,resolutions={}){
 const newer=parseNote(source,state.chapterRules??[]),pairs=align(state.blocks,newer),changes=[],conflicts=[],candidate=structuredClone(materials),touched=new Map();
 for(let k=1;k<pairs.length;k++){
  const [oa,na]=pairs[k-1],[ob,nb]=pairs[k];
  if(ob<state.blocks.length)newer[nb].id=state.blocks[ob].id;
  const gone=state.blocks.slice(oa+1,ob),fresh=newer.slice(na+1,nb);
  if(gone.length===1&&fresh.length===1&&gone[0].chapter===fresh[0].chapter&&gone[0].scope===fresh[0].scope){
   fresh[0].id=gone[0].id;touched.set(gone[0].id,{type:'changed',old:gone[0],next:fresh[0]});
  }else if(!gone.length){for(const b of fresh){b.id='note-'+hash(b.fingerprint).slice(0,16);touched.set(b.id,{type:'added',next:b});}}
  else if(!fresh.length){for(const b of gone)touched.set(b.id,{type:'deleted',old:b});}
  else conflicts.push({type:'ambiguous-source-region',before:gone,after:fresh});
 }
 const bySegment=new Map(candidate.chapters.flatMap(c=>c.segments.map(s=>[s.id,{chapter:c,segment:s}])));
 for(const [id,change]of touched){
  const users=[...bySegment.values()].filter(x=>x.segment.sourceIds?.includes(id));
  if(change.type==='added'){
   const b=change.next,text=b.normalized;
   if(!b.chapter||!/^[A-Za-z]/.test(text)||!/[.!?]$/.test(text)||/\[|\]|×|\+|\.\.\.|…|\||do sth\b|\/\//.test(b.raw.replace(/^\s*>\s*/,''))){
    conflicts.push({type:'new-content-needs-editorial-review',source:b});continue;
   }
   const rule=(state.chapterRules??[]).find(r=>r.id===b.chapter);
   if(!order.includes(b.chapter)&&!rule){conflicts.push({type:'unknown-chapter',source:b});continue;}
   let chapter=candidate.chapters.find(c=>c.id===b.chapter);
   if(!chapter&&rule&&/^[a-z0-9-]+$/.test(rule.id)){chapter={id:rule.id,title:rule.title,subtitle:rule.subtitle??rule.title,segments:[]};candidate.chapters.push(chapter);}
   if(!chapter){conflicts.push({type:'chapter-missing',source:b});continue;}
   if(chapter.segments.some(s=>s.text===text)){conflicts.push({type:'duplicate-new-text',source:b});continue;}
   const segment={id:'source-'+id.slice(5),kind:'source-text',text,sourceLines:[[b.line,b.line]],sourceIds:[id],change:'从选定笔记自动提取的完整英文；仅去除排版标记。'};
   const at=newer.indexOf(b);let insert=chapter.segments.length;
   for(let p=at-1;p>=0;p--){const found=chapter.segments.findIndex(s=>s.sourceIds?.includes(newer[p].id));if(found>=0){insert=found+1;break;}}
   chapter.segments.splice(insert,0,segment);bySegment.set(segment.id,{chapter,segment});changes.push({type:'added',id:segment.id,chapter:chapter.id});continue;
  }
  if(!users.length){changes.push({type:'unselected-source-'+change.type,sourceId:id});continue;}
  for(const {chapter,segment:s}of users){
   if(!['source-text','source-example'].includes(s.kind)&&resolutions[id]?.action==='keep-adaptation'&&resolutions[id].reason){changes.push({type:'reviewed-preserved',id:s.id,sourceId:id});continue;}
   if(!['source-text','source-example'].includes(s.kind)||s.sourceIds.length!==1){conflicts.push({type:'edited-material-source-changed',id:s.id,sourceId:id,change});continue;}
   if(state.rendered[s.id]!==hash(s.text)){conflicts.push({type:'local-edit-conflict',id:s.id,change});continue;}
   if(change.type==='deleted'){chapter.segments.splice(chapter.segments.indexOf(s),1);changes.push({type:'deleted',id:s.id,chapter:chapter.id});continue;}
   const text=change.next.normalized;
   if(!/[.!?]$/.test(text)||/\[|×|\.\.\.|…|do sth\b|\|/.test(text)){conflicts.push({type:'replacement-is-incomplete',id:s.id,change});continue;}
   s.text=text;changes.push({type:'updated',id:s.id,chapter:chapter.id});
  }
 }
 for(const c of candidate.chapters)if(!c.segments.length)conflicts.push({type:'empty-chapter',id:c.id});
 const nextState={...state,sourceHash:hash(source.replace(/\r\n/g,'\n').trimEnd()),blocks:newer,rendered:Object.fromEntries(candidate.chapters.flatMap(c=>c.segments.map(s=>[s.id,hash(s.text)])))};
 return {materials:candidate,state:nextState,changes,conflicts,counts:{before:materials.chapters.map(c=>({id:c.id,segments:c.segments.length})),after:candidate.chapters.map(c=>({id:c.id,segments:c.segments.length}))}};
}

