import{test,expect}from'./native-fixture';
import fs from'node:fs';
const lib=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));

export function sentenceRestartChecks(){
 test.use({serviceWorkers:'block'});
 test('repeated current sentence taps keep the decoded native file and restart real playback without reloading',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('Native renderer crashed'));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('./');await page.locator('#more-open').click();await page.locator('#loop').selectOption('sentence');await page.locator('#more-close').click();
  const unit=lib.chapters[0].segments.flatMap((s:any)=>s.sentences)[1],row=page.locator('[data-sentence="'+unit.id+'"]');await row.click();
  const audio=page.locator('audio'),element=await audio.elementHandle();await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.2);
  const source=await audio.evaluate((a:HTMLAudioElement)=>a.currentSrc);
  await audio.evaluate(a=>{const w=window as any;w.__sameSentenceLoads=0;w.__sameSentenceSeeks=[];a.addEventListener('loadstart',()=>w.__sameSentenceLoads++);a.addEventListener('seeked',()=>w.__sameSentenceSeeks.push((a as HTMLAudioElement).currentTime));});
  for(let i=0;i<3;i++){
   await audio.evaluate((a:HTMLAudioElement)=>{a.currentTime=2;});await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>!a.seeking&&a.currentTime>=2)).toBe(true);
   await page.evaluate(()=>(window as any).__sameSentenceSeeks=[]);await row.click();
   await expect.poll(()=>page.evaluate(()=>(window as any).__sameSentenceSeeks.some((at:number)=>at<.1))).toBe(true);
   await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>!a.paused&&a.currentTime>.15)).toBe(true);
  }
  for(let i=0;i<5;i++)await row.click({delay:0});
  await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>!a.paused&&a.currentTime>.15)).toBe(true);
  expect(await page.evaluate(()=>(window as any).__sameSentenceLoads)).toBe(0);expect(await audio.evaluate((a:HTMLAudioElement)=>a.currentSrc)).toBe(source);expect(await element!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);expect(errors).toEqual([]);
  await page.locator('#play').click();expect(await audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 });
}
