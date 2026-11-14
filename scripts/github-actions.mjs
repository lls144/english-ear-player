import {execFileSync} from 'node:child_process';
let credential;
export function selectWorkflowRun(runs,commit,branch){
 return runs.filter(r=>r.head_sha===commit&&r.head_branch===branch&&r.repository?.full_name==='lls144/english-ear-player'&&r.path==='.github/workflows/pages.yml').sort((a,b)=>b.id-a.id)[0];
}
export async function findWorkflowRun(commit,branch){
 if(!/^[a-f0-9]{40}$/.test(commit)||!/^main$|^rehearsal\/[a-z0-9-]+$/.test(branch))throw Error('Invalid production workflow lookup');
 credential??=execFileSync('gh',['auth','token','--hostname','github.com'],{encoding:'utf8',windowsHide:true}).trim();
 const endpoint=new URL('https://api.github.com/repos/lls144/english-ear-player/actions/runs');endpoint.searchParams.set('head_sha',commit);endpoint.searchParams.set('branch',branch);endpoint.searchParams.set('per_page','30');
 const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+credential,Accept:'application/vnd.github+json','User-Agent':'english-ear-local-verifier'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Cannot read production Actions: HTTP '+response.status);
 const data=await response.json();if(!Array.isArray(data.workflow_runs))throw Error('Invalid Actions response');return selectWorkflowRun(data.workflow_runs,commit,branch);
}
