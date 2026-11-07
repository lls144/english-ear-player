import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const cwd=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024}).trim();
const denied=/(^|\/)(?:\.local|\.venv|node_modules|dist|test-results|playwright-report)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:pem|key)$/;
const patterns=[['credential',/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['personal-absolute-path',/[CD]:[\\/](?:Users|Codex_project|IDE|Application)[\\/]/i]];
try{
 const c=JSON.parse(await fs.readFile(path.join(cwd,'.local/sync-config.json'),'utf8'));
 const escape=s=>s.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
 patterns.push(['private-source-location',new RegExp([c.repository,c.path].map(escape).join('|'))]);
}catch(error){if(error.code!=='ENOENT')throw error;}
const issues=[];let checked=0;
patterns.push(['common-api-secret',/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,}|npm_[A-Za-z0-9]{32,}/]);
function inspect(name,bytes){
 if(denied.test(name))issues.push({file:name,rule:'forbidden-path'});
 if(/\.(?:mp3|png|jpg|zip)$/.test(name))return;
 const text=bytes.toString('utf8');for(const [rule,pattern]of patterns)if(pattern.test(text))issues.push({file:name,rule});checked++;
}
const current=git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(Boolean);
for(const name of current)inspect(name,await fs.readFile(path.join(cwd,name)));
const objects=git('rev-list','--objects','--all').split('\n').filter(Boolean),seen=new Set();
for(const row of objects){const at=row.indexOf(' ');if(at<0)continue;const oid=row.slice(0,at),name=row.slice(at+1);if(seen.has(oid)||git('cat-file','-t',oid)!=='blob')continue;seen.add(oid);inspect(name,execFileSync('git',['cat-file','blob',oid],{cwd,windowsHide:true,maxBuffer:16*1024*1024}));}
if(issues.length){console.error(JSON.stringify(issues,null,2));process.exitCode=1;}else console.log('Public-source scan passed: '+current.length+' files, '+seen.size+' historical blobs, '+checked+' text checks.');

