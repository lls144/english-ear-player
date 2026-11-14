import {pronunciation,splitSentences,decorateSegment} from './reading.mjs';
import {createHash} from 'node:crypto';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const definitions=[{id:'picture',title:'首段描图',inMainLoop:true},{id:'theme-trends',title:'主题句与社会趋势',inMainLoop:true},{id:'reasons',title:'原因分析',inMainLoop:true},{id:'connectors',title:'逻辑连接词',inMainLoop:false},{id:'conclusion',title:'第三段结尾',inMainLoop:true},{id:'letter-opening',title:'小作文首段',inMainLoop:true},{id:'letter-body',title:'小作文正文',inMainLoop:true},{id:'letter-ending',title:'小作文结尾',inMainLoop:true},{id:'phrases',title:'短语积累',inMainLoop:false}];
export function clean(raw){
 const slots=[];
 let s=raw.replace(/^\s*(?:>\s*)+/,'').replace(/^\s*(?:[-*+]|\d+[.)])\s+/,'').replace(/\*\*|==|`/g,'');
 s=s.replace(/\+\s*完整句子/g,'[完整句子]').replace(/\[[^\]]+\]/g,x=>'SLOT'+(slots.push(x)-1)+'TOKEN');
 // Mixed-language alternatives are source English; pronunciation-only Chinese glosses are removed.
 s=s.replace(/（([^）]*)）/g,(_,inner)=>/[A-Za-z][^/]*\//.test(inner)?'('+inner.replace(/[\u3400-\u9fff]+/g,'')+')':'')
  .replace(/\([^)]*[\u3400-\u9fff][^)]*\)/g,'').replace(/[\u3400-\u9fff]+/g,'').replace(/🟠/g,'').replace(/：/g,':').replace(/，/g,',').replace(/；/g,';');
 return s.replace(/SLOT(\d+)TOKEN/g,(_,i)=>slots[Number(i)]).replace(/\s*\+\s*/g,' ').replace(/\s+/g,' ').trim();
}
export function speechParts(text){return splitSentences(text).map(s=>({text:pronunciation(s).speechText}));}
export function chapterFor(headings,rules=[]){
 const custom=rules.find(r=>headings.includes(r.heading));if(custom)return custom.id;
 const h=headings.join('/');if(headings[0]==='小作文')return /三段|第三段/.test(h)?'letter-ending':/二段|第二段/.test(h)?'letter-body':/一段|首段/.test(h)?'letter-opening':null;if(/三段|第三段/.test(h))return 'conclusion';if(/连接词/.test(h))return 'connectors';if(/一段|首段/.test(h))return 'picture';if(/二段|第二段/.test(h))return /主题句|社会进入|通用趋势/.test(h)?'theme-trends':'reasons';return null;
}
export function parseNote(source,rules=[]){
 const headers=[],blocks=[];let fenced=false,category='';
 function add(raw,line,extra={}){
  const text=clean(raw);if(!/[A-Za-z]/.test(text)||!speechParts(text).some(p=>p.text))return;
  const scope=headers.filter(Boolean),chapter=chapterFor(scope,rules);
  const phrase=chapter!=='connectors'&&(/^(?:seemingly |taking |deeply |with |who seems |the growing |the increasing )/.test(text)||/高频趋势|通用趋势|主题补充|替换结构/.test(extra.category??category)||/^(?:Altogether[,.]|as (?:a|an|the) |go to |seek |collaborate |immerse )/.test(text));
  const kind=/\[[^\]]+\]|×|do sth\b|\.\.\.|…/.test(text)?'source-template':phrase||chapter==='connectors'?'source-phrase':'source-example';
  const b={text,normalized:text,chapter,collection:phrase?'phrases':chapter,scope:scope.join('/'),line,category:extra.category??category,kind,...extra,parts:speechParts(text)};
  b.fingerprint=hash([chapter,text].join('\0'));
  const duplicate=blocks.find(x=>x.chapter===chapter&&x.text===text);if(duplicate){duplicate.lines.push(line);return;}
  b.lines=[line];blocks.push(b);
 }
 source.replace(/\r\n/g,'\n').split('\n').forEach((raw,index)=>{
  const line=index+1;if(/^\s*`{3}/.test(raw)){fenced=!fenced;return;}if(fenced)return;
  const heading=raw.match(/^(#{1,6})\s+(.+)/);if(heading){headers.length=heading[1].length;headers[heading[1].length-1]=heading[2].trim();category=heading[2].replace(/^\d+[.]|^[iv]+[.]/,'').trim();return;}
  const plain=raw.replace(/^\s*>\s?/,'').trim(),chapter=chapterFor(headers.filter(Boolean),rules);
  if(/\[!(?:tip|note|warning)/.test(plain))return;
  if(/六个高频/.test(plain)){category='高频趋势';return;}if(/特定主题补充/.test(plain)){category='主题补充';return;}if(/万能替换结构/.test(plain)){category='替换结构';return;}
  if(plain.startsWith('|')){
   const cells=plain.split('|').slice(1,-1).map(s=>s.trim());
   if(chapter==='connectors'&&cells.length===3&&/[A-Za-z]/.test(cells[1])&&!/^[-: ]+$/.test(cells[1]))for(let col=1;col<3;col++)for(const item of cells[col].split(/\s*\/\s*/))add(item,line,{category:cells[0].replace(/\*|==/g,'').trim(),tier:col===1?'基础':'进阶'});
   else if(chapter==='picture'&&cells.length===4&&/[A-Za-z]/.test(cells[2]))add(cells[2],line,{category:'人物插入语'});
   else if(chapter==='theme-trends'&&cells.length>=2&&/^[A-Za-z]/.test(cells[1].replace(/\*\*|==/g,'')))add(cells[1],line);
   return;
  }
  if(chapter==='picture'&&/^变式[:：]/.test(plain))add(plain.replace(/^变式[:：]\s*/,''),line);
  if(chapter==='reasons'&&/^变式[:：]/.test(plain)){add(plain.replace(/^变式[:：]\s*/,''),line);return;}
  if(chapter==='letter-opening'&&/^as (?:a|an|the) /.test(plain)){for(const item of plain.split(/[；;]/))add(item,line,{category:'身份表达'});return;}
  if(chapter==='connectors'&&/unfortunately.*however/.test(plain)){add('unfortunately',line,{category:'原注辨析'});add('however',line,{category:'原注辨析'});return;}
  for(const match of plain.matchAll(/（([^）]*)）/g))if(/[A-Za-z]/.test(match[1])&&!/[\u3400-\u9fff]/.test(match[1]))add(match[1].replace(/\*/g,''),line,{collection:'phrases',category:'可选表达'});
  const code=[...plain.matchAll(/`([^`]+)`/g)];if(code.length){for(const m of code)add(m[1],line,{category:chapter==='picture'?'人物插入语':category});return;}
  const leading=plain.replace(/\*\*|==/g,'');
  if(/^[A-Za-z×]/.test(leading)||/^\[[^\]]+\]\s*[A-Za-z]/.test(leading)||/^\d+[.)]\s*[A-Za-z]/.test(leading))add(plain,line);
  else if(/An extraordinary drawing/.test(plain))add(plain.slice(plain.indexOf('An extraordinary')),line);
 });
 blocks.issues=source.replace(/\r\n/g,'\n').split('\n').flatMap((raw,i)=>{
  if(/^\s*#|\[!(?:tip|note|warning)/.test(raw)||blocks.some(b=>b.lines.includes(i+1)))return [];
  return /[A-Za-z]/.test(raw)?[{line:i+1,raw}]:[];
 });return blocks;
}
function materialize(blocks,rules=[]){
 const specs=[...definitions,...rules.filter(r=>!definitions.some(d=>d.id===r.id)).map(r=>({...r,inMainLoop:true}))];
 return {schemaVersion:2,policy:'verbatim-source-only',chapters:specs.map(c=>({...c,subtitle:c.title,segments:blocks.filter(b=>(b.collection??b.chapter)===c.id).map(b=>({id:'source-'+b.id.slice(5),kind:b.kind,text:b.text,category:(c.id==='phrases'?({'picture':'人物描写','theme-trends':'社会趋势','letter-opening':'小作文身份','letter-body':'小作文建议'}[b.chapter]??'短语')+' · ':'')+b.category,...(b.tier?{tier:b.tier}:{}),parts:b.parts,sourceIds:[b.id],sourceLines:b.lines.map(n=>[n,n]),change:'展示保留原文；朗读仅作中性占位替换，不添加作文事实。'})).map(decorateSegment)})).filter(c=>c.segments.length)};
}
export function sourceIndex(materials){return {schemaVersion:2,policy:'verbatim-source-only',entries:materials.chapters.flatMap(c=>c.segments.map(s=>({id:s.id,sourceIds:s.sourceIds,chapter:c.id,textSha256:hash(s.text),partsSha256:hash(JSON.stringify(s.parts)),displayTextSha256:hash(s.displayText),speechTextSha256:hash(s.speechText),sentencesSha256:hash(JSON.stringify(s.sentences))})))};}
export function bootstrap(source,materials=null,rules=[]){
 const parsed=parseNote(source,rules);if(parsed.issues.length)throw Error('Unclassified English requires source review');
 if(materials&&materials.schemaVersion!==2)throw Error('Legacy edited material cannot bootstrap a source-only registry');
 const blocks=parsed.map(b=>({...b,id:materials?.chapters.find(c=>c.id===(b.collection??b.chapter))?.segments.find(s=>s.text===b.text)?.sourceIds?.[0]??'note-'+b.fingerprint.slice(0,16)}));if(blocks.some(b=>!b.chapter))throw Error('Unmapped English source; review chapter rules');
 const m=materialize(blocks,rules);if(materials?.schemaVersion===2&&JSON.stringify(materials.chapters.map(c=>c.segments.map(s=>s.text)))!==JSON.stringify(m.chapters.map(c=>c.segments.map(s=>s.text))))throw Error('Edited English is not an exact source extraction');
 return {materials:m,state:{schemaVersion:2,policy:'verbatim-source-only',chapterRules:rules,sourceHash:hash(source.replace(/\r\n/g,'\n').trimEnd()),blocks,rendered:Object.fromEntries(m.chapters.flatMap(c=>c.segments.map(s=>[s.id,hash(s.text)])))}};
}
export function synchronize(state,source,materials){
 if(state.schemaVersion!==2||materials.schemaVersion!==2)throw Error('Source-only migration must be reviewed explicitly; legacy adaptations cannot be synchronized');
 const next=parseNote(source,state.chapterRules??[]),old=state.blocks.map(b=>({...b,fingerprint:hash([b.chapter,b.text].join('\0'))})),n=old.length,m=next.length,conflicts=next.issues.map(source=>({type:'unclassified-English',source})),changes=[];
 for(const c of materials.chapters)for(const s of c.segments)if(state.rendered[s.id]!==hash(s.text)||JSON.stringify(s.parts)!==JSON.stringify(speechParts(s.text)))conflicts.push({type:'local-source-edit',id:s.id});
 const oldByPrint=new Map(old.map(b=>[b.fingerprint,b])),nextPrints=new Set(next.map(b=>b.fingerprint));
 for(const b of next)if(oldByPrint.has(b.fingerprint))b.id=oldByPrint.get(b.fingerprint).id;
 const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=old[i].fingerprint===next[j].fingerprint?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 const pairs=[[-1,-1]];let i=0,j=0;while(i<n&&j<m){if(old[i].fingerprint===next[j].fingerprint)pairs.push([i++,j++]);else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}pairs.push([n,m]);
 for(let k=1;k<pairs.length;k++){
  const [a,b]=pairs[k-1],[z,q]=pairs[k];if(z<n)next[q].id=old[z].id;const removed=old.slice(a+1,z).filter(r=>!nextPrints.has(r.fingerprint)),added=next.slice(b+1,q).filter(r=>!oldByPrint.has(r.fingerprint));
  // A single reviewed category edit can coexist with newly appended sections.
  // Multiple candidates in the same category remain a blocking ambiguity.
  const matchedOld=new Set(),matchedNew=new Set();
  for(const r of removed){const options=added.filter(a=>a.chapter===r.chapter&&a.category===r.category);if(options.length===1&&removed.filter(o=>o.chapter===r.chapter&&o.category===r.category).length===1){const a=options[0];a.id=r.id;matchedOld.add(r);matchedNew.add(a);changes.push({type:'updated',sourceId:a.id,chapter:a.chapter});}}
  const restOld=removed.filter(r=>!matchedOld.has(r)),restNew=added.filter(a=>!matchedNew.has(a));
  if(restOld.length&&restNew.length)conflicts.push({type:'ambiguous-source-region',before:restOld,after:restNew});
  else {for(const r of restOld)changes.push({type:'deleted',sourceId:r.id,chapter:r.chapter});for(const a of restNew){a.id='note-'+a.fingerprint.slice(0,16);changes.push({type:'added',sourceId:a.id,chapter:a.chapter});}}

 }
 for(const b of next){if(!b.chapter)conflicts.push({type:'unmapped-source',source:b});b.id??='note-'+b.fingerprint.slice(0,16);}
 const candidate=materialize(next,state.chapterRules??[]);for(const c of candidate.chapters)for(const s of c.segments){const prev=materials.chapters.flatMap(c=>c.segments).find(p=>p.id===s.id);if(prev)s.sourceLines=prev.sourceLines;}
 const nextState={...state,sourceHash:hash(source.replace(/\r\n/g,'\n').trimEnd()),blocks:next,rendered:Object.fromEntries(candidate.chapters.flatMap(c=>c.segments.map(s=>[s.id,hash(s.text)])))};
 return {materials:candidate,state:nextState,changes,conflicts,counts:{before:materials.chapters.map(c=>({id:c.id,segments:c.segments.length})),after:candidate.chapters.map(c=>({id:c.id,segments:c.segments.length}))}};
}
