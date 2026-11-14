import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, speechChunk, safeNumber } from '../src/logic.ts';
import { validate, readJson,contentRevision } from '../scripts/content.mjs';

test('UI-only fixes invalidate the PWA revision with consistent Windows and Linux newlines',()=>{const m=[{text:'Original material.'}],p=[{mp3:'unchanged'}];assert.notEqual(contentRevision(m,p,['old player']),contentRevision(m,p,['fixed player']));assert.equal(contentRevision(m,p,['a\r\nb']),contentRevision(m,p,['a\nb']));});
test('end-of-list behavior and single-chapter repeat',()=>{
  assert.equal(nextIndex(4,5,'all'),0);
  assert.equal(nextIndex(4,5,'off'),null);
  assert.equal(nextIndex(2,5,'one'),2);
  assert.equal(nextIndex(2,5,'off'),3);
});
test('speech chunks reconstruct text without losing characters',()=>{
  const text='A very long sentence '+('with meaningful words '.repeat(40))+'. Next sentence.\n\nFinal sentence.';
  let at=0, rebuilt='';
  while(at<text.length) { const chunk=speechChunk(text,at); assert.ok(chunk.length>0 && chunk.length<=240);rebuilt+=chunk;at+=chunk.length; }
  assert.equal(rebuilt,text);
});
test('untrusted stored settings cannot produce NaN or out of range playback',()=>{
  assert.equal(safeNumber('2',1,.5,2),1);
  assert.equal(safeNumber(Infinity,1,.5,2),1);
  assert.equal(safeNumber(99,1,.5,2),2);
  assert.equal(safeNumber(-1,1,.5,2),.5);
});
test('source examples remain distinct and displayed templates cannot be silently rewritten',async()=>{
  const m=await readJson('content/materials.json');
  validate(m);
  assert.ok(m.chapters.length>=5);
  assert.ok(m.chapters.flatMap(c=>c.segments).some(s=>s.kind==='source-example'&&s.text.startsWith('The girl on the left')));
  m.chapters[0].segments[0].text='A message about [主题词].';
  assert.throws(()=>validate(m),/Spoken text differs/);
});

