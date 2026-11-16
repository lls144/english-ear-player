import{test,expect}from'./native-fixture';

export function dialogChecks(){
 test.use({serviceWorkers:'block'});
 test('settings open and close repeatedly while genuine MP3 playback and native controls stay stable',async({page})=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('Browser renderer crashed'));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('./');await page.locator('[data-chapter=letter-body]').click();const audio=page.locator('audio'),element=await audio.elementHandle();await page.locator('#play').click();await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.1);const source=await audio.evaluate((a:HTMLAudioElement)=>a.currentSrc);
  for(let i=0;i<20;i++){
   await page.locator('#more-open').click();await expect(page.locator('#more-settings')).toBeVisible();
   const filters=await page.locator('#more-settings').evaluate(e=>[getComputedStyle(e).backdropFilter,getComputedStyle(e,'::backdrop').backdropFilter]);expect(filters).toEqual(['none','none']);
   await page.locator('#rate').selectOption(['0.7','0.65','0.75'][i%3]);await page.locator('#loop').selectOption(i%2?'one':'all');await page.locator('#more-close').click();await expect(page.locator('#more-settings')).not.toBeVisible();
   expect(await element!.evaluate(a=>a===document.querySelector('audio'))).toBe(true);expect(await audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);expect(await audio.evaluate((a:HTMLAudioElement)=>a.currentSrc)).toBe(source);
  }
  const at=await audio.evaluate((a:HTMLAudioElement)=>a.currentTime);await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(at+.1);await page.locator('#play').click();expect(await audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);expect(errors).toEqual([]);
 });
}
