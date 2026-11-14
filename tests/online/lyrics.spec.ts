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
 if(browserName==='webkit'&&isMobile){await page.locator('#transcript').dispatchEvent('touchmove');await page.evaluate(()=>window.scrollBy(0,650));}else await page.mouse.wheel(0,650);
 await page.waitForTimeout(300);const before=await page.evaluate(()=>scrollY);await page.locator('audio').evaluate((a:HTMLAudioElement)=>{a.currentTime=.3;});await page.waitForTimeout(650);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(4);await expect(page.locator('#follow-current')).toBeVisible();await page.locator('#follow-current').click();await page.waitForTimeout(500);expect(await page.evaluate(()=>scrollY)).toBeLessThan(before-40);expect(errors).toEqual([]);
});
test('formal progress drag commits once and keeps the persistent audio element',async({page})=>{
 await page.goto('./');await start(page);await page.locator('audio').evaluate((a:HTMLAudioElement)=>{(window as any).__seeks=0;a.addEventListener('seeking',()=>{(window as any).__seeks++});});
 const audio=await page.locator('audio').elementHandle(),src=await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentSrc),r=(await page.locator('#progress').boundingBox())!;
 await page.mouse.move(r.x+r.width*.15,r.y+r.height*.65);await page.mouse.down();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.65,{steps:8});expect(await page.evaluate(()=>(window as any).__seeks)).toBe(0);await page.mouse.up();
 await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeGreaterThan(.48);await expect.poll(()=>page.evaluate(()=>(window as any).__seeks)).toBe(1);expect(await audio!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentSrc)).toBe(src);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
});
