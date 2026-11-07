import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {speechParts,sourceIndex} from './source-only.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha = b => createHash('sha256').update(b).digest('hex');
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
      if(s.parts.some(p=>p.text&&/[\u3400-\u9fff\[\]×]|do sth\b|\.\.\.|\/|==|\*\*/.test(p.text)))throw Error('Unsafe speech placeholder: '+s.id);
    }
  }
}
export async function compile() {
  const m=await readJson('content/materials.json'); validate(m);
  const index=await readJson('content/source-index.json');
  if(JSON.stringify(index)!==JSON.stringify(sourceIndex(m)))throw Error('English differs from the reviewed source index; sync the original note');
  const audio=await readJson('content/audio-manifest.json'),publicAudio={},audioModes={continuous:{},slow:{},recite:{}},timings={continuous:{},slow:{},recite:{}};
  const provenance=await readJson('content/audio-provenance.json');
  const quality=await readJson('content/audio-quality.json');
  const cues=await readJson('content/audio-timings.json'),settings=await readJson('content/audio-settings.json');
  for (const [id,file] of Object.entries(audio)) {
    const receipt=provenance.find(r=>r.id===id),chapter=m.chapters.find(c=>c.id===receipt?.chapterId),preset=receipt?.preset;
    if (!chapter || !audioModes[preset] || typeof file!=='string' || !/^assets\/audio\/[a-zA-Z0-9_-]+\.mp3$/.test(file)) throw Error('Invalid audio entry: '+id);
    const buf=await readFile(path.join(root,'public',file));
    const audit=quality.entries.find(r=>r.id===id);
    if(!audit?.passed||['mp3Sha256','readingPlanSha256','settingsSha256'].some(k=>audit[k]!==receipt[k]))throw Error('Missing/stale audio quality approval: '+id);
    if(buf.length < 512 || !(buf.subarray(0,3).toString()==='ID3' || (buf[0]===255 && (buf[1]&224)===224))) throw Error('Not an MP3: '+file);
    if(receipt.engine!=='kokoro-onnx'||receipt.textSha256!==sha(chapter.segments.map(s=>s.text).join('\n\n')) || receipt.mp3Sha256!==sha(buf)||receipt.settingsSha256!==sha(JSON.stringify({...settings,presets:{[preset]:settings.presets[preset]}})))throw Error('Stale audio/text/voice provenance: '+id);
    if(receipt.readingPlanSha256!==sha(JSON.stringify(chapter.segments.map(s=>({id:s.id,parts:s.parts}))))||receipt.timingsSha256!==sha(JSON.stringify(cues[id])))throw Error('Stale reading plan/timings: '+id);
    if(cues[id]?.length!==chapter.segments.length||cues[id].some((t,i)=>t.segmentId!==chapter.segments[i].id||t.start<0||t.end<=t.start||t.speechEnd>t.end+.01||t.end>receipt.durationSeconds+.15))throw Error('Invalid segment timings: '+id);
    const hashed='assets/audio/generated/'+id+'.'+sha(buf).slice(0,16)+'.mp3';
    await mkdir(path.join(root,'public/assets/audio/generated'),{recursive:true});
    try{await access(path.join(root,'public',hashed));}catch{await writeFile(path.join(root,'public',hashed),buf);}
    audioModes[preset][chapter.id]=hashed;timings[preset][chapter.id]=cues[id];if(preset==='slow')publicAudio[chapter.id]=hashed;
  }
  // No source excerpts, repository metadata, or private Markdown enter the browser bundle.
  if(m.chapters.some(c=>Object.values(audioModes).some(mode=>!mode[c.id])))throw Error('Every chapter/preset needs a verified MP3');
  const pkg=await readJson('package.json');
  const published={version:pkg.version,contentVersion:sha(JSON.stringify(m.chapters)+JSON.stringify(provenance)).slice(0,24),chapters:m.chapters.map(c=>({id:c.id,title:c.title,subtitle:c.title,inMainLoop:c.inMainLoop!==false,segments:c.segments.map(({id,text,kind,parts,category,tier})=>({id,text,kind,parts,category,tier}))})),audio:publicAudio,audioModes,timings,presets:Object.entries(settings.presets).map(([id,p])=>({id,...p})),defaultRate:.7,defaultPreset:'slow',referenceRate:settings.referenceRate};
  await mkdir(path.join(root,'src'),{recursive:true});
  await writeFile(path.join(root,'src/library.generated.json'),JSON.stringify(published,null,2)+'\n');
  return m;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='extract')throw Error('Use sync:notes: legacy extraction is retired');
  const m=await compile(); console.log('Validated '+m.chapters.length+' chapters; real audio files only.');
}

