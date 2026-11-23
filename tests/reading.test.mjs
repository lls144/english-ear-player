import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pronunciation,splitSentences,readingUnits,decorateSegment} from '../scripts/reading.mjs';
import {speechParts,sourceIndex} from '../scripts/source-only.mjs';
import {validate} from '../scripts/content.mjs';
import fs from 'node:fs';
test('a topic template is a single connected sentence with its original punctuation',()=>{
 const text='Behind the drawing/picture lies a profound message about [主题词], which merits further discussion.';
 const u=readingUnits('note',text,['original']);assert.equal(u.length,1);assert.equal(u[0].displayText,text);assert.equal(u[0].speechText,'Behind the drawing lies a profound message about something, which merits further discussion.');assert.deepEqual(speechParts(text),[{text:u[0].speechText}]);
});
test('trend A and trend B stay distinct and letter A is not reduced to an article',()=>{
 const r=pronunciation('An era of [趋势 A] and [趋势 B] highlights [主题词].');assert.equal(r.speechText,'An era of trend A and trend B highlights something.');assert.equal(r.pronunciationText,'An era of trend eigh and trend bee highlights something.');
});
test('numbered neutral slots do not turn into invented topics',()=>{
 const r=pronunciation('A culture of ×× values ××.');assert.equal(r.speechText,'A culture of A values B.');assert.equal(r.pronunciationText,'A culture of eigh values bee.');
});
test('sth and sb abbreviations expand without fragmenting the sentence',()=>{
 const sentences=splitSentences('Ask sb. to do sth. Then wait.');assert.deepEqual(sentences,['Ask sb. to do sth.','Then wait.']);assert.equal(pronunciation(sentences[0]).speechText,'Ask somebody to do something.');
});
test('commas clauses and semicolons do not create separate loop units',()=>{
 const s='The girl on the left, seemingly indifferent to the lecture, dismisses it; the other girl disagrees.';assert.deepEqual(splitSentences(s),[s]);
});
test('titles initialisms and decimals stay in their sentences',()=>{assert.deepEqual(splitSentences('Dr. Smith studies the U.S. economy at 3.14 percent. It changes.'),['Dr. Smith studies the U.S. economy at 3.14 percent.','It changes.']);});
test('whole-sentence placeholders retain display and stop at the complete introduction',()=>{const r=pronunciation('Portrayed here is a scene: [完整句子].');assert.equal(r.speechText,'Portrayed here is a scene.');assert.throws(()=>pronunciation('[完整句子]'),/complete introduction/);});
test('alternative clauses are selected rather than concatenated or expanded',()=>{assert.equal(pronunciation('×× brings benefits—improving competitive advantage/efficiency//bringing about fresh air.').speechText,'A brings benefits—improving competitive advantage.');});
test('a connector phrase remains one unit with neutral missing arguments',()=>{const u=readingUnits('connector','Not only...but also...');assert.equal(u.length,1);assert.equal(u[0].speechText,'Not only A, but also B.');});
test('unchanged sentence IDs survive insertion of another sentence',()=>{const a=readingUnits('parent','First sentence. Second sentence.');const b=readingUnits('parent','New sentence. First sentence. Second sentence.');assert.deepEqual(a.map(u=>u.id),b.slice(1).map(u=>u.id));});
test('unknown placeholders fail closed instead of receiving a made-up completion',()=>{assert.throws(()=>pronunciation('This concerns [unreviewed topic].'),/Unreviewed/);});
test('all current display texts remain the exact sourced text and speech is derivable',()=>{const m=JSON.parse(fs.readFileSync('content/materials.json'));validate(m);for(const c of m.chapters)for(const s of c.segments){assert.equal(s.displayText,s.text);assert.deepEqual(s,decorateSegment(s));assert.ok(s.parts.every(p=>!p.pauseMs));}const ledger=sourceIndex(m);assert.ok(ledger.entries.every(e=>e.displayTextSha256===e.textSha256&&e.sentencesSha256));});
test('editing just speech text cannot bypass source publication validation',()=>{const m=JSON.parse(fs.readFileSync('content/materials.json'));m.chapters[0].segments[0].speechText='Firstly, we should identify the problem.';assert.throws(()=>validate(m),/mapping/);});

test('spaced closing quotation marks stay with the caption sentence',()=>{const s='The caption reads: “A hotpot contains elements such as ‘Kung Fu,’ ‘Lao She,’ and ‘Shakespeare.’ ”';assert.deepEqual(splitSentences(s),[s]);});
test('reviewed new source slots and alternatives keep the letter sentence grammatical',()=>{assert.equal(pronunciation('Regarding [主题], I, as a [身份], am writing this letter with the aim of [doing sth].').speechText,'Regarding something, I, as somebody, am writing this letter with the aim of doing something.');assert.equal(pronunciation('The caption indicates/reads/says “...”').speechText,'The caption reads “something”');});
test('chart template uses distinct neutral years, categories and values across complete sentences',()=>{
 const text='In [开始年], [最大值的名词 B] topped the three[主题词], while in [对比年], a remarkable decline/increase of [差值] occurred, from [开始年数值] to [结束年数值]. By contrast, there was a noticeable jump/decrease of [差值] from [开始年数值] to [结束年数值] during the same period in [另一种变化的名词 A ], and [数据没怎么变动的 C ] stayed at the same level of [对应数值].';
 const units=splitSentences(text).map(pronunciation);
 assert.deepEqual(units.map(u=>u.speechText),[
  'In year A, category B topped the three categories, while in year B, a remarkable decline of a certain amount occurred, from value A to value B.',
  'By contrast, there was a noticeable jump of a certain amount from value C to value D during the same period in category A, and category C stayed at the same level of a given value.'
 ]);
 assert.match(units[0].pronunciationText,/year eigh, category bee/);
});

test('volunteer notice preserves the authored examples but speaks one neutral template',()=>{
 const displayText="To [目的] (improve students' [能力] and enrich their extracurricular life), [雇主] (our university) is recruiting volunteers for [主题].";
 assert.equal(pronunciation(displayText).speechText,'To achieve a goal, an organization is recruiting volunteers for an activity.');
 assert.equal(pronunciation('All contestants must strictly adhere to the following regulations: [具体规定].').speechText,'All contestants must strictly adhere to the following regulations.');
 assert.equal(pronunciation('Selected volunteers will be responsible for [具体职责], including [具体任务1] and [具体任务2].').speechText,'Selected volunteers will be responsible for a set of duties, including task A and task B.');
});

test('numbered alternatives stay together and only the first complete branch is spoken',()=>{
 const displayText='Their improper conduct stems from self-interest, coupled with 1.an obsession with profits//2.a desire for convenience//3.a lack of awareness.';
 assert.deepEqual(splitSentences(displayText),[displayText]);
 assert.equal(pronunciation(displayText).speechText,'Their improper conduct stems from self-interest, coupled with an obsession with profits');
});
