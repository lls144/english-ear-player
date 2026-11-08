import {firefox} from 'playwright';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.'),results=[];
function record(seconds,kind='meter'){
 const child=spawn(path.join(root,'.venv/Scripts/python.exe'),[kind==='meter'?'scripts/audio_meter.py':'scripts/capture_loopback.py',String(seconds)],{cwd:root,windowsHide:true});
 let output='',error='',readyResolve;const ready=new Promise(r=>readyResolve=r);
 child.stdout.on('data',b=>{output+=b.toString();if(output.includes('READY'))readyResolve();});
 child.stderr.on('data',b=>error+=b.toString());
 const done=new Promise((resolve,reject)=>child.on('exit',code=>{if(code)reject(Error(error));else resolve(JSON.parse(output.trim().split(/\r?\n/).at(-1)));}));
 return {ready,done};
}
const prepared=spawnSync(path.join(root,'.venv/Scripts/python.exe'),['scripts/prepare_native_browser.py',firefox.executablePath()],{windowsHide:true,encoding:'utf8'});
assert.equal(prepared.status,0,prepared.stderr);
let server;
try{await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(1500)});}catch{const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5173,strictPort:true}});await server.listen();}
const browser=await firefox.launch({headless:false,executablePath:path.join(root,'.local/browsers/firefox/firefox.exe')});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  window.nativeSpeechLog=[];window.speechActive=new Set();window.maxSpeechActive=0;
  const speak=speechSynthesis.speak.bind(speechSynthesis),cancel=speechSynthesis.cancel.bind(speechSynthesis);
  speechSynthesis.speak=u=>{
   const id=window.nativeSpeechLog.length;
   window.nativeSpeechLog.push({event:'request',id,text:u.text,lang:u.lang,voice:u.voice?.name,voiceLang:u.voice?.lang,rate:u.rate});
   u.addEventListener('start',()=>{speechActive.add(id);maxSpeechActive=Math.max(maxSpeechActive,speechActive.size);nativeSpeechLog.push({event:'start',id});});
   u.addEventListener('boundary',e=>nativeSpeechLog.push({event:'boundary',id,char:e.charIndex}));
   u.addEventListener('end',()=>{speechActive.delete(id);nativeSpeechLog.push({event:'end',id});});
   u.addEventListener('error',e=>{speechActive.delete(id);nativeSpeechLog.push({event:'error',id,error:e.error});});
   speak(u);
  };
  speechSynthesis.cancel=()=>{nativeSpeechLog.push({event:'cancel'});speechActive.clear();cancel();};
 });
 await page.goto('http://127.0.0.1:5173/');
 await page.locator('#more-open').click();await page.locator('[data-mode=speech]').click();
 await page.waitForFunction(()=>speechSynthesis.getVoices().some(v=>/^en-/i.test(v.lang)));

 const options=await page.locator('#voice option').evaluateAll(os=>os.map(o=>({value:o.value,text:o.textContent})));
 const english=options.find(o=>/Zira/.test(o.text));assert.ok(english);assert.equal(options.length,2);
 await page.locator('#voice').selectOption(english.value);results.push('real English voice selectable; Chinese voices excluded');await page.locator('#more-close').click();
 const baseline=record(2);await baseline.ready;const base=await baseline.done;assert.ok(base.peak<.001);results.push('quiet process audio-session baseline measured');
 const speech=record(6),deviceCapture=record(6,'loopback');await Promise.all([speech.ready,deviceCapture.ready]);await page.locator('#play').click();
 await page.waitForFunction(()=>nativeSpeechLog.some(e=>e.event==='boundary'));
 const audible=await speech.done;assert.ok(audible.peak>.02,JSON.stringify(audible));results.push('native English TTS produces nonzero Windows audio-session peaks and real word boundaries');
 const deviceOutput=await deviceCapture.done;
 if(!audible.masterMute && audible.masterVolume>0){assert.ok(deviceOutput.rms>.0001 && deviceOutput.peak>.001);results.push('real English TTS produces non-silent default-device WASAPI loopback PCM');}
 await page.locator('#play').click();const offset=await page.locator('#progress').inputValue();
 await page.waitForTimeout(250);
 const silence=record(2);await silence.ready;const paused=await silence.done;assert.ok(paused.peak<.001);results.push('pause stops measured process audio output');
 await page.locator('#play').click();await page.waitForTimeout(400);
 assert.ok(Number(await page.locator('#progress').inputValue())>=Number(offset));
 await page.locator('#rate').selectOption('0.9');await page.waitForTimeout(250);
 for(let i=0;i<12;i++)await page.locator('#play').click();
 if(await page.locator('#play').getAttribute('aria-label')!=='暂停')await page.locator('#play').click();
 await page.waitForFunction(()=>document.querySelector('#play').getAttribute('aria-label')==='暂停');
 await page.locator('[data-chapter=reasons]').click();await page.waitForTimeout(500);
 let log=await page.evaluate(()=>({events:nativeSpeechLog,maxActive:maxSpeechActive}));
 await fs.writeFile('.local/qa/native-speech-debug.json',JSON.stringify({baseline:base,speech:audible,paused,log},null,2));
 assert.ok(log.events.some(e=>e.event==='request'&&Math.abs(e.rate-.9*.88)<.001));
 assert.ok(log.events.filter(e=>e.event==='request').every(e=>/^en-/i.test(e.voiceLang)&&/^en-/i.test(e.lang)));
 assert.ok(log.events.some(e=>e.event==='request'&&e.text.startsWith('The strain')));
 assert.ok(log.maxActive<=1);results.push('resume rate changes rapid toggles and chapter cancellation keep one native English utterance active');
 if(await page.locator('#play').getAttribute('aria-label')==='暂停')await page.locator('#play').click();
 await page.locator('#more-open').click();await page.locator('[data-mode=audio]').click();await page.locator('#more-close').click();
 const mp3=record(3);await mp3.ready;await page.locator('#play').click();const output=await mp3.done;
 assert.ok(output.peak>.02);results.push('real MP3 produces nonzero Windows audio-session peaks');
 await page.locator('#play').click();assert.deepEqual(errors,[]);results.push('no page errors during native audio and speech checks');
 await fs.writeFile('.local/qa/native-speech.json',JSON.stringify({browser:browser.version(),checks:results,baseline:base,speech:audible,deviceOutput,paused,mp3:output,log},null,2));
 console.log(JSON.stringify({passed:results.length,checks:results,speechPeak:audible.peak,pausedPeak:paused.peak,mp3Peak:output.peak,masterMute:audible.masterMute,masterVolume:audible.masterVolume}));
}finally{await browser.close();await server?.close();}

