import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {root,readJson,sha,validate} from './content.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
const source=(await readFile(path.join(root,'.local/source-current.md'),'utf8')).replace(/\r\n/g,'\n').trimEnd();
const lock=await readJson('.local/source-lock.json');
assert.equal(sha(source),lock.textSha256,'Remote source changed');
const m=await readJson('content/materials.json');validate(m);
const all=m.chapters.flatMap(c=>c.segments),text=all.map(s=>s.text).join(' ').toLowerCase();
const clean=s=>s.replace(/\*\*|==|\x60/g,'').replace(/（[^）]*）/g,'').trim();
const lines=source.split('\n');
const trends=[...lines.slice(41,47),...lines.slice(52,58)].map(l=>clean(l.split('|')[2]));
const connectors=lines.slice(83,87).flatMap(l=>l.split('|').slice(2,4).flatMap(v=>v.split('/').map(clean)));
const checked=[];
for(const phrase of [...trends,...connectors]){
 const terms=phrase==='Not only...but also...'?['not only','but also']:[phrase.toLowerCase()];
 assert.ok(terms.every(t=>text.includes(t)),'Missing memorization phrase: '+phrase);checked.push(phrase);
}
const sourceExample=clean(lines[22].replace(/^>\s?/,''));
assert.equal(all.find(s=>s.kind==='source-example').text,sourceExample);
for(const s of all){
 for(const [a,b]of s.sourceLines)assert.ok(a>=1&&b>=a&&b<=lines.length);
 assert.ok(s.change.length>0);assert.ok(s.kind!=='source-example'||s.id==='picture-example');
}
const receipts=await readJson('.local/generated/receipts.json');
for(const c of m.chapters)assert.equal(sha(c.segments.map(s=>s.text).join('\n\n')),receipts.find(r=>r.id===c.id).textSha256);
const result={sourceBlob:lock.blobSha,remoteMatchesLockedSource:true,chapters:m.chapters.length,segments:all.length,sourceExamples:all.filter(s=>s.kind==='source-example').length,checkedPhrases:checked,explicitExclusions:m.excluded,audioTextsMatch:true};
await mkdir(path.join(root,'.local/qa'),{recursive:true});
await writeFile(path.join(root,'.local/qa/content-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log('Content audit passed: '+all.length+' mapped segments, '+checked.length+' trend/connector expressions, '+receipts.length+' audio text hashes.');

