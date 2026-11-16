import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
let source=await fs.readFile(new URL('../src/lyrics.ts',import.meta.url),'utf8');source=source.replace("from './lyric-motion'","from '"+new URL('../src/lyric-motion.ts',import.meta.url).href+"'");
const {LyricsFollower}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));
const controllers=[];let frames=new Map(),frameId=0;
// This small mocked surface tests controller state; real motion/touch is covered in Playwright.
function surface(){
 frames=new Map();globalThis.scrollY=0;globalThis.innerHeight=800;
 const win=new EventTarget();win.scrollTo=({top})=>globalThis.scrollY=top;globalThis.window=win;
 globalThis.document=Object.assign(new EventTarget(),{hidden:false,documentElement:{scrollHeight:3000,dataset:{}}});
 globalThis.matchMedia=()=>Object.assign(new EventTarget(),{matches:false});globalThis.getComputedStyle=()=>({transform:'none'});
 globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const row=at=>({getBoundingClientRect:()=>({top:at-scrollY,bottom:at-scrollY+50,height:50}),style:{setProperty(){},removeProperty(){}},classList:{contains:()=>true}});
 const rows={old:row(500),next:row(1000)},transcript=Object.assign(new EventTarget(),{dataset:{},querySelector:q=>rows[q.match(/"([^"]+)"/)[1]],querySelectorAll:()=>Object.values(rows)});
 const follower=new LyricsFollower(transcript,()=>({top:100,bottom:650}));controllers.push(follower);return {follower,transcript,win};
}
function flush(){const start=performance.now();for(let i=1;i<=80&&frames.size;i++){const list=[...frames.values()];frames.clear();for(const fn of list)fn(start+i*16);}}
function input(target,type,values){target.dispatchEvent(Object.assign(new Event(type),values));}
function begin(s){input(s.transcript,'pointerdown',{pointerId:9,clientX:70,clientY:300});input(s.win,'pointermove',{pointerId:9,clientX:70,clientY:180});}
const settle=()=>new Promise(resolve=>setTimeout(resolve,240));
afterEach(()=>{for(const f of controllers)f.reset();controllers.length=0;});
test('a cue received during transient buffering is retained through an active gesture',async()=>{
 const s=surface();s.follower.update('old',true);flush();begin(s);s.follower.update('next',false);s.follower.update('next',true);input(s.win,'pointerup',{pointerId:9});await settle();assert.equal(s.transcript.dataset.follow,'ANIMATING_TO_LINE');flush();assert.equal(s.transcript.dataset.follow,'FOLLOWING');assert.ok(scrollY>600);
});
test('a buffered cue received after momentum resumes when native playback becomes ready',async()=>{
 const s=surface();s.follower.update('old',true);flush();begin(s);input(s.win,'pointerup',{pointerId:9});await settle();assert.equal(s.transcript.dataset.follow,'AWAITING_NEXT_LINE');s.follower.update('next',false);assert.equal(s.transcript.dataset.follow,'AWAITING_NEXT_LINE');s.follower.update('next',true);flush();assert.equal(s.transcript.dataset.follow,'FOLLOWING');assert.ok(scrollY>600);
});
test('pause and resume without a new cue do not pull a manual reader back',async()=>{
 const s=surface();s.follower.update('old',true);flush();begin(s);input(s.win,'pointerup',{pointerId:9});await settle();s.follower.update('old',false);s.follower.update('old',true);assert.equal(s.transcript.dataset.follow,'AWAITING_NEXT_LINE');
});

test('losing focus releases the motion paint budget instead of leaving the page animating',()=>{const s=surface();s.follower.update('next',true);assert.equal(document.documentElement.dataset.lyricMotion,'moving');input(s.win,'blur',{});assert.equal(s.transcript.dataset.follow,'FOLLOWING');assert.equal(document.documentElement.dataset.lyricMotion,'still');assert.equal(frames.size,0);});

test('repeated slow animation frames reduce decoration for that travel and restore it after settling',()=>{const s=surface();s.follower.update('next',true);const start=performance.now();for(let i=1;i<=3;i++){const list=[...frames.values()];frames.clear();for(const fn of list)fn(start+i*80);}assert.equal(document.documentElement.dataset.motionBudget,'quiet');flush();assert.equal(s.transcript.dataset.follow,'FOLLOWING');assert.equal(document.documentElement.dataset.motionBudget,undefined);});

test('pause and a stationary touch retain depth; actual browsing clears it until a new cue',async()=>{const s=surface();s.follower.update('old',true);flush();s.follower.update('old',false);assert.equal(s.transcript.dataset.browsing,'false');input(s.transcript,'pointerdown',{pointerId:9,clientX:70,clientY:300});assert.equal(s.transcript.dataset.browsing,'false');input(s.win,'pointermove',{pointerId:9,clientX:70,clientY:180});assert.equal(s.transcript.dataset.browsing,'true');input(s.win,'pointerup',{pointerId:9});await settle();s.follower.update('old',true);assert.equal(s.transcript.dataset.browsing,'true');s.follower.update('next',true);flush();assert.equal(s.transcript.dataset.browsing,'false');});

test('selecting a paused sentence or changing chapter restores focused depth without changing audio intent',()=>{const s=surface();begin(s);assert.equal(s.transcript.dataset.browsing,'true');s.follower.select('next');assert.equal(s.transcript.dataset.browsing,'false');begin(s);s.follower.reset();assert.equal(s.transcript.dataset.browsing,'false');});

test('progress preview stops an in-flight spring without clearing focus or moving the native page',()=>{const s=surface();s.follower.update('next',true);assert.ok(frames.size>0);const top=scrollY;s.follower.hold();s.follower.update('next',false);flush();assert.equal(scrollY,top);assert.equal(frames.size,0);assert.equal(s.transcript.dataset.follow,'FOLLOWING');assert.equal(s.transcript.dataset.browsing,'false');});
