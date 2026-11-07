import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const cases=new WeakMap<Page,string>();
const consoleErrors=new WeakMap<Page,string[]>();
const fault=(p:Page,data:object)=>p.request.post('/__e2e_control/'+cases.get(p),{data});
const published=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const ids=published.chapters.map((c:any)=>c.id);
const titles=published.chapters.map((c:any)=>c.title);
const audio=(p:Page)=>p.locator('audio');
const state=(p:Page)=>audio(p).evaluate((a:HTMLAudioElement)=>({time:a.currentTime,duration:a.duration,paused:a.paused,rate:a.playbackRate,loop:a.loop,src:a.currentSrc,ready:a.readyState,error:a.error?.code}));
async function start(p:Page){await p.locator('#play').click();await expect.poll(async()=>(await state(p)).paused).toBe(false);await expect.poll(async()=>(await state(p)).time).toBeGreaterThan(.1);}
async function settings(p:Page){const d=p.locator('details.settings');if(await d.getAttribute('open')===null)await d.locator('summary').click();}
async function rate(p:Page,v:string){await settings(p);await p.locator('#rate').selectOption(v);}
async function loop(p:Page,v:string){await settings(p);await p.locator('#loop').selectOption(v);}
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
 await page.locator('[data-mode=audio]').click();await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);
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
test('all five real files advance time with matching chapter and source',async({page})=>{
 const element=await audio(page).elementHandle();
 for(let i=0;i<ids.length;i++){
  await page.locator('[data-chapter="'+ids[i]+'"]').click();await expect(page.locator('#now-title')).toHaveText(titles[i]);
  await expect.poll(async()=>(await state(page)).src).toMatch(new RegExp('/'+ids[i]+'(?:\\.[a-f0-9]+)?\\.mp3$'));
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
test('0.75 0.9 1 1.25 1.5 speeds affect real media clock and survive chapters',async({page})=>{
 await start(page);
 for(const v of ['0.75','0.9','1','1.25','1.5']){
  await rate(page,v);expect((await state(page)).rate).toBe(Number(v));
  // Native WebKit may rebuffer when changing its media pipeline rate.
  // Measure an advancing media clock, not a fixed delay during that transition.
  const settling=(await state(page)).time;
  await expect.poll(async()=>{const s=await state(page);return !s.paused&&s.ready>=2&&s.time>settling+.03;}).toBe(true);
  const sample=await audio(page).evaluate(async(a:HTMLAudioElement)=>{
   const initial=a.currentTime,clock=performance.now();await new Promise(r=>setTimeout(r,1250));
   return {delta:a.currentTime-initial,seconds:(performance.now()-clock)/1000,paused:a.paused,rate:a.playbackRate};
  });
  await test.info().attach('actual-rate-'+v,{body:JSON.stringify(sample),contentType:'application/json'});
  expect(sample.paused).toBe(false);expect(sample.rate).toBe(Number(v));
  const ratio=sample.delta/sample.seconds;expect(ratio).toBeGreaterThan(Number(v)*.65);expect(ratio).toBeLessThan(Number(v)*1.35);
 }
 await page.locator('#next').click();await expect.poll(async()=>(await state(page)).rate).toBe(1.5);
});
test('single repeat wraps actual time without changing chapter',async({page})=>{
 await loop(page,'one');await start(page);await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.25;});
 await expect.poll(async()=>(await state(page)).time).toBeLessThan(2);
 expect((await state(page)).loop).toBe(true);expect((await state(page)).paused).toBe(false);await expect(page.locator('#chapter-title')).toHaveText(titles[0]);
});
test('all-list follows each real ended event and wraps last to first',async({page})=>{
 await loop(page,'all');await start(page);
 for(let i=1;i<=ids.length;i++){
  await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.12;});
  await expect(page.locator('#chapter-title')).toHaveText(titles[i%ids.length]);
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
 expect((await state(page)).paused).toBe(true);expect((await state(page)).rate).toBe(.9);expect((await state(page)).loop).toBe(true);expect((await state(page)).time).toBeGreaterThan(2.7);
});
test('rapid play pause and chapter changes settle to one correct real player',async({page})=>{
 for(let i=0;i<10;i++)await page.locator('#play').click({delay:0});
 for(const id of ['reasons','theme-trends','conclusion','picture','connectors'])await page.locator('[data-chapter="'+id+'"]').click({delay:0});
 if((await state(page)).paused)await start(page);
 await expect.poll(async()=>(await state(page)).paused).toBe(false);expect(await audio(page).count()).toBe(1);
 expect((await state(page)).src).toMatch(/connectors(?:\.[a-f0-9]+)?\.mp3$/);await expect(page.locator('#now-title')).toHaveText(titles[3]);
});
test('slow source switch ignores superseded request',async({page})=>{
 await fault(page,{delayFile:'theme-trends.mp3',delayMs:1200});
 await start(page);await page.locator('[data-chapter=theme-trends]').click();await page.locator('[data-chapter=reasons]').click();
 await expect.poll(async()=>(await state(page)).src).toMatch(/reasons(?:\.[a-f0-9]+)?\.mp3$/);await page.waitForTimeout(1400);
 await expect(page.locator('#chapter-title')).toHaveText(titles[2]);expect((await state(page)).paused).toBe(false);expect((await state(page)).src).toMatch(/reasons(?:\.[a-f0-9]+)?\.mp3$/);
});
test('missing audio shows failure and retry recovers',async({page})=>{
 await fault(page,{failFile:'reasons.mp3',status:404});await page.locator('[data-chapter=reasons]').click();await page.locator('#play').click();
 await expect(page.locator('#status')).toContainText(/失败|无法/);expect((await state(page)).paused).toBe(true);
 await fault(page,{});await page.locator('#play').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
});
test('offline new chapter failure recovers online without reload',async({page,context})=>{
 await fault(page,{failFile:'conclusion.mp3',status:503});await context.setOffline(true);await page.locator('[data-chapter=conclusion]').click();await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/失败|无法/);
 await context.setOffline(false);await fault(page,{});await page.locator('#play').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
});
test('real local import overrides built-in removal and reload restore it',async({page,browserName})=>{
 await page.locator('#file-input').setInputFiles(path.resolve('public/assets/audio/picture.mp3'));
 if(browserName==='webkit' && process.platform==='win32'){
  await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/失败|无法/);
  expect((await state(page)).paused).toBe(true);
  test.info().annotations.push({type:'limitation',description:'Windows WebKit native media backend rejects valid blob/data MP3 URLs (MEDIA_ERR_SRC_NOT_SUPPORTED). Not an iOS result.'});
 }else{await start(page);expect((await state(page)).src).toMatch(/^blob:/);await page.locator('#play').click();}

 await page.locator('#import-panel > summary').click();
 await page.getByRole('button',{name:'移除首段描图本地音频',exact:true}).click();await expect.poll(async()=>(await state(page)).src).toMatch(/picture(?:\.[a-f0-9]+)?\.mp3$/);
 await page.locator('#file-input').setInputFiles(path.resolve('public/assets/audio/picture.mp3'));await page.reload();await expect.poll(async()=>(await state(page)).src).toMatch(/picture(?:\.[a-f0-9]+)?\.mp3$/);
});
test('wrong extension empty corrupt MP3 fail safely and valid import recovers',async({page,browserName})=>{
 await page.locator('#file-input').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not audio')});await expect(page.locator('#status')).toContainText('mp3');
 await page.locator('#file-input').setInputFiles({name:'empty.mp3',mimeType:'audio/mpeg',buffer:Buffer.alloc(0)});await expect(page.locator('#status')).toContainText('非空');
 await page.locator('#file-input').setInputFiles({name:'corrupt.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('invalid bytes')});await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/失败|无法/);
 if(browserName==='webkit' && process.platform==='win32'){
  await page.locator('#import-panel > summary').click();await page.getByRole('button',{name:'移除首段描图本地音频',exact:true}).click();await start(page);
 }else{await page.locator('#file-input').setInputFiles(path.resolve('public/assets/audio/picture.mp3'));await start(page);}
});
test('long text settings touch scrolling and dock fit viewport',async({page})=>{
 await page.locator('[data-chapter=connectors]').click();await settings(page);
 await page.locator('#text-toggle').click();await expect(page.locator('#transcript')).toBeHidden();await page.locator('#text-toggle').click();await expect(page.locator('#transcript')).toBeVisible();
 await page.locator('footer').scrollIntoViewIfNeeded();
 const w=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));expect(w.doc).toBeLessThanOrEqual(w.client);
 expect((await page.locator('.player-dock').boundingBox())!.height).toBeLessThan(page.viewportSize()!.height*.55);
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
 await page.locator('[data-mode=speech]').click();await page.locator('#play').click();await expect(page.locator('#status')).toContainText(/英语语音|不支持/);
 await expect(page.locator('#play')).toHaveAttribute('aria-label','播放');await page.locator('[data-mode=audio]').click();await start(page);
});
test('corrupt or denied local storage does not break actual playback',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('english-ear-player:v1','{broken'));await page.reload();await page.locator('[data-mode=audio]').click();await start(page);
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('denied','SecurityError');};});await page.reload();await page.locator('[data-mode=audio]').click();await start(page);
});

