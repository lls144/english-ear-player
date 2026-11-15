import {test,expect} from '@playwright/test';

test('a whole sentence presses inward then floats forward without changing its layout box',async({page})=>{
 await page.goto('./');const row=page.locator('.sentence').nth(1);await row.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 const before=await row.boundingBox(),body=row.locator('.lyric-body');const box=(await row.boundingBox())!;
 await page.mouse.move(box.x+35,Math.max(145,box.y+30));await page.mouse.down();await page.waitForTimeout(140);
 await expect.poll(()=>row.evaluate(e=>Number(getComputedStyle(e,'::before').opacity))).toBeGreaterThan(.9);
 expect(await body.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).a)).toBeLessThan(.98);
 expect((await row.boundingBox())!.height).toBeCloseTo(before!.height,1);
 await page.evaluate(()=>{const w=window as any;w.__pressScales=[];const begin=performance.now(),body=document.querySelector('.is-pressing .lyric-body')!;const sample=()=>{w.__pressScales.push(new DOMMatrixReadOnly(getComputedStyle(body).transform).a);if(performance.now()-begin<650)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await page.mouse.up();await expect(row).toHaveClass(/selected/);await page.waitForTimeout(720);
 const scales=await page.evaluate(()=>(window as any).__pressScales as number[]);expect(Math.min(...scales)).toBeLessThan(.98);expect(Math.max(...scales)).toBeGreaterThan(1.035);
 await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(8.075);
 await expect(row).toHaveClass(/current-sentence/);await expect.poll(()=>row.evaluate(e=>Number(getComputedStyle(e,'::before').opacity))).toBe(0);
});

test('scroll gestures cancel the press surface and do not activate a sentence',async({page})=>{
 await page.goto('./');const row=page.locator('.sentence').first(),box=(await row.boundingBox())!;
 await page.mouse.move(box.x+30,box.y+25);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.move(box.x+30,box.y-45,{steps:6});await page.mouse.up();
 await expect(page.locator('.sentence.is-pressing,.sentence.is-picked')).toHaveCount(0);await expect(page.locator('.sentence.selected')).toHaveCount(0);expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
});

test('every chapter keeps distinct blue and plum layers even when background motion is reduced',async({page})=>{
 await page.goto('./');for(const chapter of ['picture','letter-body','phrases']){
  await page.locator('[data-chapter="'+chapter+'"]').click();await expect(page.locator('#transcript')).toHaveAttribute('data-lyric-chapter',chapter);await page.waitForTimeout(100);
  const colors=await page.locator('.ambient-scene').evaluateAll(es=>es.map(e=>({opacity:getComputedStyle(e).opacity,blue:getComputedStyle(e).getPropertyValue('--ambient-blue'),plum:getComputedStyle(e).getPropertyValue('--ambient-plum')})));
  const active=colors.find(c=>c.opacity==='1')??colors.at(-1)!;expect(active.blue).not.toBe(active.plum);
 }
 await page.emulateMedia({reducedMotion:'reduce'});const layers=await page.locator('.ambient-scene').last().evaluate(e=>['::before','::after'].map(p=>({gradient:getComputedStyle(e,p).backgroundImage,animation:getComputedStyle(e,p).animationName})));
 expect(layers.every(l=>l.gradient.includes('radial-gradient')&&l.animation==='none')).toBe(true);
 const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
