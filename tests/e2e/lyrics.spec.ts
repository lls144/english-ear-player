import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const lib=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const state=(p:Page)=>p.locator('audio').evaluate((a:HTMLAudioElement)=>({time:a.currentTime,duration:a.duration,paused:a.paused,src:a.currentSrc,loop:a.loop}));
async function play(p:Page){await p.locator('#play').click();await expect.poll(async()=>(await state(p)).time).toBeGreaterThan(.12);await p.waitForTimeout(450);}
async function setLoop(p:Page,value:string){await p.locator('#more-open').click();await p.locator('#loop').selectOption(value);await p.locator('#more-close').click();}
const problems=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const errors:string[]=[];problems.set(page,errors);page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await expect(page.locator('.sentence')).not.toHaveCount(0);});
test.afterEach(async({page},info)=>{expect(problems.get(page)).toEqual([]);if(info.status!==info.expectedStatus)await info.attach('lyrics-debug',{body:JSON.stringify(await page.evaluate(()=>({scrollY,innerHeight,follow:document.querySelector('#transcript')?.getAttribute('data-follow'),current:document.querySelector('.current-sentence')?.getBoundingClientRect().toJSON()}))),contentType:'application/json'});});

test('real sentence boundary follows a measured easing trajectory into the readable viewport',async({page})=>{
 const cue=lib.timings.slow.picture[2];await play(page);await page.waitForTimeout(850);
 const frames=await page.evaluate(async(cue:{sentenceId:string;start:number})=>{
  const a=document.querySelector('audio')!,row=document.querySelector<HTMLElement>('[data-sentence="'+cue.sentenceId+'"]')!;
  const points:{time:number;y:number;scroll:number;current:boolean;header:number;dock:number}[]=[];const begin=performance.now();a.currentTime=cue.start-.08;
  await new Promise<void>(resolve=>{const sample=()=>{points.push({time:performance.now()-begin,y:row.getBoundingClientRect().top,scroll:scrollY,current:row.classList.contains('current-sentence'),header:document.querySelector('.app-header')!.getBoundingClientRect().top,dock:document.querySelector('.player-dock')!.getBoundingClientRect().bottom});if(performance.now()-begin<1100)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});return points;
 },cue);
 await test.info().attach('focus-trajectory',{body:JSON.stringify(frames),contentType:'application/json'});
 expect(frames.some(f=>f.current)).toBe(true);const positions=new Set(frames.map(f=>Math.round(f.scroll))).size;expect(positions).toBeGreaterThanOrEqual(4);if(frames.length<20)test.info().annotations.push({type:'frame-sampling',description:'Concurrent Windows WebKit throttles animation-frame sampling; trajectory is still multi-step. A separate single-browser DPR3 performance capture compares designed, quiet and unstyled rendering.'});
 const end=frames.at(-1)!;const bounds=await page.evaluate(()=>({top:matchMedia('(max-width:760px), (max-height:500px) and (orientation:landscape)').matches?document.querySelector('#chapters')!.getBoundingClientRect().bottom+18:80,bottom:document.querySelector('.player-dock')!.getBoundingClientRect().top-22}));
 expect(end.y).toBeGreaterThanOrEqual(bounds.top-8);expect(end.y).toBeLessThan(bounds.bottom-30);
 expect(Math.max(...frames.map(f=>f.header))-Math.min(...frames.map(f=>f.header))).toBeLessThan(3);expect(Math.max(...frames.map(f=>f.dock))-Math.min(...frames.map(f=>f.dock))).toBeLessThan(3);
 const scrolls=frames.map(f=>f.scroll);expect(Math.max(...scrolls)-Math.min(...scrolls)).toBeGreaterThan(20);
 const travel=Math.max(...scrolls)-Math.min(...scrolls);for(let i=1;i<scrolls.length;i++){expect(scrolls[i]-scrolls[i-1]).toBeGreaterThanOrEqual(-3);expect(scrolls[i]-scrolls[i-1]).toBeLessThan(travel*.85);}
});

test('manual browsing holds its position through the next real cue until return-current is tapped',async({page,browserName,isMobile})=>{
 await play(page);if(browserName==='webkit'&&isMobile){await page.locator('#transcript').dispatchEvent('touchmove');await page.evaluate(()=>window.scrollBy(0,650));test.info().annotations.push({type:'gesture-scope',description:'Mobile WebKit automation has no wheel/swipe command: touch cancellation and actual scrolling are checked; Android also uses native touch input.'});}else await page.mouse.wheel(0,650);await page.waitForTimeout(350);const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(100);
 const cue=lib.timings.slow.picture[0];await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.3);
 await page.waitForTimeout(750);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(4);await expect(page.locator('#follow-current')).toBeVisible();
 await page.locator('#follow-current').click();await page.waitForTimeout(500);await expect(page.locator('#follow-current')).toBeHidden();expect(await page.evaluate(()=>scrollY)).toBeLessThan(before-50);expect((await state(page)).paused).toBe(false);
});

test('scrubbing previews without seeking or pausing and commits one accurate seek on release',async({page})=>{
 await play(page);await page.locator('audio').evaluate((a:HTMLAudioElement)=>{(window as any).__seeks=0;(window as any).__pauses=0;a.addEventListener('seeking',()=>{(window as any).__seeks++});a.addEventListener('pause',()=>{(window as any).__pauses++});});
 const slider=page.locator('#progress'),box=(await slider.boundingBox())!,source=(await state(page)).src;
 await page.mouse.move(box.x+box.width*.12,box.y+box.height*.65);await page.mouse.down();
 for(const ratio of [.3,.65,.43]){await page.mouse.move(box.x+box.width*ratio,box.y+box.height*.65,{steps:4});await page.waitForTimeout(80);}
 const draft=Number(await slider.inputValue())/1000;expect(draft).toBeGreaterThan(.38);expect(draft).toBeLessThan(.49);expect(await page.evaluate(()=>(window as any).__seeks)).toBe(0);expect((await state(page)).time/(await state(page)).duration).toBeLessThan(.1);
 await page.mouse.up();await expect.poll(async()=>(await state(page)).time/(await state(page)).duration).toBeGreaterThan(.38);
 await expect.poll(()=>page.evaluate(()=>(window as any).__seeks)).toBe(1);expect(await page.evaluate(()=>(window as any).__pauses)).toBe(0);expect((await state(page)).src).toBe(source);
});

test('single-loop silence keeps focus and two actual wraps cause no repeated scrolling',async({page})=>{
 test.setTimeout(25000);await page.locator('[data-chapter=connectors]').click();await expect(page.locator('#transcript')).toHaveAttribute('data-lyric-chapter','connectors');await setLoop(page,'sentence');await play(page);
 const result=await page.locator('audio').evaluate(async(a:HTMLAudioElement)=>{let wraps=0,previous=a.currentTime,min=scrollY,max=scrollY;const start=performance.now();return await new Promise<{wraps:number;delta:number;current:string|null}>((resolve,reject)=>{const timer=setInterval(()=>{min=Math.min(min,scrollY);max=Math.max(max,scrollY);if(a.currentTime<previous-.3)wraps++;previous=a.currentTime;if(wraps===2){clearInterval(timer);resolve({wraps,delta:max-min,current:document.querySelector('.current-sentence')?.getAttribute('data-sentence')??null});}if(performance.now()-start>18000){clearInterval(timer);reject(Error('Two real wraps did not finish'));}},20);});});
 expect(result.wraps).toBe(2);expect(result.delta).toBeLessThan(3);expect(result.current).toBe(lib.chapters.find((c:any)=>c.id==='connectors').segments[0].sentences[0].id);
});

test('reduced motion removes drifting background and timed focus travel',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await play(page);expect(await page.locator('.ambient-field').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');expect(await page.locator('.sentence').first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
 const cue=lib.timings.slow.picture[2];await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.2);await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toHaveClass(/current-sentence/);await page.waitForTimeout(80);const before=await page.evaluate(()=>scrollY);await page.waitForTimeout(200);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(2);
});

test('scroll gestures cannot select text and rapid chapter fades finish on the latest chapter',async({page,browserName})=>{
 const first=page.locator('.sentence').first(),r=(await first.boundingBox())!;
 if(browserName==='chromium'){
  const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+25,y:r.y+40}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+25,y:r.y+40-i*12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
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
  for(const id of ['#preset','#rate']){const control=page.locator(id);expect(await control.evaluate(e=>getComputedStyle(e).appearance)).toBe('none');expect(await control.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');}
  const dock=(await page.locator('.player-dock').boundingBox())!;expect(dock.height).toBeLessThanOrEqual(110);expect(dock.width).toBeLessThanOrEqual(viewport.width-20);expect(dock.x).toBeGreaterThanOrEqual(10);
 }
});
