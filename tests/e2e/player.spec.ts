import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {decodeEveryMP3} from '../media-decoding';
const cases=new WeakMap<Page,string>();
const consoleErrors=new WeakMap<Page,string[]>();
const fault=(p:Page,data:object)=>p.request.post('/__e2e_control/'+cases.get(p),{data});
const published=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const ids=published.chapters.map((c:any)=>c.id);
const titles=published.chapters.map((c:any)=>c.title);
const audio=(p:Page)=>p.locator('audio');
const state=(p:Page)=>audio(p).evaluate((a:HTMLAudioElement)=>({time:a.currentTime,duration:a.duration,paused:a.paused,rate:a.playbackRate,loop:a.loop,src:a.currentSrc,ready:a.readyState,error:a.error?.code}));
async function start(p:Page){await p.locator('#play').click();await expect.poll(async()=>(await state(p)).paused).toBe(false);await expect.poll(async()=>(await state(p)).time).toBeGreaterThan(.1);}
async function settings(p:Page){if(!await p.locator('#more-settings').isVisible())await p.locator('#more-open').click();}
async function close(p:Page){if(await p.locator('#more-settings').isVisible())await p.locator('#more-close').click();}
async function mode(p:Page,v:string){await settings(p);await p.locator('[data-mode='+v+']').click();await close(p);}
async function imports(p:Page){await settings(p);if(await p.locator('#imports').getAttribute('open')===null)await p.locator('#imports > summary').click();}
async function rate(p:Page,v:string){await p.locator('#rate').selectOption(v);}
async function loop(p:Page,v:string){await settings(p);await p.locator('#loop').selectOption(v);await close(p);}
test.beforeEach(async({page})=>{
 const logs:string[]=[];consoleErrors.set(page,logs);page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});
 await page.addInitScript(()=>{
  (window as any).__errors=[];(window as any).__actions={};
  window.addEventListener('unhandledrejection',e=>(window as any).__errors.push(String(e.reason)));
  window.addEventListener('error',e=>(window as any).__errors.push(e.message));
  if('mediaSession' in navigator){
   const native=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
   navigator.mediaSession.setActionHandler=(action,handler)=>{native(action,handler);(window as any).__actions[action]=handler;};
  }
 });
 const id=randomUUID();cases.set(page,id);await page.goto('sessions/'+id+'/');await expect(page.locator('#chapter-title')).toHaveText(titles[0]);
 await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);
});
test.afterEach(async({page},info)=>{
 const unhandled=await page.evaluate(()=>(window as any).__errors);
 const logs=consoleErrors.get(page)??[];
 await info.attach('browser-errors',{body:JSON.stringify({console:logs,unhandled}),contentType:'application/json'});
 expect(unhandled).toEqual([]);
 const faultCase=/missing audio|offline new|wrong extension/.test(info.title);
 const unexpected=logs.filter(s=>!s.startsWith('[vite]') && !(faultCase && /Failed to load resource|NetworkError|Load failed|network connection/i.test(s)));
 expect(unexpected).toEqual([]);
});
test('all published chapter files advance time with matching chapter and source',async({page},info)=>{
 test.setTimeout(180000);
 if(info.project.name==='edge-desktop')await decodeEveryMP3(page,published.files,info);
 const element=await audio(page).elementHandle();
 for(let i=0;i<ids.length;i++){
  await page.locator('[data-chapter="'+ids[i]+'"]').click();await expect(page.locator('#now-title')).toHaveText(titles[i]);
  await expect.poll(async()=>(await state(page)).src).toMatch(new RegExp('/'+ids[i]+'-slow(?:\\.[a-f0-9]+)?\\.mp3$'));
  if((await state(page)).paused)await start(page);else await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
  expect((await state(page)).duration).toBeGreaterThan(2);expect(await element!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);
 }
});
test('pause freezes real position and resume previous next agree',async({page})=>{
 await start(page);await page.locator('#play').click();const at=(await state(page)).time;
 await page.waitForTimeout(350);expect(Math.abs((await state(page)).time-at)).toBeLessThan(.15);
 await start(page);expect((await state(page)).time).toBeGreaterThan(at);
 await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText(titles[1]);
 await page.locator('#previous').click();await expect(page.locator('#chapter-title')).toHaveText(titles[0]);
 await expect.poll(async()=>(await state(page)).paused).toBe(false);
});
test('nine slow speeds affect real media clock and survive chapters',async({page})=>{
 await start(page);
 for(const v of ['0.55','0.6','0.65','0.7','0.75','0.8','0.85','0.9','1']){
  await rate(page,v);expect((await state(page)).rate).toBeCloseTo(Number(v)/published.referenceRate,5);
  // Native WebKit may rebuffer when changing its media pipeline rate.
  // Measure an advancing media clock, not a fixed delay during that transition.
  const settling=(await state(page)).time;
  await expect.poll(async()=>{const s=await state(page);return !s.paused&&s.ready>=2&&s.time>settling+.03;}).toBe(true);
  const sample=await audio(page).evaluate(async(a:HTMLAudioElement)=>{
   const initial=a.currentTime,clock=performance.now();await new Promise(r=>setTimeout(r,1250));
   return {delta:a.currentTime-initial,seconds:(performance.now()-clock)/1000,paused:a.paused,rate:a.playbackRate};
  });
  await test.info().attach('actual-rate-'+v,{body:JSON.stringify(sample),contentType:'application/json'});
  expect(sample.paused).toBe(false);expect(sample.rate).toBeCloseTo(Number(v)/published.referenceRate,5);
  const ratio=sample.delta/sample.seconds;expect(ratio).toBeGreaterThan(Number(v)/published.referenceRate*.65);expect(ratio).toBeLessThan(Number(v)/published.referenceRate*1.35);
 }
 await page.locator('#next').click();await expect.poll(async()=>(await state(page)).rate).toBeCloseTo(1/published.referenceRate,5);
});
test('single repeat wraps actual time without changing chapter',async({page})=>{
 await loop(page,'one');await start(page);await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.25;});
 await expect.poll(async()=>(await state(page)).time).toBeLessThan(2);
 expect((await state(page)).loop).toBe(true);expect((await state(page)).paused).toBe(false);await expect(page.locator('#chapter-title')).toHaveText(titles[0]);
});
test('all-list follows each real ended event and wraps last to first',async({page})=>{
 await loop(page,'all');await start(page);
 const main=published.chapters.filter((c:any)=>c.inMainLoop);
 for(let i=1;i<=main.length;i++){
  await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.12;});
  await expect(page.locator('#chapter-title')).toHaveText(main[i%main.length].title);
  await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);expect((await state(page)).paused).toBe(false);
 }
});
test('progress seeks actual media and keeps updating after touch or focus',async({page,isMobile})=>{
 await start(page);const slider=page.locator('#progress');const box=(await slider.boundingBox())!;
 if(isMobile)await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5);else await slider.click({position:{x:box.width*.5,y:box.height*.5}});
 await expect.poll(async()=>(await state(page)).time/(await state(page)).duration).toBeGreaterThan(.35);
 const before=Number(await slider.inputValue());await page.waitForTimeout(800);expect(Number(await slider.inputValue())).toBeGreaterThan(before);
});
test('reload restores mode speed loop position without autoplay',async({page})=>{
 await page.locator('[data-chapter=reasons]').click();await rate(page,'0.9');await loop(page,'one');
 await start(page);await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=3;});await page.locator('#play').click();
 await page.reload();await expect(page.locator('#chapter-title')).toHaveText(titles[2]);await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);
 expect((await state(page)).paused).toBe(true);expect((await state(page)).rate).toBeCloseTo(.9/published.referenceRate,5);expect((await state(page)).loop).toBe(true);expect((await state(page)).time).toBeGreaterThan(2.7);
});
test('rapid play pause and chapter changes settle to one correct real player',async({page})=>{
 for(let i=0;i<10;i++)await page.locator('#play').click({delay:0});
 for(const id of ['reasons','theme-trends','conclusion','picture','connectors'])await page.locator('[data-chapter="'+id+'"]').click({delay:0});
 if((await state(page)).paused)await start(page);
 await expect.poll(async()=>(await state(page)).paused).toBe(false);expect(await audio(page).count()).toBe(1);
 expect((await state(page)).src).toMatch(/connectors-slow(?:\.[a-f0-9]+)?\.mp3$/);await expect(page.locator('#now-title')).toHaveText(titles[3]);
});
test('slow source switch ignores superseded request',async({page})=>{
 await fault(page,{delayFile:'theme-trends-slow.mp3',delayMs:1200});
 await start(page);await page.locator('[data-chapter=theme-trends]').click();await page.locator('[data-chapter=reasons]').click();
 await expect.poll(async()=>(await state(page)).src).toMatch(/reasons-slow(?:\.[a-f0-9]+)?\.mp3$/);await page.waitForTimeout(1400);
 await expect(page.locator('#chapter-title')).toHaveText(titles[2]);expect((await state(page)).paused).toBe(false);expect((await state(page)).src).toMatch(/reasons-slow(?:\.[a-f0-9]+)?\.mp3$/);
});
test('missing audio shows failure and retry recovers',async({page})=>{
 await fault(page,{failFile:'reasons-slow.mp3',status:404});await page.locator('[data-chapter=reasons]').click();await page.locator('#play').click();
 await expect(page.locator('#status')).toContainText(/失败|无法/);expect((await state(page)).paused).toBe(true);
 await fault(page,{});await page.locator('#play').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
});
test('offline new chapter failure recovers online without reload',async({page,context})=>{
 await fault(page,{failFile:'conclusion-slow.mp3',status:503});await context.setOffline(true);await page.locator('[data-chapter=conclusion]').click();await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/失败|无法/);
 await context.setOffline(false);await fault(page,{});await page.locator('#play').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
});
test('real local import overrides built-in removal and reload restore it',async({page,browserName})=>{
 await page.locator('#file-input').setInputFiles(path.resolve('public/assets/audio/picture.mp3'));
 if(browserName==='webkit' && process.platform==='win32'){
  await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/失败|无法/);
  expect((await state(page)).paused).toBe(true);
  test.info().annotations.push({type:'limitation',description:'Windows WebKit native media backend rejects valid blob/data MP3 URLs (MEDIA_ERR_SRC_NOT_SUPPORTED). Not an iOS result.'});
 }else{await start(page);expect((await state(page)).src).toMatch(/^blob:/);await page.locator('#play').click();}

 await imports(page);
 await page.getByRole('button',{name:'移除首段描图本地音频',exact:true}).click();await close(page);await expect.poll(async()=>(await state(page)).src).toMatch(/picture-slow(?:\.[a-f0-9]+)?\.mp3$/);
 await page.locator('#file-input').setInputFiles(path.resolve('public/assets/audio/picture.mp3'));await page.reload();await expect.poll(async()=>(await state(page)).src).toMatch(/picture-slow(?:\.[a-f0-9]+)?\.mp3$/);
});
test('wrong extension empty corrupt MP3 fail safely and valid import recovers',async({page,browserName})=>{
 await page.locator('#file-input').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not audio')});await expect(page.locator('#status')).toContainText('mp3');
 await page.locator('#file-input').setInputFiles({name:'empty.mp3',mimeType:'audio/mpeg',buffer:Buffer.alloc(0)});await expect(page.locator('#status')).toContainText('非空');
 await page.locator('#file-input').setInputFiles({name:'corrupt.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('invalid bytes')});await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/失败|无法/);
 if(browserName==='webkit' && process.platform==='win32'){
  await imports(page);await page.getByRole('button',{name:'移除首段描图本地音频',exact:true}).click();await close(page);await start(page);
 }else{await page.locator('#file-input').setInputFiles(path.resolve('public/assets/audio/picture.mp3'));await start(page);}
});
test('long text settings touch scrolling and dock fit viewport',async({page,browserName})=>{
 await page.locator('[data-chapter=connectors]').click();
 await expect(page.locator('#more-settings')).not.toBeVisible();
 await expect(page.locator('#source-info')).not.toHaveAttribute('open');
 await page.locator('#transcript .passage').last().scrollIntoViewIfNeeded();
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const w=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));expect(w.doc).toBeLessThanOrEqual(w.client);
 const dock=(await page.locator('.player-dock').boundingBox())!,last=(await page.locator('#transcript .passage').last().boundingBox())!;
 expect(dock.height).toBeLessThanOrEqual(110);expect(last.y+last.height).toBeLessThan(dock.y);
 if(browserName==='chromium'){
  const original=page.viewportSize()!,cdp=await page.context().newCDPSession(page);
  await page.setViewportSize({width:844,height:390});
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:44,right:44,bottom:21}});
  await expect.poll(()=>page.locator('.player-dock').evaluate(e=>e.getBoundingClientRect().height)).toBe(118);
  expect(await page.locator('body').evaluate(e=>getComputedStyle(e).paddingLeft)).toBe('44px');
  const controls=await page.locator('.dock-inner').boundingBox();expect(controls!.x).toBeGreaterThanOrEqual(44);expect(controls!.x+controls!.width).toBeLessThanOrEqual(800);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{}});await page.setViewportSize(original);await cdp.detach();
 }
 await settings(page);await expect(page.locator('#voice')).toBeVisible();await close(page);
 await page.locator('#next').click();await expect(page.locator('#now-title')).toHaveText(titles[4]);
});
test('native Media Session handlers control actual audio and metadata',async({page})=>{
 if(!await page.evaluate(()=>'mediaSession' in navigator)){test.info().annotations.push({type:'limitation',description:'No native Media Session API'});return;}
 await start(page);expect(await page.evaluate(()=>navigator.mediaSession.metadata?.title)).toBe(titles[0]);
 const registered=await page.evaluate(()=>Object.keys((window as any).__actions));expect(registered).toContain('pause');
 await page.evaluate(()=>(window as any).__actions.pause({action:'pause'}));expect((await state(page)).paused).toBe(true);
 await page.evaluate(()=>(window as any).__actions.play({action:'play'}));await expect.poll(async()=>(await state(page)).paused).toBe(false);
 for(const action of ['nexttrack','previoustrack'])if(registered.includes(action)){
  await page.evaluate(a=>(window as any).__actions[a]({action:a}),action);await expect(page.locator('#now-title')).toHaveText(action==='nexttrack'?titles[1]:titles[0]);
 }
 if(registered.includes('seekto')){await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);await page.evaluate(()=>(window as any).__actions.seekto({action:'seekto',seekTime:4}));expect((await state(page)).time).toBeGreaterThan(3.7);}
 if(registered.includes('seekforward')){await page.evaluate(()=>(window as any).__actions.seekforward({action:'seekforward',seekOffset:2}));expect((await state(page)).time).toBeGreaterThan(5.7);}
 if(registered.includes('seekbackward')){await page.evaluate(()=>(window as any).__actions.seekbackward({action:'seekbackward',seekOffset:2}));expect((await state(page)).time).toBeLessThan(5);}
 if(registered.includes('stop')){await page.evaluate(()=>(window as any).__actions.stop({action:'stop'}));expect((await state(page)).paused).toBe(true);expect((await state(page)).time).toBeLessThan(.1);}
});
test('background and foreground tab transition preserves playback across boundary',async({page,context})=>{
 await start(page);await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.4;});
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await expect(page.locator('#now-title')).toHaveText(titles[1]);
 test.info().annotations.push({type:'background-scope',description:'Other-tab visibilityState='+await page.evaluate(()=>document.visibilityState)+'; this is not OS lock/suspension'});
 await page.bringToFront();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);expect((await state(page)).paused).toBe(false);await other.close();
});
test('no English voice gives honest feedback with working MP3',async({page})=>{
 await page.addInitScript(()=>{if('speechSynthesis' in window)Object.defineProperty(Object.getPrototypeOf(window.speechSynthesis),'getVoices',{configurable:true,value:()=>[]});});await page.reload();
 expect(await page.evaluate(()=>!('speechSynthesis' in window)||window.speechSynthesis.getVoices().length===0)).toBe(true);
 await mode(page,'speech');await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/英语语音|不支持/);
 await expect(page.locator('#play')).toHaveAttribute('aria-label','播放');await mode(page,'audio');await start(page);
});
test('corrupt or denied local storage does not break actual playback',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('english-ear-player:v1.2','{broken'));await page.reload();await start(page);
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('denied','SecurityError');};});await page.reload();await start(page);
});


test('three native listening presets play every chapter and real cues highlight text',async({page})=>{
 test.setTimeout(120000);
 for(const preset of ['continuous','slow','recite']){
  await page.locator('#preset').selectOption(preset);
  for(const c of published.chapters){
   await page.locator('[data-chapter="'+c.id+'"]').click();if((await state(page)).paused)await start(page);
   await expect.poll(async()=>(await state(page)).src).toContain(published.audioModes[preset][c.id]);
   const cue=published.timings[preset][c.id][Math.min(1,c.segments.length-1)];
   await audio(page).evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.15);
   await expect(page.locator('.passage.speaking')).toHaveAttribute('data-segment',cue.segmentId);
   await expect.poll(async()=>(await state(page)).paused).toBe(false);
  }
 }
 await page.locator('#play').click();await page.reload();await expect(page.locator('#preset')).toHaveValue('recite');
});


test('phrase collection is separate from paragraph templates and has playable independent units',async({page})=>{
 const phrases=published.chapters.find((c:any)=>c.id==='phrases');expect(phrases).toBeTruthy();expect(phrases.inMainLoop).toBe(false);
 await page.locator('[data-chapter=phrases]').click();await expect(page.locator('#transcript h2').first()).toContainText('人物描写');
 expect(await page.locator('#transcript .passage p').allTextContents()).toEqual(phrases.segments.map((s:any)=>s.text));
 await start(page);await expect.poll(async()=>(await state(page)).src).toContain(published.audio.phrases);
 await loop(page,'sentence');const u=phrases.segments.at(-1).sentences[0];await page.locator('[data-sentence="'+u.id+'"]').click();
 await expect.poll(async()=>(await state(page)).src).toContain(published.sentenceAudio.slow[u.id]);await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
 await page.locator('#play').click();await page.reload();await expect(page.locator('#chapter-title')).toHaveText(phrases.title);await expect(page.locator('[data-sentence="'+u.id+'"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-chapter=letter-body]').click();await expect(page.locator('#transcript')).toContainText('Great Wall');await expect(page.locator('#transcript')).not.toContainText('seek assistance from professionals');
});


test('every displayed paragraph preserves the source punctuation between sentence units',async({page})=>{
 for(const c of published.chapters){await page.locator('[data-chapter="'+c.id+'"]').click();expect(await page.locator('#transcript .passage p').allTextContents()).toEqual(c.segments.map((s:any)=>s.displayText));}
});
