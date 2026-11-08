// Only neutral pronunciation substitutions. Display English remains the source.
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export const speechPolicy='neutral-placeholders-v1.2';
export function audioSettingsFor(settings,preset,unitIds){
 const {sentenceOverrides,...base}=settings,matched={};
 for(const id of unitIds){const rule={...sentenceOverrides?.[id]?.all,...sentenceOverrides?.[id]?.[preset]};if(Object.keys(rule).length)matched[id]=rule;}
 return {...base,presets:{[preset]:base.presets[preset]},...(Object.keys(matched).length?{sentenceOverrides:matched}:{})};
}
export function splitSentences(text){
 const dot='\uE000';
 const protectedText=text.replace(/\.{3,}|…+/g,s=>s.replace(/\./g,dot))
  .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)\./gi,s=>s.replaceAll('.',dot))
  .replace(/\b(?:[A-Za-z]\.){2,}/g,s=>s.replaceAll('.',dot))
  .replace(/\b(?:sth|sb)\.(?=\s+[a-z])/g,s=>s.replace('.',dot));
 const result=[];let start=0;
 for(const m of protectedText.matchAll(/[.!?]+["”’']*(?=\s|$)/g)){const end=m.index+m[0].length;result.push(protectedText.slice(start,end).trim());start=end;}
 if(protectedText.slice(start).trim())result.push(protectedText.slice(start).trim());
 return result.filter(Boolean).map(s=>s.replaceAll(dot,'.'));
}
export function pronunciation(displayText){
 let text=displayText;const substitutions=[];
 const replace=(pattern,fn)=>{text=text.replace(pattern,(...args)=>{const original=args[0],replacement=typeof fn==='function'?fn(...args):fn;substitutions.push({original,replacement});return replacement.replace(/\b([A-Z])\b/g,'\uE001$1\uE002');});};
 // Whole-clause slots are omitted, never replaced by a fabricated assertion.
 if(/\[(?:完整句子|句子)\]/.test(text)){
  const colon=text.search(/[:：]/);if(colon<0)throw Error('Whole-sentence placeholder needs a reviewed complete introduction');
  const original=text.slice(colon);text=text.slice(0,colon).trim().replace(/[.!?]$/,'')+'.';substitutions.push({original,replacement:'.'});
 }
 replace(/\[趋势\s*([A-Z])\]/g,(_,letter)=>'trend '+letter);
 replace(/\[主题词\]/g,'something');
 let letter=0;replace(/×+/g,()=>String.fromCharCode(65+letter++));
 replace(/\b(sth|sb)\./gi,(_,word)=>word.toLowerCase()==='sth'?'something':'somebody');
 // Preserve the terminal period that belonged to a final sth./sb. abbreviation.
 if(/\b(?:sth|sb)\.$/i.test(displayText)&&!/[.!?]$/.test(text))text+='.';
 if(/\bNot only\.{3,}but also\.{3,}/i.test(text))replace(/Not only\.{3,}but also\.{3,}/gi,'Not only A, but also B.');
 replace(/\.{3,}|…+/g,'something');
 if(text.includes('//')){const original=text; text=text.split('//')[0].replace(/[.!?]$/,'')+'.';substitutions.push({original,replacement:text});}
 replace(/([A-Za-z]+)\/([A-Za-z]+)/g,(_,first)=>first);
 text=text.replace(/\s+/g,' ').trim();
 if(/[\u3400-\u9fff\[\]×/]|\b(?:sth|sb)\.|\.{3}/.test(text))throw Error('Unreviewed speech placeholder: '+displayText);
 const names={A:'eigh',B:'bee',C:'see',D:'dee',E:'ee',F:'ef',G:'gee',H:'aitch',I:'eye',J:'jay',K:'kay',L:'el',M:'em',N:'en',O:'oh',P:'pee',Q:'cue',R:'ar',S:'ess',T:'tee',U:'you',V:'vee',W:'double you',X:'ex',Y:'why',Z:'zee'};
 const pronunciationText=text.replace(/\uE001([A-Z])\uE002/g,(_,letter)=>names[letter]);text=text.replace(/[\uE001\uE002]/g,'');
 return {speechText:text,pronunciationText,substitutions:substitutions.map(x=>({original:x.original.replace(/[\uE001\uE002]/g,''),replacement:x.replacement.replace(/[\uE001\uE002]/g,'')}))};
}
export function readingUnits(id,displayText,sourceIds=[]){
 const seen=new Map();return splitSentences(displayText).map(sentence=>{
  const key=hash(sentence).slice(0,12),n=seen.get(key)??0;seen.set(key,n+1);
  return {id:id+'-s-'+key+(n?'-'+n:''),displayText:sentence,...pronunciation(sentence),sourceIds};
 });
}
export function decorateSegment(s){
 const displayText=s.text,sentences=readingUnits(s.id,displayText,s.sourceIds);
 return {...s,displayText,speechText:sentences.map(u=>u.speechText).join(' '),speechPolicy,sentences,parts:sentences.map(u=>({text:u.speechText}))};
}
