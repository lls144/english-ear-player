import {type Page,type TestInfo} from '@playwright/test';

export async function installMediaDiagnostics(page:Page){
 await page.addInitScript(()=>{
  (window as any).__mediaLog=[];
  for(const type of ['loadstart','emptied','loadedmetadata','canplay','playing','waiting','stalled','pause','error','seeking','seeked','ended','ratechange'])document.addEventListener(type,event=>{
   const a=event.target;if(!(a instanceof HTMLMediaElement))return;
   const log=(window as any).__mediaLog;log.push({event:type,at:performance.now(),src:a.currentSrc,time:a.currentTime,duration:a.duration,paused:a.paused,ready:a.readyState,network:a.networkState,seeking:a.seeking,error:a.error?.code});if(log.length>400)log.shift();
  },true);
 });
}
export async function attachFailedMedia(page:Page,info:TestInfo){
 if(info.status===info.expectedStatus)return;
 const state=await page.evaluate(()=>{const a=document.querySelector('audio')!;return {src:a.currentSrc,time:a.currentTime,duration:a.duration,paused:a.paused,ready:a.readyState,network:a.networkState,seeking:a.seeking,error:a.error?.code,button:document.getElementById('play')?.getAttribute('aria-label'),buffered:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)]),events:(window as any).__mediaLog};}).catch(e=>({diagnosticError:String(e)}));
 await info.attach('failed-native-media-state',{body:JSON.stringify(state),contentType:'application/json'});
}
