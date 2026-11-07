import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseVersion} from '../scripts/release-planning.mjs';
import {verifyCheckpoint} from '../scripts/release-checkpoint.mjs';
import {bootstrap} from '../scripts/sync-core.mjs';
test('normal content releases advance the stable version',()=>assert.equal(releaseVersion('1.0.0',[]),'1.0.1'));
test('releasing after rollback does not reuse an existing published version',()=>assert.equal(releaseVersion('1.0.0',['v1.0.0','v1.0.1','v1.0.2']),'1.0.3'));
test('rehearsal versions do not consume production version numbers',()=>assert.equal(releaseVersion('1.0.0',['v1.0.0','v9.0.0-rehearsal.1']),'1.0.1'));
test('explicit version reuse and malformed versions stop before publication',()=>{
 assert.throws(()=>releaseVersion('1.0.0',['v1.0.1'],'1.0.1'),/already released/);
 assert.throws(()=>releaseVersion('1.0.0',[],'latest'),/Invalid/);
 assert.equal(releaseVersion('1.0.0',[],'1.1.0'),'1.1.0');
});
test('rollback checkpoints must match both private source bytes and public English',()=>{
 const source='## 一段\nEducation matters in modern society.';
 const m={chapters:[{id:'picture',segments:[{id:'one',kind:'source-text',text:'Education matters in modern society.',sourceLines:[[2,2]]}]}]};
 const b=bootstrap(source,m);assert.doesNotThrow(()=>verifyCheckpoint(b.materials,b.state,source));
 assert.throws(()=>verifyCheckpoint(b.materials,b.state,source+' Another sentence.'),/source hash/);
 const edited=structuredClone(b.materials);edited.chapters[0].segments[0].text='Different English.';
 assert.throws(()=>verifyCheckpoint(edited,b.state,source),/published material/);
});
