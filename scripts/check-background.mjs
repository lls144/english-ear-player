import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:false});
try{
 const context=await b.newContext(),p=await context.newPage();
 const cdp=await context.newCDPSession(p);
 await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
 await p.goto('http://127.0.0.1:5173/');await p.locator('#play').click();
 await p.waitForFunction(()=>document.querySelector('audio').currentTime>.1);
 const a=await p.locator('audio').elementHandle();
 await p.evaluate(()=>{window.visibilityLog=[];document.addEventListener('visibilitychange',()=>visibilityLog.push(document.visibilityState));});
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
 await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
 const hidden=await p.waitForFunction(()=>document.hidden,null,{polling:100,timeout:1500}).then(()=>true).catch(()=>false);
 const before=await p.locator('audio').evaluate(a=>a.currentTime);
 await p.waitForTimeout(1200);
 const after=await p.locator('audio').evaluate(a=>a.currentTime);assert.ok(after>before+.5);
 await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
 await new Promise(r=>setTimeout(r,800));
 await cdp.send('Page.setWebLifecycleState',{state:'active'});
 await p.waitForFunction(()=>!document.querySelector('audio').paused,null,{polling:100});
 const expected=['主题句与社会趋势','原因分析','逻辑连接词'];
 for(const title of expected){
  if(hidden)assert.equal(await p.evaluate(()=>document.hidden),true);
  await p.locator('audio').evaluate(a=>a.currentTime=a.duration-.15);
  await p.waitForFunction(title=>document.querySelector('#chapter-title').textContent===title,title,{polling:100});
  await p.waitForFunction(()=>document.querySelector('audio').currentTime>.1,null,{polling:100});
  assert.equal(await p.locator('audio').evaluate(a=>a.paused),false);
  assert.equal(await p.evaluate(()=>navigator.mediaSession.metadata.title),title);
 }
 assert.ok(await a.evaluate(a=>a===document.querySelector('audio')));
 await p.bringToFront();await p.waitForFunction(()=>!document.hidden);
 const visibility=await p.evaluate(()=>visibilityLog);
 if(hidden)assert.ok(visibility.includes('hidden') && visibility.includes('visible'));
 const result={browser:b.version(),actualDocumentHidden:hidden,continuedTime:true,chapterTransitionsWithOtherTabSelected:3,protocolFreezeRecovery:true,sameAudioElement:true,mediaMetadataUpdated:true,restoredForeground:true,visibilityLog:visibility,scope:hidden?'Real headed desktop hidden tab and CDP frozen/active recovery; not mobile OS lock':'Headed other-tab playback plus CDP frozen/active recovery; host continued reporting visible, so true hidden/OS suspension is not claimed'};
 await fs.writeFile('.local/qa/background.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}

