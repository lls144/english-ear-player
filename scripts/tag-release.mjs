import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyCheckpoint,retainCheckpoint} from './release-checkpoint.mjs';
const value=n=>process.argv[process.argv.indexOf(n)+1],commit=value('--commit'),version=value('--version');
if(!/^[a-f0-9]{40}$/.test(commit)||!/^\d+\.\d+\.\d+$/.test(version))throw Error('A verified production commit and stable version are required');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',windowsHide:true}).trim();
if(!/github\.com[:/]lls144\/english-ear-player(?:\.git)?$/.test(git('remote','get-url','origin')))throw Error('Unexpected public origin');
if(JSON.parse(git('show',commit+':package.json')).version!==version)throw Error('Tag version does not match commit');
const runs=JSON.parse(execFileSync('gh',['run','list','--repo','lls144/english-ear-player','--commit',commit,'--workflow','pages.yml','--json','headBranch,status,conclusion'],{encoding:'utf8',windowsHide:true}));
if(!runs.some(r=>r.headBranch==='main'&&r.status==='completed'&&r.conclusion==='success'))throw Error('Only a successful production deployment and HTTPS acceptance may be tagged');
const state=JSON.parse(await fs.readFile('.local/sync-state.json','utf8')),source=await fs.readFile('.local/source-current.md','utf8');
verifyCheckpoint(JSON.parse(git('show',commit+':content/materials.json')),state,source);
const tag='v'+version,remote=git('ls-remote','--tags','origin','refs/tags/'+tag,'refs/tags/'+tag+'^{}').split('\n').filter(Boolean);
if(remote.length){
 const target=(remote.find(s=>s.endsWith('^{}'))??remote[0]).split(/\s+/)[0];
 if(target!==commit)throw Error('Existing release tag has a different target; history will not be rewritten');
 console.log('Verified release tag already exists: '+tag);
}else{
 const local=git('tag','--list',tag);
 if(local&&git('rev-parse',tag+'^{}')!==commit)throw Error('Conflicting local tag; publication refused');
 if(!local)git('tag','-a',tag,'-m','Verified production release '+version,commit);
 git('push','origin','refs/tags/'+tag);console.log('Recorded verified release tag: '+tag);
}
const checkpoints=path.resolve('.local/release-checkpoints'),target=path.join(checkpoints,tag);await fs.mkdir(checkpoints,{recursive:true});
let existing;try{existing=JSON.parse(await fs.readFile(path.join(target,'release.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(existing){if(existing.commit!==commit)throw Error('Conflicting private release checkpoint');}
else{
 const pending=await fs.mkdtemp(path.join(checkpoints,'.pending-'));
 await fs.writeFile(path.join(pending,'sync-state.json'),JSON.stringify(state,null,2)+'\n');
 await fs.writeFile(path.join(pending,'source-current.md'),source);
 await fs.writeFile(path.join(pending,'release.json'),JSON.stringify({tag,commit},null,2)+'\n');
 if(!target.startsWith(checkpoints+path.sep)||!pending.startsWith(checkpoints+path.sep))throw Error('Checkpoint path escapes local storage');
 await retainCheckpoint(pending,target);
}
console.log('Verified private source checkpoint retained locally.');
