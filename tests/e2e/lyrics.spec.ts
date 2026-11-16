import {selectSetting} from '../ui';
import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const lib=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const state=(p:Page)=>p.locator('audio').evaluate((a:HTMLAudioElement)=>({time:a.currentTime,duration:a.duration,paused:a.paused,src:a.currentSrc,loop:a.loop}));
async function play(p:Page){await p.locator('audio').evaluate(a=>{(window as any).__lyricPlaying=false;a.addEventListener('playing',()=>{(window as any).__lyricPlaying=true;},{once:true});});await p.locator('#play').click();await expect.poll(async()=>(await state(p)).time).toBeGreaterThan(.12);await p.waitForFunction(()=>(window as any).__lyricPlaying);await p.waitForTimeout(450);}
async function setLoop(p:Page,value:string){await p.locator('#more-open').click();await p.locator('#loop').selectOption(value);await p.locator('#more-close').click();}
const problems=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const errors:string[]=[];problems.set(page,errors);page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await expect(page.locator('.sentence')).not.toHaveCount(0);});
test.afterEach(async({page},info)=>{expect(problems.get(page)).toEqual([]);if(info.status!==info.expectedStatus)await info.attach('lyrics-debug',{body:JSON.stringify(await page.evaluate(()=>({scrollY,innerHeight,follow:document.querySelector('#transcript')?.getAttribute('data-follow'),current:document.querySelector('.current-sentence')?.getBoundingClientRect().toJSON()}))),contentType:'application/json'});});

test('real sentence boundary follows a measured easing trajectory into the readable viewport',async({page,browserName})=>{
 const cue=lib.timings.slow.picture[2];await play(page);await page.waitForTimeout(850);
 const frames=await page.evaluate(async(cue:{sentenceId:string;start:number})=>{
  const a=document.querySelector('audio')!,row=document.querySelector<HTMLElement>('[data-sentence="'+cue.sentenceId+'"]')!;
  const points:{time:number;y:number;scroll:number;current:boolean;header:number;dock:number;offsets:number[]}[]=[];const begin=performance.now();a.currentTime=cue.start-.08;
  await new Promise<void>(resolve=>{const sample=()=>{points.push({time:performance.now()-begin,y:row.getBoundingClientRect().top,scroll:scrollY,current:row.classList.contains('current-sentence'),header:document.querySelector('.app-header')!.getBoundingClientRect().top,dock:document.querySelector('.player-dock')!.getBoundingClientRect().bottom,offsets:[...document.querySelectorAll<HTMLElement>('.sentence.lyric-visible')].map(e=>Number.parseFloat(e.style.getPropertyValue('--flow-offset'))||0)});if(performance.now()-begin<1100)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});return points;
 },cue);
 await test.info().attach('focus-trajectory',{body:JSON.stringify(frames),contentType:'application/json'});if(browserName==='chromium')expect(frames.some(f=>new Set(f.offsets.map(n=>Math.round(n))).size>=3)).toBe(true);const scales=await page.evaluate(()=>{const scale=(e:Element)=>{const t=getComputedStyle(e).transform;return t==='none'?1:new DOMMatrixReadOnly(t).a;};return{current:scale(document.querySelector('.current-sentence .lyric-body')!),other:scale(document.querySelector('.next-sentence .lyric-body')!)};});expect(scales.current).toBeGreaterThan(scales.other*1.02);
 expect(frames.some(f=>f.current)).toBe(true);const positions=new Set(frames.map(f=>Math.round(f.scroll))).size;expect(positions).toBeGreaterThanOrEqual(4);if(frames.length<20)test.info().annotations.push({type:'frame-sampling',description:'Concurrent Windows WebKit throttles animation-frame sampling; trajectory is still multi-step. A separate single-browser DPR3 performance capture compares designed, quiet and unstyled rendering.'});
 const end=frames.at(-1)!;const bounds=await page.evaluate(()=>({top:matchMedia('(max-width:760px), (max-height:500px) and (orientation:landscape)').matches?document.querySelector('#chapters')!.getBoundingClientRect().bottom+18:80,bottom:document.querySelector('.player-dock')!.getBoundingClientRect().top-22}));
 expect(end.y).toBeGreaterThanOrEqual(bounds.top-8);expect(end.y).toBeLessThan(bounds.bottom-30);
 expect(Math.max(...frames.map(f=>f.header))-Math.min(...frames.map(f=>f.header))).toBeLessThan(3);expect(Math.max(...frames.map(f=>f.dock))-Math.min(...frames.map(f=>f.dock))).toBeLessThan(3);
 const scrolls=frames.map(f=>f.scroll);expect(Math.max(...scrolls)-Math.min(...scrolls)).toBeGreaterThan(20);
 const travel=Math.max(...scrolls)-Math.min(...scrolls);for(let i=1;i<scrolls.length;i++){expect(scrolls[i]-scrolls[i-1]).toBeGreaterThanOrEqual(-9);expect(scrolls[i]-scrolls[i-1]).toBeLessThan(travel*.85);}
});

test('manual touch and momentum defer follow then resume the pending real cue without a return button',async({page})=>{
 await play(page);await expect(page.locator('#follow-current')).toHaveCount(0);
 const transcript=page.locator('#transcript');await transcript.dispatchEvent('pointerdown',{pointerId:9,clientX:70,clientY:300});await transcript.dispatchEvent('pointermove',{pointerId:9,clientX:70,clientY:190});await page.evaluate(()=>window.scrollBy(0,620));
 await expect(transcript).toHaveAttribute('data-follow','USER_INTERACTING');const before=await page.evaluate(()=>scrollY),cue=lib.timings.slow.picture[2];
 await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.1);await page.waitForTimeout(350);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(4);expect((await state(page)).paused).toBe(false);
 await expect.poll(()=>page.locator('.sentence').first().evaluate(e=>getComputedStyle(e).filter)).toBe('none');
 await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toHaveClass(/current-sentence/);await expect(transcript).toHaveAttribute('data-follow','USER_INTERACTING');
 // This is the synthetic state-integration case; native post-lift displacement
 // is tested separately below. Feed its continuous scroll events in one task:
 // software WebKit can block rAF for longer than the real 180ms quiet window.
 const momentum=await page.evaluate(()=>{
  const root=document.querySelector<HTMLElement>('#transcript')!;root.dispatchEvent(new PointerEvent('pointerup',{pointerId:9,bubbles:true}));
  const points:{time:number;y:number;state:string|undefined}[]=[];
  for(const step of [50,25,10]){window.scrollBy(0,step);window.dispatchEvent(new Event('scroll'));points.push({time:performance.now(),y:scrollY,state:root.dataset.follow});}return points;
 });
 await test.info().attach('browser-clock-momentum',{body:JSON.stringify(momentum),contentType:'application/json'});
 expect(momentum.map(p=>p.state)).toEqual(['MOMENTUM_SCROLLING','MOMENTUM_SCROLLING','MOMENTUM_SCROLLING']);for(let i=1;i<momentum.length;i++)expect(momentum[i].y).toBeGreaterThan(momentum[i-1].y);
 await expect(transcript).toHaveAttribute('data-follow','FOLLOWING');const row=page.locator('[data-sentence="'+cue.sentenceId+'"]');await expect(row).toHaveClass(/current-sentence/);expect((await row.boundingBox())!.y).toBeGreaterThan(60);
});

test('scrubbing previews without seeking or pausing and commits one accurate seek on release',async({page,browserName})=>{
 await play(page);await page.locator('audio').evaluate((a:HTMLAudioElement)=>{(window as any).__seeks=0;(window as any).__pauses=0;a.addEventListener('seeking',()=>{(window as any).__seeks++});a.addEventListener('pause',()=>{(window as any).__pauses++});});
 const slider=page.locator('#progress'),box=(await slider.boundingBox())!,source=(await state(page)).src;
 await page.mouse.move(box.x+box.width*.12,box.y+box.height*.65);const rest=await page.locator('.seek-track').evaluate(e=>e.getBoundingClientRect().height);await page.evaluate(()=>{(window as any).__rail=[];const began=performance.now();const sample=()=>{(window as any).__rail.push(document.querySelector('.seek-track')!.getBoundingClientRect().height);if(performance.now()-began<500)requestAnimationFrame(sample);};requestAnimationFrame(sample);});await page.mouse.down();
 for(const ratio of [.3,.65,.43]){await page.mouse.move(box.x+box.width*ratio,box.y+box.height*.65,{steps:4});await page.waitForTimeout(80);}
 const draft=Number(await slider.inputValue())/1000;const thick=await page.locator('.seek-track').evaluate(e=>e.getBoundingClientRect().height);expect(thick).toBeGreaterThan(rest*1.8);expect(await page.locator('.seek-fill').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');const rail=await page.evaluate(()=>(window as any).__rail as number[]);await test.info().attach('progress-thickness-frames',{body:JSON.stringify(rail),contentType:'application/json'});if(browserName==='chromium')expect(rail.some(h=>h>rest+.15&&h<rest*2-.15)).toBe(true);const readTime=(v:string)=>v.replace(/[−-]/g,'').split(':').reduce((n,s)=>n*60+Number(s),0);expect(Math.abs(readTime((await page.locator('#elapsed').textContent())!)-draft*(await state(page)).duration)).toBeLessThan(1.1);expect(Math.abs(readTime((await page.locator('#remaining').textContent())!)-(1-draft)*(await state(page)).duration)).toBeLessThan(1.1);await expect(page.locator('#now-title')).toHaveCount(0);expect(draft).toBeGreaterThan(.38);expect(draft).toBeLessThan(.49);expect(await page.evaluate(()=>(window as any).__seeks)).toBe(0);expect((await state(page)).time/(await state(page)).duration).toBeLessThan(.1);
 await page.mouse.up();await expect.poll(async()=>(await state(page)).time/(await state(page)).duration).toBeGreaterThan(.38);
 await expect.poll(()=>page.evaluate(()=>(window as any).__seeks)).toBe(1);expect(await page.evaluate(()=>(window as any).__pauses)).toBe(0);expect((await state(page)).src).toBe(source);await page.waitForTimeout(240);expect(await page.locator('.seek-track').evaluate(e=>e.getBoundingClientRect().height)).toBeCloseTo(rest,1);
 await page.evaluate(()=>(window as any).__seeks=0);await page.mouse.move(box.x+box.width*.2,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.6,{steps:4});await slider.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await page.waitForTimeout(220);expect(await page.evaluate(()=>(window as any).__seeks)).toBe(0);expect((await state(page)).time/(await state(page)).duration).toBeLessThan(.55);
});

test('single-loop silence keeps focus and two actual wraps cause no repeated scrolling',async({page})=>{
 // Keep the standard 35s case budget: browser/page setup is included. A CI
 // WebKit cold page took 14s, leaving only 4s under the former 25s override.
 // The actual two-wrap observation still has its own strict 18s deadline.
 await page.locator('[data-chapter=connectors]').click();await expect(page.locator('#transcript')).toHaveAttribute('data-lyric-chapter','connectors');await setLoop(page,'sentence');await play(page);
 // Measure native wraps after the initial focus has settled, not its entry tail.
 await expect(page.locator('#transcript')).toHaveAttribute('data-follow','FOLLOWING');
 const result=await page.locator('audio').evaluate(async(a:HTMLAudioElement)=>{let wraps=0,previous=a.currentTime,min=scrollY,max=scrollY;const start=performance.now();return await new Promise<{wraps:number;delta:number;current:string|null}>((resolve,reject)=>{const timer=setInterval(()=>{min=Math.min(min,scrollY);max=Math.max(max,scrollY);if(a.currentTime<previous-.3)wraps++;previous=a.currentTime;if(wraps===2){clearInterval(timer);resolve({wraps,delta:max-min,current:document.querySelector('.current-sentence')?.getAttribute('data-sentence')??null});}if(performance.now()-start>18000){clearInterval(timer);reject(Error('Two real wraps did not finish'));}},20);});});
 expect(result.wraps).toBe(2);expect(result.delta).toBeLessThan(3);expect(result.current).toBe(lib.chapters.find((c:any)=>c.id==='connectors').segments[0].sentences[0].id);
});

test('reduced motion removes drifting background and timed focus travel',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await play(page);expect(await page.locator('.ambient-field').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');expect(await page.locator('.sentence').first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
 const cue=lib.timings.slow.picture[2];await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.2);await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toHaveClass(/current-sentence/);await page.waitForTimeout(80);const before=await page.evaluate(()=>scrollY);await page.waitForTimeout(200);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(2);
});

test('scroll gestures cannot select text and rapid chapter fades finish on the latest chapter',async({page,browserName,isMobile})=>{
 const first=page.locator('.sentence').first(),r=(await first.boundingBox())!;
 if(browserName==='chromium'){
  const cdp=await page.context().newCDPSession(page),y=isMobile?page.viewportSize()!.height*.70:r.y+40;
  if(isMobile){
   await page.evaluate(()=>{const w=window as any;w.__nativeFrames=[];w.__nativeLift=0;window.addEventListener('touchend',()=>{w.__nativeLift=performance.now();},{once:true,passive:true});w.__nativeTimer=setInterval(()=>w.__nativeFrames.push({ms:performance.now(),y:scrollY,state:document.querySelector('#transcript')!.getAttribute('data-follow')}),16);});
   // Feed native touch events in order with the actual gesture's timestamps.
   // Do not wait for each CDP acknowledgement: that changes release velocity.
   const stamp=await page.evaluate(()=>Date.now()/1000),pending=[cdp.send('Input.dispatchTouchEvent',{type:'touchStart',timestamp:stamp,touchPoints:[{x:r.x+25,y}]})];
   for(let i=1;i<=12;i++){await new Promise(resolve=>setTimeout(resolve,16));pending.push(cdp.send('Input.dispatchTouchEvent',{type:'touchMove',timestamp:stamp+i*.016,touchPoints:[{x:r.x+25,y:y-i*12}]}));}
   pending.push(cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',timestamp:stamp+13*.016,touchPoints:[]}));await Promise.all(pending);
   await page.waitForTimeout(650);const sample=await page.evaluate(()=>{const w=window as any;clearInterval(w.__nativeTimer);return {lift:w.__nativeLift,frames:w.__nativeFrames as {ms:number;y:number;state:string}[]};});
   const after=sample.frames.filter(f=>f.ms>=sample.lift);await test.info().attach('native-touch-momentum',{body:JSON.stringify(sample),contentType:'application/json'});expect(sample.lift).toBeGreaterThan(0);expect(after.some(f=>f.state==='MOMENTUM_SCROLLING')).toBe(true);expect(Math.max(...after.map(f=>f.y))-after[0].y).toBeGreaterThan(2);
  }else{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+25,y}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+25,y:y-i*12}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await cdp.detach();
 }else{await first.dispatchEvent('pointerdown',{pointerId:7,clientX:r.x+25,clientY:r.y+40});await first.dispatchEvent('pointermove',{pointerId:7,clientX:r.x+25,clientY:r.y-60});await first.dispatchEvent('pointerup',{pointerId:7});await first.dispatchEvent('click');}
 await expect(page.locator('.sentence.selected')).toHaveCount(0);
 for(const id of ['theme-trends','reasons','letter-body','phrases'])await page.locator('[data-chapter="'+id+'"]').click({delay:0});
 await expect(page.locator('#transcript')).toHaveAttribute('data-lyric-chapter','phrases');expect(await page.locator('.sentence').count()).toBe(lib.chapters.find((c:any)=>c.id==='phrases').segments.length);expect((await state(page)).paused).toBe(true);
});

test('small portrait and landscape long sentences remain scrollable above the glass controls',async({page})=>{
 for(const viewport of [{width:320,height:568},{width:375,height:667},{width:430,height:932},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.locator('[data-chapter=picture]').click();await expect(page.locator('#transcript')).toHaveAttribute('data-lyric-chapter','picture');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const row=page.locator('.sentence').nth(1);await row.evaluate(e=>e.scrollIntoView({block:'end',behavior:'instant'}));await page.evaluate(()=>window.scrollBy(0,150));
  const geometry=await row.evaluate(e=>({height:e.getBoundingClientRect().height,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflow,maxHeight:getComputedStyle(e).maxHeight}));expect(geometry.overflow).toBe('visible');expect(geometry.maxHeight).toBe('none');expect(geometry.height).toBeGreaterThan(44);
  expect(await page.locator('.player-dock select').count()).toBe(0);const center=await page.locator('#play').boundingBox();const shell=await page.locator('.player-dock').boundingBox();expect(Math.abs(center!.x+center!.width/2-shell!.x-shell!.width/2)).toBeLessThan(2);
  const dock=(await page.locator('.player-dock').boundingBox())!;expect(dock.height).toBeLessThanOrEqual(110);expect(dock.width).toBeLessThanOrEqual(viewport.width-20);expect(dock.x).toBeGreaterThanOrEqual(10);
 }
});

test('all four modes click real sentence cues from paused and never reload a normal chapter',async({page})=>{
 test.setTimeout(90000);const c=lib.chapters[0],all=c.segments.flatMap((s:any)=>s.sentences),audio=page.locator('audio');
 const element=await audio.elementHandle();await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);
 await audio.evaluate((a:HTMLAudioElement)=>{(window as any).__loads=0;a.addEventListener('loadstart',()=>{(window as any).__loads++;});});
 for(const [mode,index] of [['all',2],['one',all.length-1],['off',4],['sentence',1]] as const){
  await setLoop(page,mode);if(!(await state(page)).paused)await page.locator('#play').click();const before=await state(page),loads=await page.evaluate(()=>(window as any).__loads),unit=all[index];
  const row=page.locator('[data-sentence="'+unit.id+'"]');await row.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await row.click();await expect(row).toHaveClass(/current-sentence/);
  if(mode==='sentence'){await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio.slow[unit.id]);await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);}
  else{const cue=lib.timings.slow[c.id].find((t:any)=>t.sentenceId===unit.id);await expect.poll(async()=>{const a=await state(page);return !a.paused&&a.time>cue.start+.1&&a.time<cue.start+1.5;}).toBe(true);expect((await state(page)).src).toBe(before.src);expect(await page.evaluate(()=>(window as any).__loads)).toBe(loads);}
  expect(await element!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);
 }
});

test('cold metadata and rapid cue clicks keep immediate focus on only the final target',async({page})=>{
 await play(page);await page.route('**/'+lib.audioModes.recite.picture,async route=>{await new Promise(r=>setTimeout(r,1200));await route.continue().catch(()=>{});});
 await selectSetting(page,'#preset','recite');const cues=lib.timings.recite.picture,ids=[cues[1].sentenceId,cues[4].sentenceId,cues[2].sentenceId];
 await page.evaluate(ids=>{for(const id of ids)document.querySelector<HTMLElement>('[data-sentence="'+id+'"]')!.click();},ids);
 const last=page.locator('[data-sentence="'+ids[2]+'"]');await expect(last).toHaveClass(/current-sentence/);
 await expect.poll(async()=>{const a=await state(page);return !a.paused&&a.src.includes(lib.audioModes.recite.picture)&&a.time>cues[2].start+.1&&a.time<cues[2].start+1.5;}).toBe(true);await expect(last).toHaveClass(/current-sentence/);expect(await page.locator('audio').count()).toBe(1);
});

test('manual browsing waits clear until the next line, then restores bounded Gaussian focus',async({page})=>{
 await play(page);const transcript=page.locator('#transcript'),cue=lib.timings.slow.picture[2];await transcript.dispatchEvent('touchmove');await page.evaluate(()=>window.scrollBy(0,650));await expect(transcript).toHaveAttribute('data-follow','AWAITING_NEXT_LINE');
 await expect.poll(()=>page.locator('.sentence').nth(2).evaluate(e=>getComputedStyle(e).filter)).toBe('none');const position=await page.evaluate(()=>scrollY);await page.waitForTimeout(350);expect(Math.abs(await page.evaluate(()=>scrollY)-position)).toBeLessThan(3);
 await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.1);await expect(transcript).toHaveAttribute('data-follow','FOLLOWING');await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toHaveClass(/current-sentence/);await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toBeVisible();
 await expect.poll(()=>page.locator('.sentence.next-sentence').evaluate(e=>getComputedStyle(e).filter)).not.toBe('none');expect(await page.locator('.current-sentence').evaluate(e=>getComputedStyle(e).filter)).toBe('none');expect((await state(page)).paused).toBe(false);
});

test('balanced icon-only transport keeps settings in the dialog and four distinct loop shapes',async({page})=>{
 const dock=page.locator('.player-dock');expect(await dock.locator('select').count()).toBe(0);for(const id of ['#previous','#play','#next','#loop-button']){const control=page.locator(id),box=(await control.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(await control.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');}expect((await page.locator('#play svg').boundingBox())!.width).toBeGreaterThanOrEqual(38);expect(await page.locator('#elapsed').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(12);expect((await page.locator('.seek-track').boundingBox())!.y-(await dock.boundingBox())!.y).toBeGreaterThanOrEqual(16);await expect(page.locator('#follow-current')).toHaveCount(0);const shapes=[];
 for(const mode of ['all','one','off','sentence']){await setLoop(page,mode);const b=page.locator('#loop-button');await expect(b.locator('svg')).toHaveAttribute('data-loop-icon',mode);shapes.push(await b.innerHTML());expect((await b.textContent())!.trim()).toBe('');}
 expect(new Set(shapes).size).toBe(4);await selectSetting(page,'#preset','recite');await selectSetting(page,'#rate','0.6');await page.reload();await expect(page.locator('#preset')).toHaveValue('recite');await expect(page.locator('#rate')).toHaveValue('0.6');
 const b=page.locator('#loop-button'),r=(await b.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.waitForTimeout(600);await expect(page.locator('#more-settings')).toBeVisible();await page.mouse.up();await page.locator('#loop').selectOption('off');await page.locator('#more-close').click();await expect(b).toHaveAttribute('aria-label','循环方式：顺序一次');
});

test('refresh resumes the saved audio sentence and focuses it without an extra control',async({page})=>{
 const cue=lib.timings.slow.picture[4],row=page.locator('[data-sentence="'+cue.sentenceId+'"]');await row.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await row.click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(cue.start+.1);await page.reload();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(cue.start);expect((await state(page)).paused).toBe(true);await play(page);await expect(page.locator('#transcript')).toHaveAttribute('data-follow','FOLLOWING');const r=(await page.locator('[data-sentence="'+cue.sentenceId+'"]').boundingBox())!;expect(r.y).toBeGreaterThan(60);expect(r.y).toBeLessThan(page.viewportSize()!.height-130);await expect(page.locator('#follow-current')).toHaveCount(0);
});
