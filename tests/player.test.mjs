import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
class AudioStub extends EventTarget {
  attributes={};currentTime=0;duration=12;playbackRate=1;loop=false;paused=true;ended=false;
  setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}
  set src(v){this.attributes.src=v;}get src(){return this.attributes.src??'';}
  get currentSrc(){return this.src;}
  pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
  load(){this.currentTime=0;}
  async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
}
let spoken=[],store=new Map(),actions={};
const synth={getVoices:()=>[{lang:'en-US',voiceURI:'local-english',localService:true}],addEventListener(){},cancel(){},speak(u){spoken.push(u);u.onstart?.();}};
globalThis.Audio=AudioStub;
globalThis.window={speechSynthesis:synth,SpeechSynthesisUtterance:class{},addEventListener(){}};
globalThis.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
globalThis.document={baseURI:'https://example.test/player/',addEventListener(){}};
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaSession:{setActionHandler:(a,h)=>{actions[a]=h;},setPositionState(){},metadata:null}}});
globalThis.MediaMetadata=class{constructor(v){Object.assign(this,v);}};
const library=JSON.parse(await readFile(new URL('../src/library.generated.json',import.meta.url),'utf8'));
library.audio=Object.fromEntries(library.chapters.map(c=>[c.id,'assets/audio/'+c.id+'.mp3']));
let source=await readFile(new URL('../src/player.ts',import.meta.url),'utf8');
source=source.replace("import library from './library.generated.json';",'const library='+JSON.stringify(library)+';')
 .replace("from './logic'","from '"+new URL('../src/logic.ts',import.meta.url).href+"'")
 .replace('import.meta.env.BASE_URL',"'./'");
const {Player,storageKey}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
beforeEach(()=>{spoken=[];store.clear();actions={};synth.getVoices=()=>[{lang:'en-US',voiceURI:'local-english',localService:true}];});

test('a removed English voice is rechecked before speaking instead of using a stale cached voice',async()=>{
 const p=new Player(()=>{});p.setMode('speech');assert.equal(p.voices.length,1);
 synth.getVoices=()=>[{lang:'zh-CN',voiceURI:'chinese',localService:true}];await p.play();
 assert.equal(spoken.length,0);assert.equal(p.playing,false);assert.match(p.status,/未找到英语语音/);
});
test('single audio instance survives end-of-chapter and list wrap',async()=>{
 const p=new Player(()=>{});p.setMode('audio');const audio=p.audio;
 p.select(library.chapters.at(-1).id,false,true);await p.play();audio.dispatchEvent(new Event('ended'));
 assert.equal(p.current.id,'picture');assert.equal(p.audio,audio);assert.equal(p.playing,true);
 assert.match(audio.src,/\/player\/assets\/audio\/picture.mp3$/);assert.equal(p.settings.audioPositions.conclusion,0);
 assert.equal(typeof actions.nexttrack,'function');
});
test('single MP3 repeat uses native loop, and rate persists across chapters',async()=>{
 const p=new Player(()=>{});p.setMode('audio');p.setLoop('one');p.setRate(1.5);await p.play();
 assert.equal(p.audio.loop,true);p.step(1);
 assert.equal(p.audio.playbackRate,1.5);assert.equal(p.audio.loop,true);
});
test('blocked autoplay is surfaced without switching to speech',async()=>{
 const p=new Player(()=>{});p.setMode('audio');p.audio.play=async()=>{throw new DOMException('blocked','NotAllowedError');};await p.play();
 assert.equal(p.settings.mode,'audio');assert.equal(p.playing,false);assert.equal(p.busy,false);assert.match(p.status,/轻点播放/);
});
test('stale speech end callback cannot advance after a manual chapter change',async()=>{
 const p=new Player(()=>{});p.setMode('speech');await p.play();const stale=spoken.at(-1);
 p.select('reasons',false,true);stale.onend();
 assert.equal(p.current.id,'reasons');assert.equal(p.playing,false);assert.equal(p.speechOffset,0);
});
test('speech pause/resume and rate use character boundaries',async()=>{
 const p=new Player(()=>{});p.setMode('speech');await p.play();spoken.at(-1).onboundary({charIndex:10});p.pause();assert.equal(p.speechOffset,10);
 await p.play();assert.equal(spoken.at(-1).text,p.text.slice(10,10+spoken.at(-1).text.length));
 p.setRate(1.25);assert.equal(spoken.at(-1).rate,1.25);
});
test('settings restore safely without autoplay or serializing local file objects',()=>{
 const p=new Player(()=>{});p.setMode('audio');p.setRate(1.5);p.select('reasons',false);p.save();
 const restored=new Player(()=>{});
 assert.equal(restored.current.id,'reasons');assert.equal(restored.settings.rate,1.5);assert.equal(restored.playing,false);
 assert.equal(restored.imported.size,0);assert.ok(store.get(storageKey));
});
test('old audio position is not saved against a new chapter before metadata',()=>{
 const p=new Player(()=>{});p.setMode('audio');p.audio.dispatchEvent(new Event('loadedmetadata'));
 p.audio.currentTime=7;p.pause();assert.equal(p.settings.audioPositions.picture,7);
 p.select('reasons',false,true);p.audio.currentTime=7;p.save();
 assert.equal(p.settings.audioPositions.reasons,0);
 p.audio.dispatchEvent(new Event('loadedmetadata'));assert.equal(p.audio.currentTime,0);
});
test('local file association overrides built-in audio and removal restores it',()=>{
 const p=new Player(()=>{});p.setMode('audio');
 const file=new File(['test fixture bytes'],'my-audio.mp3',{type:'audio/mpeg'});
 p.importFile('picture',file);assert.match(p.audioSource,/^blob:/);assert.match(p.audio.src,/^blob:/);
 p.save();assert.ok(!store.get(storageKey).includes('blob:'));
 p.removeFile('picture');assert.match(p.audioSource,/\/player\/assets\/audio\/picture.mp3$/);
 assert.equal(p.imported.size,0);
 assert.throws(()=>p.importFile('picture',new File([],'empty.mp3')),/非空/);
});
test('first visit chooses available real audio',()=>{
 assert.equal(new Player(()=>{}).settings.mode,'audio');
});
test('only English voices are offered and the utterance uses the selected dialect',async()=>{
 synth.getVoices=()=>[{lang:'zh-CN',voiceURI:'chinese',localService:true},{lang:'en-GB',voiceURI:'british',localService:true}];
 const p=new Player(()=>{});assert.equal(p.voices.length,1);p.setMode('speech');p.setVoice('british');await p.play();
 assert.equal(spoken.at(-1).voice.voiceURI,'british');assert.equal(spoken.at(-1).lang,'en-GB');
});
test('no English voice never uses a Chinese fallback',async()=>{
 synth.getVoices=()=>[{lang:'zh-CN',voiceURI:'chinese',localService:true}];
 const p=new Player(()=>{});p.setMode('speech');await p.play();assert.equal(spoken.length,0);assert.equal(p.playing,false);assert.match(p.status,/英语语音/);
});
test('stale pause event from an old source cannot mark new playback paused',async()=>{
 const p=new Player(()=>{});await p.play();p.audio.dispatchEvent(new Event('pause'));
 assert.equal(p.playing,true);
});
test('unexpected WebKit pause at a proven native loop boundary resumes once',async()=>{
 const p=new Player(()=>{});p.setLoop('one');await p.play();p.audio.currentTime=11.9;p.audio.dispatchEvent(new Event('seeking'));
 p.audio.currentTime=0;p.audio.paused=true;p.audio.dispatchEvent(new Event('pause'));
 assert.equal(p.audio.paused,false);assert.equal(p.playing,true);assert.equal(p.current.id,'picture');
});
test('explicit user pause near a loop boundary stays paused',async()=>{
 const p=new Player(()=>{});p.setLoop('one');await p.play();p.audio.currentTime=11.9;p.audio.dispatchEvent(new Event('seeking'));p.pause();
 p.audio.currentTime=0;p.audio.dispatchEvent(new Event('pause'));assert.equal(p.audio.paused,true);assert.equal(p.playing,false);
});
test('a decode error pauses the actual element and stops the player',async()=>{
 const p=new Player(()=>{});await p.play();p.audio.error={code:4};p.audio.dispatchEvent(new Event('error'));
 assert.equal(p.audio.paused,true);assert.equal(p.playing,false);assert.match(p.status,/无法/);
});
test('late rejection from superseded play cannot stop the new chapter',async()=>{
 const p=new Player(()=>{});let reject;
 p.audio.play=()=>new Promise((_,r)=>reject=r);
 const old=p.play();p.pause();p.audio.play=AudioStub.prototype.play;p.select('reasons',false,true);await p.play();
 reject(new DOMException('old source','AbortError'));await old;
 assert.equal(p.current.id,'reasons');assert.equal(p.playing,true);
});
test('stalled media cannot remain falsely playing indefinitely',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const p=new Player(()=>{});p.audio.readyState=0;await p.play();t.mock.timers.tick(5000);
 assert.equal(p.audio.paused,true);assert.equal(p.playing,false);assert.equal(p.busy,false);assert.match(p.status,/无响应/);
});

