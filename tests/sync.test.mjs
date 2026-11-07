import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrap,synchronize,parseNote} from '../scripts/sync-core.mjs';
const source='## 一段\n### 描图\nA student listens to a lecture.\n## 二段\n### 主题句\nLearning matters in modern society.\n### 原因\nPractice helps us improve steadily.\n## 连接词\nFirstly, we should make a plan.\n## 三段\nLearning deserves our attention.';
const ids=['picture','theme-trends','reasons','connectors','conclusion'];
function fixture(){
 const b=parseNote(source);
 const m={schemaVersion:1,chapters:ids.map(id=>{const x=b.find(x=>x.chapter===id);return {id,title:id,subtitle:id,segments:[{id:id+'-1',kind:id==='picture'?'adapted-template':'source-text',text:x.normalized,sourceLines:[[x.line,x.line]],change:'Fixture'}]};})};
 return bootstrap(source,m);
}
test('unchanged source is a byte-stable material no-op',()=>{const f=fixture(),r=synchronize(f.state,source,f.materials);assert.deepEqual(r.materials,f.materials);assert.deepEqual(r.conflicts,[]);assert.deepEqual(r.changes,[]);});
test('Chinese remarks and shifted lines preserve stable ids and all curated content',()=>{const f=fixture(),r=synchronize(f.state,'中文备注\n\n'+source,f.materials);assert.deepEqual(r.materials,f.materials);assert.deepEqual(r.conflicts,[]);});
test('new complete English enters the correct chapter without replacing adaptations',()=>{
 const f=fixture(),next=source.replace('## 连接词','**Consistent practice helps students make steady progress.**（中文备注）\n## 连接词'),r=synchronize(f.state,next,f.materials);
 assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters[2].segments.length,2);assert.equal(r.materials.chapters[2].segments[1].kind,'source-text');assert.equal(r.materials.chapters[0].segments[0].kind,'adapted-template');
});
test('confident source edit retains source and segment identities',()=>{
 const f=fixture(),next=source.replace('Practice helps us improve steadily.','Regular practice helps us improve steadily.'),r=synchronize(f.state,next,f.materials);
 assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters[2].segments[0].id,f.materials.chapters[2].segments[0].id);assert.deepEqual(r.materials.chapters[2].segments[0].sourceIds,f.materials.chapters[2].segments[0].sourceIds);
});
test('source deletion is explicit and never silently removes a whole chapter',()=>{
 const f=fixture(),r=synchronize(f.state,source.replace('Practice helps us improve steadily.\n',''),f.materials);
 assert.ok(r.conflicts.some(x=>x.type==='empty-chapter'));assert.ok(r.changes.some(x=>x.type==='deleted'));
});
test('a deleted added paragraph can return to exactly the original materials',()=>{
 const f=fixture(),next=source.replace('## 连接词','Consistent practice helps students make steady progress.\n## 连接词'),added=synchronize(f.state,next,f.materials),removed=synchronize(added.state,source,added.materials);
 assert.equal(removed.conflicts.length,0);assert.deepEqual(removed.materials,f.materials);
});
test('changed template dependencies block publication and preserve the curated input',()=>{
 const f=fixture(),copy=structuredClone(f.materials),r=synchronize(f.state,source.replace('A student listens','Another student listens'),f.materials);
 assert.ok(r.conflicts.some(x=>x.type==='edited-material-source-changed'));assert.deepEqual(f.materials,copy);
});
test('placeholder additions are never read as finished English',()=>{
 const f=fixture(),r=synchronize(f.state,source.replace('## 连接词','A message about [主题词].\n## 连接词'),f.materials);
 assert.ok(r.conflicts.some(x=>x.type==='new-content-needs-editorial-review'));
});
test('local edits conflict with affected upstream edits instead of being overwritten',()=>{
 const f=fixture();f.materials.chapters[2].segments[0].text='My own edited practice sentence.';
 const r=synchronize(f.state,source.replace('Practice helps us improve steadily.','Daily practice helps us improve steadily.'),f.materials);
 assert.ok(r.conflicts.some(x=>x.type==='local-edit-conflict'));
});
test('unknown sections are reported rather than assigned to an arbitrary chapter',()=>{
 const f=fixture(),r=synchronize(f.state,source+'\n## Unknown appendix\nThis sentence belongs to an unknown chapter.',f.materials);
 assert.ok(r.conflicts.some(x=>x.type==='new-content-needs-editorial-review'));
});
test('explicit reviewed chapter rules append a new chapter without renumbering the old ones',()=>{
 const f=fixture();f.state.chapterRules=[{heading:'New essay',id:'new-essay',title:'New essay'}];
 const r=synchronize(f.state,source+'\n## New essay\nEducation helps people build a better future.',f.materials);
 assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters.length,6);assert.deepEqual(r.materials.chapters.slice(0,5).map(c=>c.id),ids);
});
test('wrapped complete English is a single paragraph',()=>{
 const f=fixture(),r=synchronize(f.state,source.replace('## 连接词','Consistent practice helps students\nmake steady progress.\n## 连接词'),f.materials);
 assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters[2].segments.at(-1).text,'Consistent practice helps students make steady progress.');
});

