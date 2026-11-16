import fs from'node:fs/promises';import{spawnSync}from'node:child_process';import{setTimeout as delay}from'node:timers/promises';
const url='https://lls144.github.io/english-ear-player/',expected=JSON.parse(await fs.readFile('dist/version.json','utf8'));let ready=false;
for(let i=0;i<240;i++){
 try{const r=await fetch(url+'version.json?formal='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)}),v=await r.json();if(v.version===expected.version&&v.contentVersion===expected.contentVersion&&v.buildVersion===expected.buildVersion){ready=true;break;}}catch{}
 if(i%4===0)console.log('Waiting for the actual production revision '+expected.contentVersion);await delay(15000);
}
if(!ready)throw Error('Actual production did not match the exact candidate');
// Reuse the complete unmodified HTTPS asset/hash audit. The six browser jobs
// execute every online test independently; this job audits bytes only.
const source=await fs.readFile('scripts/check-online.mjs','utf8'),at=source.indexOf('const test=spawnSync(');if(at<0)throw Error('HTTPS auditor structure changed');const file='scripts/probe-formal-assets.mjs';
await fs.writeFile(file,source.slice(0,at));try{const result=spawnSync(process.execPath,[file,'--url',url],{stdio:'inherit'});if(result.status!==0)throw Error('Actual production asset audit failed');}finally{await fs.unlink(file);}
