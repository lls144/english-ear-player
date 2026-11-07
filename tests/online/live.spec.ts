import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const library=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const audio=(p:Page)=>p.locator('audio');
const state=(p:Page)=>audio(p).evaluate((a:HTMLAudioElement)=>({time:a.currentTime,duration:a.duration,rate:a.playbackRate,paused:a.paused,src:a.currentSrc}));
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{
 const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(String(e)));page.on('console',m=>{if(m.type()==='error')list.push(m.text());});
 await page.goto('./?verify='+Date.now());await expect(page.locator('#chapter-title')).toHaveText(library.chapters[0].title);
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
test('HTTPS homepage and every English paragraph match the release',async({page})=>{
 expect(new URL(page.url()).protocol).toBe('https:');expect(await page.locator('#chapters button').count()).toBe(library.chapters.length);
 let segments=0;for(const c of library.chapters){await page.locator('[data-chapter="'+c.id+'"]').click();expect(await page.locator('#transcript .passage p').allTextContents()).toEqual(c.segments.map(s=>s.text));segments+=c.segments.length;}
 expect(segments).toBe(library.chapters.reduce((n:number,c:any)=>n+c.segments.length,0));
 const v=await page.request.get('version.json?check='+Date.now());expect(v.ok()).toBe(true);const meta=await v.json();expect(meta.contentVersion).toBe(library.contentVersion);expect(meta.version).toBe(library.version);
});
test('all HTTPS MP3s play and pause loop and speed affect real media',async({page})=>{
 test.setTimeout(90000);
 for(const preset of ['continuous','recite','slow']){await page.locator('#preset').selectOption(preset);for(const c of library.chapters){await page.locator('[data-chapter="'+c.id+'"]').click();if((await state(page)).paused)await page.locator('#play').click();await expect.poll(async()=>(await state(page)).src).toContain(library.audioModes[preset][c.id]);await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);expect((await state(page)).duration).toBeGreaterThan(2);}}
 await page.locator('#rate').selectOption('0.65');expect((await state(page)).rate).toBeCloseTo(.65/library.referenceRate,5);
 await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.15;});await expect(page.locator('#chapter-title')).toHaveText(library.chapters[0].title);
 await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(.1);
 await page.locator('#loop-button').click();await audio(page).evaluate((a:HTMLAudioElement)=>{a.currentTime=a.duration-.15;});
 await expect.poll(async()=>(await state(page)).time).toBeLessThan(2);await expect.poll(async()=>(await state(page)).paused).toBe(false);
 await page.locator('#play').click();const at=(await state(page)).time;await page.waitForTimeout(400);expect(Math.abs((await state(page)).time-at)).toBeLessThan(.2);
 await page.locator('#play').click();await expect.poll(async()=>(await state(page)).time).toBeGreaterThan(at+.1);
});
test('mobile layout and refreshed settings survive returning',async({page})=>{
 const c=library.chapters[2];await page.locator('[data-chapter="'+c.id+'"]').click();await page.locator('#rate').selectOption('0.9');
 expect((await page.locator('.player-dock').boundingBox())!.height).toBeLessThanOrEqual(110);const w=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));expect(w.scroll).toBeLessThanOrEqual(w.client);
 await page.reload();await expect(page.locator('#chapter-title')).toHaveText(c.title);await expect.poll(async()=>(await state(page)).duration).toBeGreaterThan(0);expect((await state(page)).rate).toBeCloseTo(.9/library.referenceRate,5);expect((await state(page)).paused).toBe(true);
 await page.goto('./?return='+Date.now());await expect(page.locator('#chapter-title')).toHaveText(c.title);
});
test('manifest icons JS CSS and worker are actual production resources',async({page,browserName})=>{
 const response=await page.request.get('manifest.webmanifest');expect(response.ok()).toBe(true);const m=await response.json();expect(m.display).toBe('standalone');
 for(const icon of m.icons){const r=await page.request.get(icon.src);expect(r.ok()).toBe(true);expect((await r.body()).length).toBeGreaterThan(100);}
 for(const url of await page.locator('script[src],link[rel=stylesheet]').evaluateAll(es=>es.map(e=>e.getAttribute('src')??e.getAttribute('href')))){const r=await page.request.get(url!);expect(r.ok()).toBe(true);expect((await r.body()).length).toBeGreaterThan(100);}
 const worker=await page.request.get('sw.js');expect(worker.ok()).toBe(true);expect(await worker.text()).not.toContain('skipWaiting(');
 if(browserName==='chromium')await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
});

