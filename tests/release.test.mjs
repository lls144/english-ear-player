import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseVersion} from '../scripts/release-planning.mjs';
import {verifyCheckpoint,retainCheckpoint} from '../scripts/release-checkpoint.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {bootstrap} from '../scripts/sync-core.mjs';
test('normal content releases advance the stable version',()=>assert.equal(releaseVersion('1.0.0',[]),'1.0.1'));
test('releasing after rollback does not reuse an existing published version',()=>assert.equal(releaseVersion('1.0.0',['v1.0.0','v1.0.1','v1.0.2']),'1.0.3'));
test('rehearsal versions do not consume production version numbers',()=>assert.equal(releaseVersion('1.0.0',['v1.0.0','v9.0.0-rehearsal.1']),'1.0.1'));
test('explicit version reuse and malformed versions stop before publication',()=>{
 assert.throws(()=>releaseVersion('1.0.0',['v1.0.1'],'1.0.1'),/already released/);
 assert.throws(()=>releaseVersion('1.0.0',[],'latest'),/Invalid/);
 assert.equal(releaseVersion('1.0.0',[],'1.1.0'),'1.1.0');
});
test('a transient Windows directory lock preserves a complete recoverable checkpoint',async()=>{
 const base=path.resolve('.local/qa/checkpoint-tests');await fs.mkdir(base,{recursive:true});
 const folder=await fs.mkdtemp(path.join(base,'case-')),pending=path.join(folder,'pending'),target=path.join(folder,'v1.0.0');
 await fs.mkdir(pending);await fs.writeFile(path.join(pending,'release.json'),'{"verified":true}');let locked=true;
 await retainCheckpoint(pending,target,async(a,b)=>{if(locked){locked=false;throw Object.assign(Error('temporary scanner lock'),{code:'EPERM'});}await fs.rename(a,b);},async()=>{});
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(target,'release.json'),'utf8')),{verified:true});
 assert.equal(await fs.stat(pending).then(()=>true,()=>false),false);
 // Retain the tiny ignored fixture as evidence; no recursive filesystem cleanup.
});
test('rollback checkpoints must match both private source bytes and public English',()=>{
 const source='## 一段\nEducation matters in modern society.';
 const m={chapters:[{id:'picture',segments:[{id:'one',kind:'source-text',text:'Education matters in modern society.',sourceLines:[[2,2]]}]}]};
 const b=bootstrap(source);assert.doesNotThrow(()=>verifyCheckpoint(b.materials,b.state,source));
 assert.throws(()=>verifyCheckpoint(b.materials,b.state,source+' Another sentence.'),/source hash/);
 const edited=structuredClone(b.materials);edited.chapters[0].segments[0].text='Different English.';
 assert.throws(()=>verifyCheckpoint(edited,b.state,source),/published material/);
});

test('isolated Windows release workers inherit the local browser cache without overriding explicit settings',async()=>{
 const {browserEnv}=await import('../scripts/browser-env.mjs');const base=path.resolve('.local/qa');await fs.mkdir(base,{recursive:true});const cwd=await fs.mkdtemp(path.join(base,'reader-browser-'));await fs.mkdir(path.join(cwd,'.local/browsers'),{recursive:true});
 assert.equal(browserEnv({},cwd,'win32').PLAYWRIGHT_BROWSERS_PATH,path.join(cwd,'.local/browsers'));
 assert.equal(browserEnv({PLAYWRIGHT_BROWSERS_PATH:'explicit'},cwd,'win32').PLAYWRIGHT_BROWSERS_PATH,'explicit');
 assert.deepEqual(browserEnv({},cwd,'linux'),{});
});
