import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha = b => createHash('sha256').update(b).digest('hex');
export const readJson = async p => JSON.parse(await readFile(path.join(root,p),'utf8'));
export function validate(materials) {
  if (materials.schemaVersion !== 1 || !Array.isArray(materials.chapters) || !materials.chapters.length) throw Error('Invalid library schema');
  const ids = new Set();
  for (const chapter of materials.chapters) {
    if (!/^[a-z0-9-]+$/.test(chapter.id) || ids.has(chapter.id) || !chapter.title || !chapter.segments?.length) throw Error('Invalid chapter');
    ids.add(chapter.id);
    for (const s of chapter.segments) {
      if (!s.id || ids.has(s.id)) throw Error('Duplicate/missing segment id');
      ids.add(s.id);
      if (!['adapted-template','source-example','source-text','editorial-practice','user-authored'].includes(s.kind)) throw Error('Unknown provenance');
      if (!s.text || /[\u3400-\u9fff]|×|\[|\]|\.\.\.|…|do sth\b|==|\*\*|\|/.test(s.text) || !/[.!?]$/.test(s.text)) throw Error('Incomplete/non-English text: '+s.id);
      if (!Array.isArray(s.sourceLines) || (!s.sourceLines.length && s.kind!=='user-authored') || !s.change) throw Error('Missing source mapping: '+s.id);
    }
  }
}
export async function compile() {
  const m=await readJson('content/materials.json'); validate(m);
  const audio=await readJson('content/audio-manifest.json'),publicAudio={};
  const provenance=await readJson('content/audio-provenance.json');
  for (const [id,file] of Object.entries(audio)) {
    if (!m.chapters.some(c=>c.id===id) || typeof file!=='string' || !/^assets\/audio\/[a-zA-Z0-9_-]+\.mp3$/.test(file)) throw Error('Invalid audio entry: '+id);
    const buf=await readFile(path.join(root,'public',file));
    if(buf.length < 512 || !(buf.subarray(0,3).toString()==='ID3' || (buf[0]===255 && (buf[1]&224)===224))) throw Error('Not an MP3: '+file);
    const chapter=m.chapters.find(c=>c.id===id),receipt=provenance.find(r=>r.id===id);
    if(!receipt || receipt.textSha256!==sha(chapter.segments.map(s=>s.text).join('\n\n')) || receipt.mp3Sha256!==sha(buf))throw Error('Stale audio/text provenance: '+id);
    const hashed='assets/audio/generated/'+id+'.'+sha(buf).slice(0,16)+'.mp3';
    await mkdir(path.join(root,'public/assets/audio/generated'),{recursive:true});
    try{await access(path.join(root,'public',hashed));}catch{await writeFile(path.join(root,'public',hashed),buf);}
    publicAudio[id]=hashed;
  }
  // No source excerpts, repository metadata, or private Markdown enter the browser bundle.
  if(m.chapters.some(c=>!audio[c.id]))throw Error('Every published chapter needs a verified MP3');
  const pkg=await readJson('package.json');
  const published={version:pkg.version,contentVersion:sha(JSON.stringify(m.chapters.map(c=>({id:c.id,text:c.segments.map(s=>s.text),kinds:c.segments.map(s=>s.kind)})))+JSON.stringify(provenance)).slice(0,24),chapters:m.chapters.map(c=>({id:c.id,title:c.title,subtitle:c.subtitle,segments:c.segments.map(({id,text,kind})=>({id,text,kind}))})),audio:publicAudio};
  await mkdir(path.join(root,'src'),{recursive:true});
  await writeFile(path.join(root,'src/library.generated.json'),JSON.stringify(published,null,2)+'\n');
  return m;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (process.argv[2]==='extract') {
    const lock=await readJson('.local/source-lock.json');
    const source=await readFile(path.join(root,'.local/source.md'),'utf8');
    const normalized=source.replace(/\r\n/g,'\n').trimEnd();
    if (sha(normalized)!==lock.textSha256) throw Error('Source changed. Review line mappings before updating source-lock.json.');
    const m=await readJson('content/materials.json');
    const lines=normalized.split('\n');
    const mapping=m.chapters.flatMap(c=>c.segments.map(s=>({chapter:c.id,id:s.id,kind:s.kind,lines:s.sourceLines,source:s.sourceLines.map(([a,b])=>lines.slice(a-1,b).join('\n')).join('\n'),text:s.text,change:s.change})));
    for (const row of mapping) if(row.lines.some(([a,b])=>a<1||b<a||b>lines.length)) throw Error('Source line outside note');
    // Exact example is extracted, not silently written or completed as source prose.
    for (const row of mapping.filter(s=>s.kind==='source-example')) {
      const cleaned=row.source.replace(/^>\s?/gm,'').replace(/\*\*|==|\x60/g,'').trim();
      if(cleaned!==row.text) throw Error('Source example differs: '+row.id);
    }
    await writeFile(path.join(root,'.local/source-map.json'),JSON.stringify({source:lock,mapping},null,2)+'\n');
    console.log('Local source mapping verified: '+mapping.length+' segments. Editable English preserved in content/materials.json.');
  }
  const m=await compile(); console.log('Validated '+m.chapters.length+' chapters; real audio files only.');
}

