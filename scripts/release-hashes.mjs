import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root,readJson,sha } from './content.mjs';
const audio=await readJson('content/audio-manifest.json'),audioFilesSha256={};
for(const file of Object.values(audio))audioFilesSha256[file]=sha(await readFile(path.join(root,'public',file)));
const candidate={approved:false,materialsSha256:sha(await readFile(path.join(root,'content/materials.json'))),audioManifestSha256:sha(await readFile(path.join(root,'content/audio-manifest.json'))),audioFilesSha256,note:'仅为当前候选清单，不代表用户已批准公开。'};
await mkdir(path.join(root,'.local'),{recursive:true});
await writeFile(path.join(root,'.local/publication-candidate.json'),JSON.stringify(candidate,null,2)+'\n');
console.log('Review candidate written to ignored .local/publication-candidate.json. No publication permission changed.');

