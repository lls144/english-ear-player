import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bootstrap,synchronize} from './sync-core.mjs';
import {root,readJson,validate} from './content.mjs';
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
export async function syncNotes({sourceFile=null,preview=false,initialize=false}={}){
 await fs.mkdir(path.join(root,'.local'),{recursive:true});
 const materials=await readJson('content/materials.json');let state;
 try{state=await readJson('.local/sync-state.json');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!state){
  if(!initialize)throw Error('Missing local source anchors. Bootstrap from the private locked source snapshot.');
  const source=await fs.readFile(path.join(root,'.local/source.md'),'utf8'),b=bootstrap(source,materials);
  await fs.writeFile(path.join(root,'content/materials.json'),JSON.stringify(b.materials,null,2)+'\n');
  await fs.writeFile(path.join(root,'.local/sync-state.json'),JSON.stringify(b.state,null,2)+'\n');
  console.log('Stable source anchors initialized without changing English or MP3.');return b;
 }
 let source,blob;
 if(sourceFile){source=await fs.readFile(path.resolve(sourceFile),'utf8');blob='local-fixture';}
 else{
  const c=await readJson('.local/sync-config.json');
  if(c.ref!=='master'||!c.repository||!c.path)throw Error('Invalid local source configuration');
  const endpoint='repos/'+c.repository+'/contents/'+c.path.split('/').map(encodeURIComponent).join('/')+'?ref='+c.ref;
  const response=JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true}));
  source=Buffer.from(response.content,'base64').toString('utf8');blob=response.sha;
 }
 let resolutions={};try{resolutions=await readJson('.local/sync-resolutions.json');}catch(error){if(error.code!=='ENOENT')throw error;}
 try{const config=await readJson('.local/sync-config.json');state.chapterRules=config.chapterRules??state.chapterRules??[];}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=synchronize(state,source,materials,resolutions),id=Date.now()+'-'+process.pid,folder=path.join(root,'.local/sync-reports');
 await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,id+'.json'),JSON.stringify({...result,sourceBlob:blob},null,2)+'\n');
 if(result.conflicts.length)throw Error('Sync blocked by '+result.conflicts.length+' source conflicts. Private report: .local/sync-reports/'+id+'.json');
 validate(result.materials);
 if(!preview){
  const backup=path.join(root,'.local/backups',id);await fs.mkdir(backup,{recursive:true});
  await fs.writeFile(path.join(backup,'materials.json'),JSON.stringify(materials,null,2)+'\n');await fs.writeFile(path.join(backup,'sync-state.json'),JSON.stringify(state,null,2)+'\n');
  const next=JSON.stringify(result.materials,null,2)+'\n',old=JSON.stringify(materials,null,2)+'\n';
  try{
   if(next!==old)await fs.writeFile(path.join(root,'content/materials.json'),next);
   await fs.writeFile(path.join(root,'.local/sync-state.json'),JSON.stringify({...result.state,blobSha:blob},null,2)+'\n');
   await fs.writeFile(path.join(root,'.local/source-current.md'),source);
  }catch(error){await fs.writeFile(path.join(root,'content/materials.json'),old);await fs.writeFile(path.join(root,'.local/sync-state.json'),JSON.stringify(state,null,2)+'\n');throw error;}
 }
 console.log(JSON.stringify({changes:result.changes,counts:result.counts,preview,sourceChanged:state.sourceHash!==result.state.sourceHash}));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await syncNotes({sourceFile:arg('--source-file'),preview:args.includes('--preview'),initialize:args.includes('--bootstrap')});

