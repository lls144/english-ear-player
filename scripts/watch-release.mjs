import {findWorkflowRun} from './github-actions.mjs';
import {setTimeout as wait} from 'node:timers/promises';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
const arg=n=>process.argv[process.argv.indexOf(n)+1],commit=arg('--commit'),branch=arg('--branch');
let run,last='',started=Date.now();
while(Date.now()-started<45*60*1000){
 try{
  run=await findWorkflowRun(commit,branch);
  if(run){const status=run.status+'/'+run.conclusion;if(status!==last){console.log('GitHub Actions: '+status+' '+run.html_url);last=status;}if(run.status==='completed')break;}
 }catch(error){console.log('Status transport unavailable; retrying: '+error.message);}
 await wait(15000);
}
if(!run||run.conclusion!=='success')throw Error('Build/deploy did not succeed: '+(run?.html_url??'workflow not found'));
await fs.mkdir('.local/qa',{recursive:true});await fs.writeFile('.local/qa/last-actions.json',JSON.stringify({databaseId:run.id,status:run.status,conclusion:run.conclusion,url:run.html_url,headSha:run.head_sha},null,2));
if(branch==='main'){
 const r=spawnSync(process.execPath,['scripts/check-online.mjs','--url','https://lls144.github.io/english-ear-player/'],{stdio:'inherit',windowsHide:true});
 if(r.status!==0)throw Error('Online acceptance failed; production URL and Actions run retained for diagnosis.');
}
