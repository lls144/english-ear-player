import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {root,readJson,sha} from './content.mjs';
const argv=process.argv.slice(2),has=n=>argv.includes(n),value=n=>{const i=argv.indexOf(n);return i<0?null:argv[i+1];};
const branch=value('--branch')??'main',dry=has('--dry-run'),initial=has('--initial'),rollback=value('--rollback-to'),fixture=value('--source-file');
if(has('--rollback-to')&&!rollback)throw Error('A trusted version tag is required for rollback');
if(!/^main$|^rehearsal\/[a-z0-9-]+$/.test(branch))throw Error('Unsupported release branch');
if(fixture&&!dry&&branch==='main')throw Error('Fixture input cannot be published to the production branch');
if(rollback&&!/^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(rollback))throw Error('Rollback requires a version tag');
const git=(cwd,...a)=>execFileSync('git',a,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
function run(cwd,args,env={}){
 const result=spawnSync(args[0],args.slice(1),{cwd,stdio:'inherit',windowsHide:true,env:{...process.env,...env}});
 if(result.status!==0)throw Error('Release stopped by failed command: '+args.join(' '));
}
const npm=process.platform==='win32'?'npm.cmd':'npm';
function npmRun(cwd,script,env={}){
 // npm.cmd is invoked through Node's npm CLI, never a string-built shell.
 const cli=process.env.npm_execpath;
 if(!cli)throw Error('Invoke through npm run release:content');
 run(cwd,[process.execPath,cli,'run',script],env);
}
await fs.mkdir(path.join(root,'.local'),{recursive:true});
const lock=await fs.open(path.join(root,'.local/release.lock'),'wx').catch(()=>{throw Error('Another release is running or a previous lock needs review');});
await lock.writeFile(String(process.pid));let stage;
try{
 if(git(root,'status','--porcelain'))throw Error('Working tree has uncommitted changes. They will not be overwritten or silently included.');
 const originalHead=git(root,'rev-parse','HEAD');
 if(git(root,'branch','--show-current')!=='main')throw Error('Run maintenance from main');
 const remotes=git(root,'remote');
 if(!dry&&!remotes.split('\n').includes('origin'))throw Error('Missing independent public origin');
 if(remotes.includes('origin')){
  const remote=git(root,'remote','get-url','origin');
  if(!/github\.com[:/]lls144\/english-ear-player(?:\.git)?$/.test(remote))throw Error('Unexpected origin; publication refused');
  git(root,'fetch','origin');
  try{const upstream=git(root,'rev-parse','origin/main');if(git(root,'merge-base',upstream,originalHead)!==upstream)throw Error('Local main is behind/diverged; review before release');}catch(e){if(!initial)throw e;}
 }
 let base=originalHead;
 if(branch!=='main'){try{base=git(root,'rev-parse','origin/'+branch);}catch{}}
 const id=Date.now()+'-'+process.pid;
 stage=path.join(root,'.local/releases',id);await fs.mkdir(path.dirname(stage),{recursive:true});git(root,'worktree','add','--detach',stage,base);
 await fs.mkdir(path.join(stage,'.local'),{recursive:true});
 for(const name of ['sync-config.json','sync-state.json','sync-resolutions.json','source.md','source-current.md']){
  try{await fs.copyFile(path.join(root,'.local',name),path.join(stage,'.local',name));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 try{await fs.cp(path.join(root,'.local/audio-cache'),path.join(stage,'.local/audio-cache'),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.symlink(path.join(root,'node_modules'),path.join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
 const before=JSON.parse(await fs.readFile(path.join(stage,'content/materials.json'),'utf8'));
 const python=path.join(root,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python'),env={EAR_PYTHON:python};
 let audioSummary={changed:[],reused:[],deleted:[],generated:[]};
 if(rollback){
  const prior=JSON.parse(await fs.readFile(path.join(stage,'content/audio-provenance.json'),'utf8'));
  git(stage,'restore','--source='+rollback,'--staged','--worktree','--','.');
  const restored=JSON.parse(await fs.readFile(path.join(stage,'content/audio-provenance.json'),'utf8'));
  audioSummary.changed=restored.filter(r=>prior.find(p=>p.id===r.id)?.mp3Sha256!==r.mp3Sha256).map(r=>r.id);
  audioSummary.reused=restored.filter(r=>!audioSummary.changed.includes(r.id)).map(r=>r.id);
  audioSummary.deleted=prior.filter(r=>!restored.some(p=>p.id===r.id)).map(r=>r.id);
 }
 else{
  run(stage,[process.execPath,'scripts/sync-notes.mjs',...(fixture?['--source-file',path.resolve(fixture)]:[])]);
  npmRun(stage,'audio:update',env);
  audioSummary=JSON.parse(await fs.readFile(path.join(stage,'.local/generated/last-update.json'),'utf8'));
 }
 const contentChanged=Boolean(git(stage,'diff','--name-only','HEAD','--','content','public'));
 if(!contentChanged&&!initial&&!rollback){
  for(const name of ['sync-state.json','source-current.md'])try{await fs.copyFile(path.join(stage,'.local',name),path.join(root,'.local',name));}catch{}
  console.log('No material/audio changes: no commit, no push, no deployment.');
  await fs.writeFile(path.join(root,'.local/last-release.json'),JSON.stringify({noChanges:true,stage},null,2));process.exitCode=0;
 }else{
  const pkg=JSON.parse(await fs.readFile(path.join(stage,'package.json'),'utf8'));
  if(!initial&&!rollback){
   pkg.version=value('--version')??pkg.version.replace(/(\d+)$/,n=>String(Number(n)+1));
   if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(pkg.version))throw Error('Invalid release version');
   await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(pkg,null,2)+'\n');
   const pl=JSON.parse(await fs.readFile(path.join(stage,'package-lock.json'),'utf8'));pl.version=pkg.version;pl.packages[''].version=pkg.version;await fs.writeFile(path.join(stage,'package-lock.json'),JSON.stringify(pl,null,2)+'\n');
  }
  const m=JSON.parse(await fs.readFile(path.join(stage,'content/materials.json'),'utf8')),a=JSON.parse(await fs.readFile(path.join(stage,'content/audio-manifest.json'),'utf8')),audioFilesSha256={};
  for(const file of Object.values(a))audioFilesSha256[file]=sha(await fs.readFile(path.join(stage,'public',file)));
  await fs.writeFile(path.join(stage,'content/publication.json'),JSON.stringify({approved:true,materialsSha256:sha(await fs.readFile(path.join(stage,'content/materials.json'))),audioManifestSha256:sha(await fs.readFile(path.join(stage,'content/audio-manifest.json'))),audioFilesSha256,authorization:'Owner authorized this independent reader and confirmed-source content updates.'},null,2)+'\n');
  const summary={version:pkg.version,rollback:rollback??null,before:{chapters:before.chapters.length,segments:before.chapters.reduce((n,c)=>n+c.segments.length,0)},after:{chapters:m.chapters.length,segments:m.chapters.reduce((n,c)=>n+c.segments.length,0)},audio:audioSummary,branch};
  const changelog=path.join(stage,'CHANGELOG.md');let old='';try{old=await fs.readFile(changelog,'utf8');}catch{}
  await fs.writeFile(changelog,'## '+pkg.version+(rollback?' · rollback '+rollback:'')+'\n\nChapters '+summary.before.chapters+' → '+summary.after.chapters+'; segments '+summary.before.segments+' → '+summary.after.segments+'; generated MP3: '+(audioSummary.generated.join(', ')||'none')+'.\n\n'+old);
  npmRun(stage,'typecheck',env);npmRun(stage,'test',env);npmRun(stage,'test:audio',env);npmRun(stage,'build',env);npmRun(stage,'release:check',env);
  npmRun(stage,'test:e2e:production',env);npmRun(stage,'test:pwa',env);npmRun(stage,'scan:public',env);
  await fs.writeFile(path.join(root,'.local/last-release.json'),JSON.stringify({...summary,dryRun:dry,stage},null,2)+'\n');
  if(dry)console.log('Full isolated release rehearsal passed. Production files, Git history and remote are unchanged.');
  else{
   git(stage,'add','--','content','public','src/library.generated.json','package.json','package-lock.json','CHANGELOG.md');
   await fs.writeFile(path.join(stage,'.local/commit-message.txt'),(rollback?'revert: restore '+rollback:'release: v'+pkg.version)+'\n');
   git(stage,'commit','--file','.local/commit-message.txt');const commit=git(stage,'rev-parse','HEAD');
   if(branch==='main'){
    if(git(root,'rev-parse','HEAD')!==originalHead||git(root,'status','--porcelain'))throw Error('Concurrent user changes detected; validated candidate preserved without overwriting them');
    git(root,'merge','--ff-only',commit);
    for(const name of ['sync-state.json','source-current.md'])try{await fs.copyFile(path.join(stage,'.local',name),path.join(root,'.local',name));}catch{}
    try{await fs.cp(path.join(stage,'.local/audio-cache'),path.join(root,'.local/audio-cache'),{recursive:true});}catch{}
    git(root,'push','origin','main');
   }else{git(stage,'push','origin',commit+':refs/heads/'+branch);}
   await fs.writeFile(path.join(root,'.local/last-release.json'),JSON.stringify({...summary,commit,stage},null,2)+'\n');
   run(root,[process.execPath,'scripts/watch-release.mjs','--commit',commit,'--branch',branch]);
  }
 }
}finally{await lock.close();await fs.unlink(path.join(root,'.local/release.lock'));}

