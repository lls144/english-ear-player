import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {speechParts,sourceIndex} from './source-only.mjs';
import {decorateSegment,audioSettingsFor} from './reading.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha = b => createHash('sha256').update(b).digest('hex');
export const contentRevision=(chapters,provenance,clientInputs=[])=>sha(JSON.stringify(chapters)+JSON.stringify(provenance)+sha(clientInputs.map(s=>s.replace(/\r\n/g,'\n')).join('\0'))).slice(0,24);
export const readJson = async p => JSON.parse(await readFile(path.join(root,p),'utf8'));
export function validate(materials) {
  if (materials.schemaVersion !== 2 || materials.policy!=='verbatim-source-only' || !Array.isArray(materials.chapters) || !materials.chapters.length) throw Error('Only verbatim source-only V2 material may be published');
  const ids = new Set();
  for (const chapter of materials.chapters) {
    if (!/^[a-z0-9-]+$/.test(chapter.id) || ids.has(chapter.id) || !chapter.title || !chapter.segments?.length) throw Error('Invalid chapter');
    ids.add(chapter.id);
    for (const s of chapter.segments) {
      if (!s.id || ids.has(s.id)) throw Error('Duplicate/missing segment id');
      ids.add(s.id);
      if (!['source-template','source-example','source-phrase'].includes(s.kind)) throw Error('Editorial completions are forbidden');
      if (!s.text || /[\u3400-\u9fff]|==|\*\*|\|/.test(s.text.replace(/\[[^\]]+\]/g,''))) throw Error('Unexpected annotation: '+s.id);
      if (!Array.isArray(s.sourceLines) || !s.sourceLines.length || !s.sourceIds?.length || !s.change) throw Error('Missing source mapping: '+s.id);
      if(JSON.stringify(s.parts)!==JSON.stringify(speechParts(s.text)))throw Error('Spoken text differs from source: '+s.id);
      const expected=decorateSegment(s);
      if(s.displayText!==s.text||s.speechPolicy!==expected.speechPolicy||s.speechText!==expected.speechText||JSON.stringify(s.sentences)!==JSON.stringify(expected.sentences))throw Error('Display/speech mapping differs from reviewed neutral rules: '+s.id);
      if(s.parts.some(p=>p.text&&/[\u3400-\u9fff\[\]×]|do sth\b|\.\.\.|\/|==|\*\*/.test(p.text)))throw Error('Unsafe speech placeholder: '+s.id);
    }
  }
}
export async function compile() {
  const m=await readJson('content/materials.json'); validate(m);
  const index=await readJson('content/source-index.json');
  if(JSON.stringify(index)!==JSON.stringify(sourceIndex(m)))throw Error('English differs from the reviewed source index; sync the original note');
  const audio=await readJson('content/audio-manifest.json'),publicAudio={},audioModes={continuous:{},slow:{},recite:{}},sentenceAudio={continuous:{},slow:{},recite:{}},timings={continuous:{},slow:{},recite:{}},files={};
  const provenance=await readJson('content/audio-provenance.json'),quality=await readJson('content/audio-quality.json');
  const cues=await readJson('content/audio-timings.json'),settings=await readJson('content/audio-settings.json');
  for(const [id,file] of Object.entries(audio)){
    const r=provenance.find(r=>r.id===id),chapter=m.chapters.find(c=>c.id===r?.chapterId),preset=r?.preset;
    if(!chapter||!audioModes[preset]||!/^assets\/audio\/[a-zA-Z0-9_-]+\.mp3$/.test(file))throw Error('Invalid audio '+id);
    const all=chapter.segments.flatMap(s=>s.sentences.map(u=>({...u,segmentId:s.id,kind:s.kind}))),items=r.kind==='sentence'?all.filter(u=>u.id===r.sentenceId):all;
    if(!items.length||!['chapter','sentence'].includes(r.kind))throw Error('Invalid reading units '+id);
    const plan=items.map(u=>({id:u.id,segmentId:u.segmentId,displayText:u.displayText,speechText:u.speechText,pronunciationText:u.pronunciationText,kind:u.kind}));
    const buf=await readFile(path.join(root,'public',file)),audit=quality.entries.find(q=>q.id===id);
    if(!audit?.passed||['mp3Sha256','readingPlanSha256','settingsSha256'].some(k=>audit[k]!==r[k]))throw Error('Missing/stale audio quality approval: '+id);
    if(buf.length<512||!(buf.subarray(0,3).toString()==='ID3'||buf[0]===255&&(buf[1]&224)===224))throw Error('Not an MP3 '+id);
    if(r.engine!=='kokoro-onnx'||r.mp3Sha256!==sha(buf)||r.readingPlanSha256!==sha(JSON.stringify(plan))||r.textSha256!==sha(items.map(u=>u.displayText).join('\n\n'))||r.speechTextSha256!==sha(items.map(u=>u.speechText).join(' '))||r.settingsSha256!==sha(JSON.stringify(audioSettingsFor(settings,preset,items.map(u=>u.id)))))throw Error('Stale speech/source/voice '+id);
    if(r.timingsSha256!==sha(JSON.stringify(cues[id]))||cues[id]?.length!==items.length||cues[id].some((t,i)=>t.sentenceId!==items[i].id||t.segmentId!==items[i].segmentId||t.start<0||t.end<=t.start||t.speechEnd>t.end||t.end>r.durationSeconds+.03))throw Error('Invalid sentence timeline '+id);
    const hashed='assets/audio/generated/'+id+'.'+sha(buf).slice(0,16)+'.mp3';await mkdir(path.join(root,'public/assets/audio/generated'),{recursive:true});
    try{await access(path.join(root,'public',hashed));}catch{await writeFile(path.join(root,'public',hashed),buf);}files[id]=hashed;
    if(r.kind==='chapter'){audioModes[preset][chapter.id]=hashed;timings[preset][chapter.id]=cues[id];if(preset==='slow')publicAudio[chapter.id]=hashed;}
    else sentenceAudio[preset][r.sentenceId]=hashed;
  }
  if(m.chapters.some(c=>Object.values(audioModes).some(mode=>!mode[c.id])||c.segments.some(s=>s.sentences.some(u=>Object.values(sentenceAudio).some(mode=>!mode[u.id])))))throw Error('Every sentence and chapter/preset needs a verified MP3');
  const pkg=await readJson('package.json');
  const clientInputs=await Promise.all(['src/main.ts','src/player.ts','src/logic.ts','src/pwa.ts','src/style.css','index.html','scripts/content.mjs','vite.config.ts'].map(f=>readFile(path.join(root,f),'utf8')));
  const published={version:pkg.version,contentVersion:contentRevision(m.chapters,provenance,clientInputs),chapters:m.chapters.map(c=>({id:c.id,title:c.title,subtitle:c.title,inMainLoop:c.inMainLoop!==false,segments:c.segments.map(({id,text,displayText,speechText,sentences,kind,parts,category,tier})=>({id,text,displayText,speechText,sentences,kind,parts,category,tier}))})),audio:publicAudio,audioModes,sentenceAudio,files,timings,presets:Object.entries(settings.presets).map(([id,p])=>({id,...p})),defaultRate:.7,defaultPreset:'slow',referenceRate:settings.referenceRate};
  await mkdir(path.join(root,'src'),{recursive:true});
  await writeFile(path.join(root,'src/library.generated.json'),JSON.stringify(published,null,2)+'\n');
  return m;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='extract')throw Error('Use sync:notes: legacy extraction is retired');
  const m=await compile(); console.log('Validated '+m.chapters.length+' chapters; real audio files only.');
}

