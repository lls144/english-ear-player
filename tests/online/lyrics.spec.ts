import {selectSetting} from '../ui';
import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const lib=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
test.use({serviceWorkers:'block'});
async function start(page:Page){await page.locator('#play').click();await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.12);}
test('formal immersive lyrics follow the actual cue and preserve manual browsing',async({page,browserName,isMobile},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await start(page);
 const cue=lib.timings.slow.picture[1];await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},cue.start+.2);
 const target=page.locator('[data-sentence="'+cue.sentenceId+'"]');await expect(target).toHaveClass(/current-sentence/);await page.waitForTimeout(550);
 const geometry=await target.boundingBox();expect(geometry!.y).toBeGreaterThan(60);expect(geometry!.y).toBeLessThan(page.viewportSize()!.height-130);expect(await target.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 if(['edge-desktop','iphone-webkit'].includes(info.project.name)){await fs.promises.mkdir('.local/qa/visual-online',{recursive:true});await page.screenshot({path:'.local/qa/visual-online/'+info.project.name+'.png'});}
 const transcript=page.locator('#transcript');await transcript.dispatchEvent('pointerdown',{pointerId:11,clientX:80,clientY:300});await transcript.dispatchEvent('pointermove',{pointerId:11,clientX:80,clientY:190});await page.evaluate(()=>window.scrollBy(0,600));
 await page.waitForTimeout(250);const before=await page.evaluate(()=>scrollY);const next=lib.timings.slow.picture[2];await page.locator('audio').evaluate((a:HTMLAudioElement,t:number)=>{a.currentTime=t;},next.start+.2);await page.waitForTimeout(300);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(4);await expect(transcript).toHaveAttribute('data-follow','USER_INTERACTING');await transcript.dispatchEvent('pointerup',{pointerId:11});await expect(transcript).toHaveAttribute('data-follow','FOLLOWING');await expect(page.locator('[data-sentence="'+next.sentenceId+'"]')).toHaveClass(/current-sentence/);await expect(page.locator('#follow-current')).toHaveCount(0);expect(errors).toEqual([]);
});
test('formal progress drag commits once and keeps the persistent audio element',async({page})=>{
 await page.goto('./');for(const id of ['#preset','#rate'])expect(await page.locator(id).evaluate(e=>getComputedStyle(e).appearance)).toBe('none');await start(page);await page.locator('audio').evaluate((a:HTMLAudioElement)=>{(window as any).__seeks=0;a.addEventListener('seeking',()=>{(window as any).__seeks++});});
 await expect(page.locator('#now-title')).toHaveCount(0);const rail=page.locator('.seek-track'),rest=await rail.evaluate(e=>e.getBoundingClientRect().height);
 const audio=await page.locator('audio').elementHandle(),src=await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentSrc),r=(await page.locator('#progress').boundingBox())!;
 await page.mouse.move(r.x+r.width*.15,r.y+r.height*.65);await page.mouse.down();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.65,{steps:8});expect(await page.evaluate(()=>(window as any).__seeks)).toBe(0);await expect.poll(()=>rail.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(rest*1.8);await expect.poll(()=>page.locator('.seek-fill').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');await expect(page.locator('#elapsed')).toHaveText(/^\d+:\d{2}$/);await expect(page.locator('#remaining')).toHaveText(/^−\d+:\d{2}$/);await page.mouse.up();
 await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeGreaterThan(.48);await expect.poll(()=>page.evaluate(()=>(window as any).__seeks)).toBe(1);expect(await audio!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentSrc)).toBe(src);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);await expect.poll(()=>rail.evaluate(e=>e.getBoundingClientRect().height)).toBeCloseTo(rest,1);
});

test('formal lyric taps start the exact cue in every loop mode on one native audio element',async({page})=>{
 test.setTimeout(180000);await page.goto('./');const audio=page.locator('audio'),element=await audio.elementHandle();const media=()=>audio.evaluate((a:HTMLAudioElement)=>({src:a.currentSrc,time:a.currentTime,duration:a.duration,paused:a.paused}));
 await expect.poll(async()=>(await media()).duration).toBeGreaterThan(0);const all=lib.chapters[0].segments.flatMap((s:any)=>s.sentences);
 await audio.evaluate((a:HTMLAudioElement)=>{(window as any).__loads=0;a.addEventListener('loadstart',()=>{(window as any).__loads++;});});
 for(const [mode,index] of [['all',2],['one',all.length-1],['off',4],['sentence',1]] as const){
  await selectSetting(page,'#loop',mode);if(!(await media()).paused)await page.locator('#play').click();const prior=await media(),loads=await page.evaluate(()=>(window as any).__loads),u=all[index],row=page.locator('[data-sentence="'+u.id+'"]');
  await row.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await row.click();await expect(row).toHaveClass(/current-sentence/);
  if(mode==='sentence'){await expect.poll(async()=>(await media()).src).toContain(lib.sentenceAudio.slow[u.id]);await expect.poll(async()=>(await media()).time).toBeGreaterThan(.1);}
  else{const cue=lib.timings.slow.picture.find((t:any)=>t.sentenceId===u.id);await expect.poll(async()=>{const a=await media();return !a.paused&&a.time>cue.start+.1&&a.time<cue.start+1.5;}).toBe(true);expect((await media()).src).toBe(prior.src);expect(await page.evaluate(()=>(window as any).__loads)).toBe(loads);}
  expect(await element!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);
 }
});
