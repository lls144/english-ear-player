import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, readJson, sha } from './content.mjs';
async function walk(dir) { const entries=await readdir(dir,{withFileTypes:true}); return (await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat(); }
const files=await walk(path.join(root,'dist'));
for (const file of files) {
  if (/\.(md|map|env)$/.test(file) || /source-map|source-lock|publication/.test(file)) throw Error('Private/unexpected file in dist: '+file);
  if (/\.(js|html|json|css)$/.test(file)) {
    const text=await readFile(file,'utf8');
    if (/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|BEGIN .*PRIVATE KEY/.test(text)) throw Error('Private data/credential in dist');
  }
}
if (process.argv.includes('--release')) {
  const approval=await readJson('content/publication.json');
  const materialHash=sha(await readFile(path.join(root,'content/materials.json')));
  const audioHash=sha(await readFile(path.join(root,'content/audio-manifest.json')));
  const audio=await readJson('content/audio-manifest.json');
  const audioFiles={};
  for(const file of Object.values(audio)) audioFiles[file]=sha(await readFile(path.join(root,'public',file)));
  if (!approval.approved || approval.materialsSha256!==materialHash || approval.audioManifestSha256!==audioHash || JSON.stringify(approval.audioFilesSha256)!==JSON.stringify(audioFiles)) throw Error('Publication not approved for current content. Review selected English and MP3s first.');
}
console.log('Distribution audit passed ('+files.length+' files).');

