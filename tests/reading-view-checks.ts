import{test,expect,type Page}from'@playwright/test';

/** The same checks run on local production and the actual HTTPS release. */
export function readingViewChecks(){
 // Worker installation/update is covered independently; UI media reads exact
 // production bytes without competing with a first-install audio prefetch.
 test.use({serviceWorkers:'block'});const problems=new WeakMap<Page,string[]>();
 test.beforeEach(async({page})=>{const errors:string[]=[];problems.set(page,errors);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('./');await expect(page.locator('.sentence')).not.toHaveCount(0);});
 test.afterEach(async({page})=>expect(problems.get(page)).toEqual([]));

 test('paused lyrics keep symmetric distance blur until an actual reading gesture',async({page})=>{
  await page.locator('[data-chapter="connectors"]').click();await page.locator('#play').click();
  await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.12);await page.locator('#play').click();
  const root=page.locator('#transcript'),near=page.locator('.sentence').nth(1),far=page.locator('.sentence').nth(3);
  await expect(root).toHaveClass(/focused/);await expect(root).toHaveAttribute('data-browsing','false');await expect(near).toHaveClass(/lyric-visible/);await expect(far).toHaveClass(/lyric-visible/);
  await expect.poll(()=>near.evaluate(e=>parseFloat(getComputedStyle(e).filter.replace(/[^\d.]/g,'')))).toBeGreaterThan(.2);
  const depths=await page.locator('.sentence').evaluateAll(es=>es.slice(0,5).map(e=>({blur:parseFloat((e as HTMLElement).style.getPropertyValue('--lyric-blur')),opacity:parseFloat((e as HTMLElement).style.getPropertyValue('--lyric-opacity'))})));
  for(let i=1;i<depths.length;i++){expect(depths[i].blur).toBeGreaterThan(depths[i-1].blur);expect(depths[i].opacity).toBeLessThan(depths[i-1].opacity);}
  const before=await near.evaluate(e=>getComputedStyle(e).filter);await page.evaluate(()=>document.documentElement.dataset.effects='quiet');await page.waitForTimeout(250);expect(await near.evaluate(e=>getComputedStyle(e).filter)).toBe(before);
  await root.dispatchEvent('pointerdown',{pointerId:88,clientX:80,clientY:300});expect(await near.evaluate(e=>getComputedStyle(e).filter)).toBe(before);
  await root.dispatchEvent('pointermove',{pointerId:88,clientX:80,clientY:210});await expect(root).toHaveAttribute('data-browsing','true');await expect.poll(()=>near.evaluate(e=>getComputedStyle(e).filter)).toBe('none');await root.dispatchEvent('pointerup',{pointerId:88});
  expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 });

 test('ambient colors visibly advance while paused and survive chapter and slow-frame changes',async({page})=>{
  await expect(page.locator('.ambient-scene')).toHaveCount(1);const sample=()=>page.locator('.ambient-scene').evaluate(e=>[...e.querySelectorAll('canvas')].map(layer=>({transform:getComputedStyle(layer).transform,state:getComputedStyle(layer).animationPlayState,name:getComputedStyle(layer).animationName})));
  const first=await sample();await page.evaluate(()=>{(window as any).__field=document.querySelector('.ambient-scene');(window as any).__textures=[...document.querySelectorAll('.ambient-blob')];document.documentElement.dataset.effects='quiet';document.documentElement.dataset.motionBudget='quiet';});await page.waitForTimeout(1100);const second=await sample();
  for(let i=0;i<2;i++){expect(second[i].state).toBe('running');expect(second[i].name).not.toBe('none');expect(second[i].transform).not.toBe(first[i].transform);}
  for(const id of ['theme-trends','letter-body','picture'])await page.locator('[data-chapter="'+id+'"]').click();expect(await page.locator('.ambient-scene').evaluate(e=>e===(window as any).__field)).toBe(true);
  const third=await sample();expect(third).toHaveLength(2);expect(third.every(l=>l.state==='running')).toBe(true);expect(await page.locator('.ambient-scene').evaluate(e=>[...e.querySelectorAll('canvas')].every((c,i)=>c===(window as any).__textures[i]&&c.width===256&&c.height===256))).toBe(true);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 });

 test('chapter replacement never blanks the reader or changes the frosted dock into an opaque block',async({page})=>{
  const result=await page.evaluate(async()=>{
   const root=document.querySelector('#transcript')!,dock=document.querySelector('.player-dock')!,field=document.querySelector('.ambient-scene'),frames:{opacity:number;rows:number;glass:string;alpha:string;field:boolean}[]=[];
   for(const id of ['theme-trends','reasons','letter-body','picture']){(document.querySelector('[data-chapter="'+id+'"]') as HTMLElement).click();await new Promise(requestAnimationFrame);for(let i=0;i<2;i++){await new Promise(requestAnimationFrame);const css=getComputedStyle(dock);frames.push({opacity:Number(getComputedStyle(root).opacity),rows:root.querySelectorAll('.sentence').length,glass:css.backdropFilter||css.getPropertyValue('-webkit-backdrop-filter'),alpha:css.backgroundColor,field:document.querySelector('.ambient-scene')===field});}}
   document.documentElement.dataset.effects='quiet';document.documentElement.dataset.lyricMotion='moving';document.documentElement.dataset.motionBudget='quiet';const css=getComputedStyle(dock),edge=getComputedStyle(document.querySelector('.app-header')!,'::before');return{frames,quietGlass:css.backdropFilter||css.getPropertyValue('-webkit-backdrop-filter'),quietAlpha:css.backgroundColor,edge:{image:edge.backgroundImage,height:parseFloat(edge.height)}};
  });
  await test.info().attach('chapter-and-glass-frames',{body:JSON.stringify(result),contentType:'application/json'});
  for(const f of result.frames){expect(f.opacity).toBe(1);expect(f.rows).toBeGreaterThan(0);expect(f.field).toBe(true);expect(f.glass).toContain('blur(');expect(f.alpha).toContain('0.5');}expect(result.quietGlass).toContain('blur(');expect(result.quietAlpha).toContain('0.5');expect(result.edge.height).toBeGreaterThanOrEqual(130);expect(result.edge.image).toContain('linear-gradient');if(page.viewportSize()!.width>760&&page.viewportSize()!.height>500){const dock=(await page.locator('.player-dock').boundingBox())!;expect(dock.x+dock.width/2).toBeCloseTo(page.viewportSize()!.width/2,0);}
 });

 test('the entire progress hit area accepts native touch taps and captured drag or cancel',async({page,isMobile})=>{
  await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.duration)).toBeGreaterThan(1);const range=page.locator('#progress'),box=(await range.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(await range.evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
  for(const [ratio,y]of [[.22,2],[.78,42],[.45,29]]){const x=box.x+box.width*ratio;if(isMobile)await page.touchscreen.tap(x,box.y+y);else await page.mouse.click(x,box.y+y);await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeCloseTo(ratio,1);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);await page.waitForTimeout(180);}
  const saved=await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime);await page.evaluate(({x,y,width})=>{const r=document.querySelector('#progress')!;r.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:91,pointerType:'touch',button:0,clientX:x+width*.1,clientY:y+4}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:91,pointerType:'touch',clientX:x+width*.9,clientY:y+40}));},{x:box.x,y:box.y,width:box.width});
  expect(Number(await range.inputValue())).toBe(900);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeCloseTo(saved,1);await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:91})));await expect(range.locator('..')).toHaveAttribute('data-seeking','false');expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeCloseTo(saved,1);
  await page.waitForTimeout(200);await page.locator('audio').evaluate(a=>{(window as any).__readingSeeks=0;a.addEventListener('seeking',()=>{(window as any).__readingSeeks++;});});await page.mouse.move(box.x+box.width*.2,box.y+3);await page.mouse.down();const scroll=await page.evaluate(()=>scrollY);await page.mouse.move(box.x+box.width+40,box.y+44);expect(Number(await range.inputValue())).toBe(1000);await page.mouse.move(box.x+box.width*.6,box.y+40,{steps:4});await page.waitForTimeout(230);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(scroll,0);expect(await page.evaluate(()=>(window as any).__readingSeeks)).toBe(0);expect((await page.locator('.seek-track').boundingBox())!.height).toBeGreaterThan(11);await page.mouse.up();
  await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeCloseTo(.6,1);await expect.poll(()=>page.evaluate(()=>(window as any).__readingSeeks)).toBe(1);
 });
}
