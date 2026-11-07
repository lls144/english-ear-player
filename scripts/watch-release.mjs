import {execFileSync} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import fs from 'node:fs/promises';
const arg=n=>process.argv[process.argv.indexOf(n)+1],commit=arg('--commit'),branch=arg('--branch');
const gh=(...a)=>execFileSync('gh',a,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
let run,last='',started=Date.now();
while(Date.now()-started<20*60*1000){
 let runs=[];
 try{runs=JSON.parse(gh('run','list','--repo','lls144/english-ear-player','--commit',commit,'--workflow','pages.yml','--json','databaseId,status,conclusion,url'));}catch(error){if(Date.now()-started>120000)throw error;}
 run=runs[0];
 if(run){const status=run.status+'/'+run.conclusion;if(status!==last){console.log('GitHub Actions: '+status+' '+run.url);last=status;}if(run.status==='completed')break;}
 await wait(15000);
}
if(!run||run.conclusion!=='success')throw Error('Build/deploy did not succeed: '+(run?.url??'workflow not found'));
await fs.mkdir('.local/qa',{recursive:true});await fs.writeFile('.local/qa/last-actions.json',JSON.stringify(run,null,2));
if(branch==='main'){
 const {spawnSync}=await import('node:child_process');
 const r=spawnSync(process.execPath,['scripts/check-online.mjs','--url','https://lls144.github.io/english-ear-player/'],{stdio:'inherit',windowsHide:true});
 if(r.status!==0)throw Error('Online acceptance failed; production URL and Actions run retained for diagnosis.');
}

