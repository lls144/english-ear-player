import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bootstrap,synchronize,sourceIndex} from './source-only.mjs';
import {root,readJson,validate} from './content.mjs';
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?null:args[i+1];};
export async function syncNotes({sourceFile=null,preview=false,initialize=false}={}){
 const materials=await readJson('content/materials.json');let state;
 try{state=await readJson('.local/sync-state.json');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!state){if(!initialize)throw Error('Missing verified local source checkpoint');const source=await fs.readFile(path.join(root,'.local/source-current.md'),'utf8');state=bootstrap(source,materials).state;}
 if(state.schemaVersion!==2||materials.schemaVersion!==2)throw Error('Legacy editorial material requires explicit source-only migration, never automatic completion');
 const config=await readJson('.local/sync-config.json');let source,blob;
 if(sourceFile){source=await fs.readFile(path.resolve(sourceFile),'utf8');blob='local-fixture';}
 else{if(config.ref!=='master')throw Error('Source must be master');const endpoint='repos/'+config.repository+'/contents/'+config.path.split('/').map(encodeURIComponent).join('/')+'?ref=master';const r=JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024}));source=Buffer.from(r.content,'base64').toString('utf8');blob=r.sha;}
 state.chapterRules=config.chapterRules??state.chapterRules??[];
 const result=synchronize(state,source,materials),id=Date.now()+'-'+process.pid,folder=path.join(root,'.local/sync-reports');
 await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,id+'.json'),JSON.stringify({...result,sourceBlob:blob},null,2)+'\n');
 if(result.conflicts.length)throw Error('Sync blocked by '+result.conflicts.length+' conflicts; private report .local/sync-reports/'+id+'.json');
 validate(result.materials);
 if(!preview){
  const targets={'content/materials.json':JSON.stringify(result.materials,null,2)+'\n','content/source-index.json':JSON.stringify(sourceIndex(result.materials),null,2)+'\n','.local/sync-state.json':JSON.stringify({...result.state,blobSha:blob},null,2)+'\n','.local/source-current.md':source},previous={};
  const backup=path.join(root,'.local/backups',id);await fs.mkdir(backup,{recursive:true});
  for(const file of Object.keys(targets)){try{previous[file]=await fs.readFile(path.join(root,file));await fs.writeFile(path.join(backup,path.basename(file)),previous[file]);}catch(e){if(e.code!=='ENOENT')throw e;previous[file]=null;}}
  try{for(const [file,data]of Object.entries(targets))if(previous[file]?.toString('utf8')!==data)await fs.writeFile(path.join(root,file),data);}
  catch(error){for(const [file,data]of Object.entries(previous))if(data)await fs.writeFile(path.join(root,file),data);throw error;}
 }
 console.log(JSON.stringify({changes:result.changes,counts:result.counts,preview,sourceChanged:state.sourceHash!==result.state.sourceHash}));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await syncNotes({sourceFile:arg('--source-file'),preview:args.includes('--preview'),initialize:args.includes('--bootstrap')});
