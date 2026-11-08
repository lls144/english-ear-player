import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {sha,readJson,compile} from './content.mjs';
import {build} from 'vite';
const i=process.argv.indexOf('--url'),url=i<0?'https://lls144.github.io/english-ear-player/':process.argv[i+1];
if(!url.startsWith('https://'))throw Error('Formal online acceptance requires HTTPS');
// Rebuild the exact checked-out commit, including after a worktree release merge.
await compile();await build();
if(spawnSync(process.execPath,['scripts/package-site.mjs'],{stdio:'inherit',windowsHide:true}).status!==0)throw Error('Cannot prepare expected production assets');
const artifact=await readJson('dist/version.json');
const expected=await readJson('src/library.generated.json'),receipts=await readJson('content/audio-provenance.json');
let meta;
for(let n=0;n<24;n++){
 try{const r=await fetch(new URL('version.json?verify='+Date.now(),url),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok){const m=await r.json();if(m.contentVersion===expected.contentVersion&&m.version===expected.version&&m.buildVersion===artifact.buildVersion){meta=m;break;}}}catch{}
 if(n%4===0)console.log('Waiting for HTTPS release metadata/CDN propagation…');await wait(5000);
}
if(!meta)throw Error('Production metadata did not match the validated release');
const verifiedAssets=[];
for(const [file,digest]of Object.entries({...artifact.assets,'sw.js':sha(await fs.readFile('dist/sw.js'))})){
 const r=await fetch(new URL(file+'?verify='+Date.now(),url),{cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!r.ok||sha(Buffer.from(await r.arrayBuffer()))!==digest)throw Error('Formal application asset mismatch: '+file);
 verifiedAssets.push({file,sha256:digest,status:r.status});
}
const audio=[];
const entries=Object.entries(meta.audio);
for(let offset=0;offset<entries.length;offset+=6){
 const results=await Promise.allSettled(entries.slice(offset,offset+6).map(async([id,file])=>{
 let response,data;
 for(let attempt=0;attempt<2;attempt++){
  try{response=await fetch(new URL(file,url),{cache:'no-store',signal:AbortSignal.timeout(90000)});data=Buffer.from(await response.arrayBuffer());break;}
  catch(error){if(attempt)throw error;console.log('Retrying transient HTTPS download: '+id);await wait(2000);}
 }
 if(!response?.ok)throw Error('HTTPS audio missing: '+id);
 const receipt=receipts.find(r=>r.id===id);
 if(!receipt||sha(data)!==receipt.mp3Sha256)throw Error('Production MP3 hash mismatch: '+id);
 return {id,url:new URL(file,url).href,bytes:data.length,sha256:sha(data),status:response.status};
 }));
 for(const result of results){if(result.status==='rejected')throw result.reason;audio.push(result.value);}
 console.log('Verified formal HTTPS MP3: '+audio.length+'/'+entries.length);
}
await fs.mkdir('.local/qa',{recursive:true});await fs.writeFile('.local/qa/online-media.json',JSON.stringify({url,version:meta.version,contentVersion:meta.contentVersion,buildVersion:meta.buildVersion,assets:verifiedAssets,audio},null,2));
const test=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.online.config.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,EAR_ONLINE_URL:url}});
if(test.status!==0)throw Error('Live browser acceptance failed');
console.log('Formal HTTPS acceptance passed for '+meta.version+'; '+audio.length+' exact verified MP3 files.');

