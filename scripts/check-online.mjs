import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {sha,readJson} from './content.mjs';
const i=process.argv.indexOf('--url'),url=i<0?'https://lls144.github.io/english-ear-player/':process.argv[i+1];
if(!url.startsWith('https://'))throw Error('Formal online acceptance requires HTTPS');
const expected=await readJson('src/library.generated.json'),receipts=await readJson('content/audio-provenance.json');
let meta;
for(let n=0;n<24;n++){
 try{const r=await fetch(new URL('version.json?verify='+Date.now(),url),{cache:'no-store'});if(r.ok){const m=await r.json();if(m.contentVersion===expected.contentVersion&&m.version===expected.version){meta=m;break;}}}catch{}
 if(n%4===0)console.log('Waiting for HTTPS release metadata/CDN propagation…');await wait(5000);
}
if(!meta)throw Error('Production metadata did not match the validated release');
const audio=[];
for(const [id,file]of Object.entries(meta.audio)){
 const response=await fetch(new URL(file,url),{cache:'no-store'});if(!response.ok)throw Error('HTTPS audio missing: '+id);
 const data=Buffer.from(await response.arrayBuffer()),receipt=receipts.find(r=>r.id===id);
 if(!receipt||sha(data)!==receipt.mp3Sha256)throw Error('Production MP3 hash mismatch: '+id);
 audio.push({id,url:new URL(file,url).href,bytes:data.length,sha256:sha(data),status:response.status});
}
await fs.mkdir('.local/qa',{recursive:true});await fs.writeFile('.local/qa/online-media.json',JSON.stringify({url,version:meta.version,contentVersion:meta.contentVersion,audio},null,2));
const test=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.online.config.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,EAR_ONLINE_URL:url}});
if(test.status!==0)throw Error('Live browser acceptance failed');
console.log('Formal HTTPS acceptance passed for '+meta.version+'; '+audio.length+' exact verified MP3 files.');

