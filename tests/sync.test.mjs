import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrap,synchronize,speechParts,sourceIndex} from '../scripts/source-only.mjs';
import {validate} from '../scripts/content.mjs';
const source='## 一段\n### 描图\nPortrayed in the drawing is a scene: + 完整句子.\nA student listens to a lecture.\n## 二段\n### 主题句\nLearning matters in modern society.\n### 原因\nPractice helps us improve steadily.\n## 连接词\n| 用途 | 基础 | 进阶 |\n|---|---|---|\n| 开篇 | Firstly / First of all | Primarily |\n| 总结 | Finally | Not only...but also... |\n## 三段\nLearning deserves our attention.';
const fixture=()=>bootstrap(source);
test('source-only extraction is an exact no-op on an unchanged note',()=>{const f=fixture(),r=synchronize(f.state,source,f.materials);assert.deepEqual(r.materials,f.materials);assert.deepEqual(r.conflicts,[]);assert.deepEqual(r.changes,[]);});
test('no phrase receives a fabricated example or a filled topic',()=>{const f=fixture();assert.deepEqual(f.materials.chapters[3].segments.map(s=>s.text),['Firstly','First of all','Primarily','Finally','Not only...but also...']);assert.ok(f.materials.chapters[0].segments[0].text.includes('[完整句子]'));assert.ok(!JSON.stringify(f.materials).includes('lifelong learning'));});
test('neutral speech keeps a complete template together without slot silence',()=>{const p=speechParts('Folks value [主题词], ×× and choose to do sth. Not only...but also...');assert.ok(p.every(p=>!p.pauseMs));assert.equal(p[0].text,'Folks value something, A and choose to do something.');assert.equal(p[1].text,'Not only A, but also B.');});

test('a new source template beginning with a topic slot is kept unfilled',()=>{const f=fixture(),r=synchronize(f.state,source.replace('## 连接词','[主题词] can bring benefits.\n## 连接词'),f.materials);assert.equal(r.conflicts.length,0);const s=r.materials.chapters[2].segments.at(-1);assert.equal(s.text,'[主题词] can bring benefits.');assert.equal(s.kind,'source-template');assert.deepEqual(s.parts,[{text:'something can bring benefits.'}]);});
test('Chinese remarks and moving lines preserve source and segment identities',()=>{const f=fixture(),r=synchronize(f.state,'中文备注\n\n'+source,f.materials);assert.deepEqual(r.materials,f.materials);assert.deepEqual(r.conflicts,[]);});

test('reordering original phrases preserves their stable IDs without false deletions',()=>{const f=fixture(),next=source.replace('Firstly / First of all','First of all / Firstly'),r=synchronize(f.state,next,f.materials);assert.equal(r.conflicts.length,0);for(const s of r.materials.chapters[3].segments)assert.equal(s.id,f.materials.chapters[3].segments.find(p=>p.text===s.text).id);assert.deepEqual(r.changes,[]);});
test('new raw phrases and unfilled templates enter without completion',()=>{const f=fixture(),next=source.replace('## 连接词','the growing demand for ...\nA message about [主题词].\n## 连接词'),r=synchronize(f.state,next,f.materials);assert.equal(r.conflicts.length,0);assert.deepEqual([r.materials.chapters.find(c=>c.id==='phrases').segments[0].text,r.materials.chapters[2].segments.at(-1).text],['the growing demand for ...','A message about [主题词].']);assert.equal(r.changes.filter(c=>c.type==='added').length,2);});
test('source edits keep stable identities and explicitly record the change',()=>{const f=fixture(),r=synchronize(f.state,source.replace('Practice helps','Regular practice helps'),f.materials);assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters[2].segments[0].id,f.materials.chapters[2].segments[0].id);assert.equal(r.changes[0].type,'updated');});
test('source deletion is recorded and the obsolete chapter is removed',()=>{const f=fixture(),r=synchronize(f.state,source.replace('Practice helps us improve steadily.\n',''),f.materials);assert.equal(r.conflicts.length,0);assert.ok(r.changes.some(c=>c.type==='deleted'));assert.ok(!r.materials.chapters.some(c=>c.id==='reasons'));});
test('adding then deleting an original phrase returns the exact baseline',()=>{const f=fixture(),next=source.replace('## 连接词','Consistent practice helps students make steady progress.\n## 连接词'),a=synchronize(f.state,next,f.materials),b=synchronize(a.state,source,a.materials);assert.deepEqual(b.materials,f.materials);});
test('manual local English edits block synchronization even if upstream is unchanged',()=>{const f=fixture();f.materials.chapters[2].segments[0].text='These reasons show why learning matters.';f.materials.chapters[2].segments[0].parts=speechParts(f.materials.chapters[2].segments[0].text);const r=synchronize(f.state,source,f.materials);assert.ok(r.conflicts.some(c=>c.type==='local-source-edit'));});
test('changing many adjacent source items is reported as ambiguous',()=>{const f=fixture(),r=synchronize(f.state,source.replace('Firstly / First of all','To start / At first'),f.materials);assert.ok(r.conflicts.some(c=>c.type==='ambiguous-source-region'));});
test('unknown English sections do not disappear silently',()=>{const f=fixture(),r=synchronize(f.state,source+'\n## Unknown appendix\nEducation helps people build a future.',f.materials);assert.ok(r.conflicts.some(c=>c.type==='unmapped-source'));});
test('unrecognized table formats block instead of silently dropping the English',()=>{const f=fixture(),r=synchronize(f.state,source+'\n中文备注：an extra English expression',f.materials);assert.ok(r.conflicts.some(c=>c.type==='unclassified-English'));});

test('even a single unclassified connector blocks publication instead of disappearing',()=>{const f=fixture(),r=synchronize(f.state,source+'\n附加：Moreover',f.materials);assert.ok(r.conflicts.some(c=>c.type==='unclassified-English'));});
test('source duplicates merge their mappings without duplicate listening items',()=>{const f=fixture(),r=synchronize(f.state,source.replace('A student listens to a lecture.','A student listens to a lecture.\nA student listens to a lecture.'),f.materials);assert.equal(r.materials.chapters[0].segments.filter(s=>s.text==='A student listens to a lecture.').length,1);});
test('reviewed chapter rules append a chapter while preserving the existing order',()=>{const f=fixture();f.state.chapterRules=[{heading:'New essay',id:'new-essay',title:'新原文'}];const r=synchronize(f.state,source+'\n## New essay\nEducation helps people build a future.',f.materials);assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters.at(-1).id,'new-essay');});
test('legacy adapted/editorial kinds can never pass the new publication gate',()=>{const f=fixture();f.materials.chapters[0].segments[0].kind='adapted-template';assert.throws(()=>validate(f.materials),/forbidden/);assert.throws(()=>synchronize({schemaVersion:1},source,{schemaVersion:1}),/migration/);});
test('a reviewed source index detects invented text even with internally consistent parts',()=>{const f=fixture(),index=sourceIndex(f.materials);f.materials.chapters[2].segments[0].text='These reasons show why learning matters.';f.materials.chapters[2].segments[0].parts=speechParts(f.materials.chapters[2].segments[0].text);assert.notDeepEqual(sourceIndex(f.materials),index);});


test('phrases and phrase templates are separated without changing their original source IDs',()=>{
 const raw='## 一段\n### 描人物插入语\n`taking a positive view`\nThe girl on the left smiles.\n## 二段\n### 主题句\nBehind the drawing lies [主题词].\n##### 通用趋势\n| 趋势 | 英文 |\n| 科技 | ==rapid technological advances== |\n`the growing demand for ...`';
 const f=bootstrap(raw),phrase=f.materials.chapters.find(c=>c.id==='phrases');
 assert.deepEqual(phrase.segments.map(s=>s.text),['taking a positive view','rapid technological advances','the growing demand for ...']);
 assert.equal(phrase.inMainLoop,false);assert.equal(f.materials.chapters[0].segments.length,1);
 assert.deepEqual(bootstrap(raw,f.materials).materials,f.materials);
 const r=synchronize(f.state,raw,f.materials);assert.deepEqual(r.materials,f.materials);assert.deepEqual(r.conflicts,[]);
});
test('small essay sections do not leak into big essay chapters and infinitive phrases stay separate',()=>{
 const f=bootstrap('# 大作文\n## 一段\nA girl smiles.\n# 小作文\n## 一段\nRegarding [主题], I, as a [身份], am writing this letter with the aim of [doing sth].\n> as an undergraduate at a local university；as the president of the Students\' Union\n## 二段\n##### 建议\n1. seek assistance from professionals\nPlease join the event.\n## 三段\nPlease feel free to contact me.');
 assert.equal(f.materials.chapters.find(c=>c.id==='picture').segments.length,1);
 assert.equal(f.materials.chapters.find(c=>c.id==='letter-body').segments[0].text,'Please join the event.');
 assert.equal(f.materials.chapters.find(c=>c.id==='phrases').segments.length,3);
 assert.equal(f.materials.chapters.find(c=>c.id==='letter-opening').segments[0].speechText,'Regarding something, I, as somebody, am writing this letter with the aim of doing something.');
});
test('one existing-category edit plus an appended section preserves the edited source identity',()=>{
 const f=fixture(),r=synchronize(f.state,source.replace('Learning deserves our attention.','Learning deserves much more attention.')+'\n# 小作文\n## 三段\nPlease contact me.',f.materials);
 assert.equal(r.conflicts.length,0);assert.equal(r.materials.chapters.find(c=>c.id==='conclusion').segments[0].id,f.materials.chapters.find(c=>c.id==='conclusion').segments[0].id);
 assert.ok(r.changes.some(c=>c.type==='updated'));assert.ok(r.changes.some(c=>c.type==='added'));
});

test('published paragraphs contain no standalone source phrases and moved V1.2 units keep IDs',async()=>{
 const fs=await import('node:fs/promises'),m=JSON.parse(await fs.readFile('content/materials.json','utf8'));
 for(const c of m.chapters)if(!['phrases','connectors'].includes(c.id))assert.ok(c.segments.every(s=>s.kind!=='source-phrase'),c.id);
 const {execFileSync}=await import('node:child_process');const prior=JSON.parse(execFileSync('git',['show','v1.2.0:content/materials.json'],{encoding:'utf8'}));
 const old=prior.chapters.flatMap(c=>c.segments);for(const s of m.chapters.find(c=>c.id==='phrases').segments){const before=old.find(o=>o.text===s.text);if(before){assert.equal(s.id,before.id);assert.deepEqual(s.sentences.map(u=>u.id),before.sentences.map(u=>u.id));}}
});
