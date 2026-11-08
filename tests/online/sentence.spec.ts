import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {installMediaDiagnostics,attachFailedMedia} from '../media-diagnostics';
// Actual worker updates are tested separately; avoid first-install prefetch competition here.
test.use({serviceWorkers:'block'});
const lib=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const units=(c:any)=>c.segments.flatMap((s:any)=>s.sentences);
const audio=(p:Page)=>p.locator('audio');
const state=(p:Page)=>audio(p).evaluate((a:HTMLAudioElement)=>({time:a.currentTime,src:a.currentSrc,duration:a.duration,paused:a.paused,loop:a.loop,rate:a.playbackRate}));
async function loop(p:Page,value:string){await p.locator('#more-open').click();await p.locator('#loop').selectOption(value);await p.locator('#more-close').click();}
async function choose(p:Page,id:string){const row=p.locator('[data-sentence="'+id+'"]');await row.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await p.waitForTimeout(150);const before=await p.evaluate(()=>scrollY);await row.click();expect(Math.abs(await p.evaluate(()=>scrollY)-before)).toBeLessThan(2);await expect(row).toHaveAttribute('aria-pressed','true');}
test.beforeEach(async({page})=>{await installMediaDiagnostics(page);await page.goto('./');await expect(page.locator('.sentence')).not.toHaveCount(0);});
test.afterEach(async({page},info)=>{await attachFailedMedia(page,info);});
test('display templates remain original while sentence files select first middle last and real clauses',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 const element=await audio(page).elementHandle();await loop(page,'sentence');
 for(const cid of ['picture','reasons','connectors']){
  const c=lib.chapters.find((c:any)=>c.id===cid),all=units(c);await page.locator('[data-chapter="'+cid+'"]').click();
  for(const u of [all[0],all[Math.floor(all.length/2)],all.at(-1)]){
   await choose(page,u.id);if(await page.locator('#play').getAttribute('aria-label')==='播放')await page.locator('#play').click();
   await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio.slow[u.id]);
   await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.15);
   expect((await state(page)).loop).toBe(true);expect(await element!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);
   for(const preset of ['continuous','recite','slow']){await page.locator('#preset').selectOption(preset);await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio[preset][u.id]);await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);const before=(await state(page)).time;await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(before+.1);await expect(page.locator('[data-sentence="'+u.id+'"]').first()).toHaveAttribute('aria-pressed','true');}
  }
 }
 expect(errors).toEqual([]);
});
test('manual lock resists follow highlighting and survives seek pause refresh and loop exit',async({page})=>{
 const c=lib.chapters[0],all=units(c),u=all[2];await choose(page,u.id);await page.locator('#play').click();
 await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=1;});await page.waitForTimeout(300);await expect(page.locator('[data-sentence="'+u.id+'"]')).toHaveAttribute('aria-pressed','true');
 await loop(page,'sentence');await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio.slow[u.id]);
 await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);await page.locator('#play').click();const at=(await state(page)).time;await page.waitForTimeout(200);expect(Math.abs((await state(page)).time-at)).toBeLessThan(.15);
 await page.locator('#rate').selectOption('0.55');await page.locator('#progress').fill('500');await page.locator('#progress').dispatchEvent('input');await expect.poll(async()=>(await state(page)).time/(await state(page)).duration).toBeGreaterThan(.45);
 await page.reload();await expect(page.locator('#loop-label')).toHaveText('单句');await expect(page.locator('[data-sentence="'+u.id+'"]')).toHaveAttribute('aria-pressed','true');expect((await state(page)).paused).toBe(true);
 await loop(page,'all');await expect.poll(async()=>(await state(page)).src).toContain(lib.audio[c.id]);expect((await state(page)).loop).toBe(false);
});
test('rapid locked sentence changes discard old sources and keep the latest selected ID',async({page})=>{
 const all=units(lib.chapters[0]);await page.route('**/'+lib.sentenceAudio.slow[all[3].id],async route=>{await new Promise(r=>setTimeout(r,750));await route.continue().catch(()=>{});});await loop(page,'sentence');await page.locator('#play').click();
 for(const preset of ['continuous','recite','slow'])await page.locator('#preset').selectOption(preset);
 for(const u of [all[0],all[3],all[1],all.at(-1),all[2]])await choose(page,u.id);
 await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio.slow[all[2].id]);await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
 expect((await state(page)).paused).toBe(false);expect(await audio(page).count()).toBe(1);
});

test('entering single loop without a manual target locks the actual current sentence',async({page})=>{
 const cue=lib.timings.slow.picture[4];await page.locator('#play').click();await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);
 await audio(page).evaluate((a:HTMLAudioElement,time:number)=>{a.currentTime=time;},cue.start+.1);
 await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toHaveClass(/current-sentence/);
 await loop(page,'sentence');await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio.slow[cue.sentenceId]);await expect(page.locator('[data-sentence="'+cue.sentenceId+'"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#next').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);await page.locator('#play').click();const next=lib.chapters[1].segments[0].sentences[0];await expect(page.locator('[data-sentence="'+next.id+'"]')).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.locator('[data-sentence="'+next.id+'"]')).toHaveAttribute('aria-pressed','true');
});
test('native single-sentence loops complete twenty rounds without entering any other sentence',async({page},info)=>{
 test.setTimeout(300000);
 const c=lib.chapters.find((c:any)=>c.id==='connectors'),u=units(c)[0];await page.locator('[data-chapter=connectors]').click();await choose(page,u.id);await loop(page,'sentence');
 const longRun=['android-chrome','iphone-webkit'].includes(info.project.name),rounds=longRun?[20,20,20]:[7,7,6];const reports=[];
 for(const [i,preset] of ['continuous','slow','recite'].entries()){
  await page.locator('#preset').selectOption(preset);if(await page.locator('#play').getAttribute('aria-label')==='播放')await page.locator('#play').click();
  await expect.poll(async()=>(await state(page)).src).toContain(lib.sentenceAudio[preset][u.id]);await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
  const result=await audio(page).evaluate(async(a:HTMLAudioElement,n:number)=>{
   const source=a.currentSrc,duration=a.duration;let wraps=0,last=a.currentTime;const started=performance.now(),seen=new Set<string>();
   return await new Promise<{wraps:number;source:string;duration:number;seconds:number;seen:string[]}>((resolve,reject)=>{
    const timer=setInterval(()=>{seen.add(a.currentSrc);if(a.currentTime<last-.3&&last>duration-.7)wraps++;last=a.currentTime;if(a.error||a.paused||a.currentSrc!==source){clearInterval(timer);reject(Error('Native loop stopped or changed source'));}else if(wraps>=n){clearInterval(timer);resolve({wraps,source,duration,seconds:(performance.now()-started)/1000,seen:[...seen]});}else if(performance.now()-started>120000){clearInterval(timer);reject(Error('Native loops did not advance'));}},20);
   });
  },rounds[i]);expect(result.wraps).toBe(rounds[i]);expect(result.seen).toEqual([result.source]);reports.push({preset,...result});
 }
 await info.attach('real-native-loop-rounds',{body:JSON.stringify(reports),contentType:'application/json'});
 expect(reports.reduce((n,r)=>n+r.wraps,0)).toBeGreaterThanOrEqual(20);
});
