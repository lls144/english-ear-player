// Local-only fault injection: a changed voice/policy must not reuse old audio.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root,sha} from './content.mjs';
const python=process.env.EAR_AI_PYTHON??path.join(root,process.platform==='win32'?'.local/ai-venv/Scripts/python.exe':'.local/ai-venv/bin/python');
const pronunciation=spawnSync(python,['scripts/test_pronunciation.py'],{cwd:root,encoding:'utf8',windowsHide:true,env:process.env});
assert.equal(pronunciation.status,0,pronunciation.stderr);console.log(pronunciation.stdout.trim());
const pipeline=spawnSync(python,['scripts/test_audio_pipeline.py'],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(pipeline.status,0,pipeline.stderr);console.log(pipeline.stderr.trim());
await fs.mkdir(path.join(root,'.local/qa'),{recursive:true});
const folder=await fs.mkdtemp(path.join(root,'.local/qa/audio-transaction-'));
await fs.mkdir(path.join(folder,'scripts'));await fs.copyFile(path.join(root,'scripts/kokoro_audio.py'),path.join(folder,'scripts/kokoro_audio.py'));
await fs.cp(path.join(root,'content'),path.join(folder,'content'),{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(root,'content/audio-manifest.json'),'utf8'));
for(const file of Object.values(manifest)){await fs.mkdir(path.dirname(path.join(folder,'public',file)),{recursive:true});await fs.copyFile(path.join(root,'public',file),path.join(folder,'public',file));}
const tracked=['content/audio-provenance.json','content/audio-manifest.json','content/audio-timings.json',...Object.values(manifest).map(f=>'public/'+f)];
const hashes=async()=>Promise.all(tracked.map(async f=>sha(await fs.readFile(path.join(folder,f)))));
const before=await hashes(),settings=JSON.parse(await fs.readFile(path.join(folder,'content/audio-settings.json'),'utf8')),results=[];
for(const [name,mutate] of [
 ['voice',s=>s.voice='af_bella'],['model',s=>s.modelSha256='0'.repeat(64)],
 ['processor',s=>s.processor+='-changed'],['speed',s=>s.presets.continuous.modelSpeed=.69],
 ['pause',s=>s.presets.continuous.phraseGapMs+=100]
]){
 const next=structuredClone(settings);mutate(next);await fs.writeFile(path.join(folder,'content/audio-settings.json'),JSON.stringify(next));
 const r=spawnSync(python,['scripts/kokoro_audio.py','--register'],{cwd:folder,encoding:'utf8',windowsHide:true,env:{...process.env,EAR_TTS_MODEL_DIR:path.join(folder,'missing-model')}});
 assert.notEqual(r.status,0,name+' incorrectly reused old audio');
 assert.match(r.stderr,/Missing or unverified local model/,r.stderr);
 assert.deepEqual(await hashes(),before,name+' failure modified production candidates');results.push({parameter:name,oldAudioRejected:true,failedGenerationPreservedOriginalBytes:true});
}
await fs.writeFile(path.join(root,'.local/qa/audio-transaction.json'),JSON.stringify({passed:results.length,results},null,2)+'\n');console.log(JSON.stringify({passed:results.length,results}));
