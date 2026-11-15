import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
if(process.argv.includes('--patch-only')){
 const file='src/player.ts',s=await fs.readFile(file,'utf8');
 const a="try { await this.audio.play();if(expected===this.token&&this.settings.mode==='audio'&&this.wantedPlayback)this.observeStartup(expected,retrying); }";
 if(!s.includes(a))throw Error('Expected exact baseline');
 await fs.writeFile(file,s.replace(a,"this.observeStartup(expected,retrying);\n    try { await this.audio.play(); }"));process.exit(0);
}
const {webkit,devices}=await import('@playwright/test');
const children=[spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort','--base','/english-ear-player/'],{stdio:'ignore'}),spawn(process.execPath,['scripts/e2e-server.mjs'],{stdio:'ignore',env:{...process.env,EAR_E2E_PRODUCTION:'1'}})];
const proxy=process.env.PROBE_TRANSPORT==='proxy',base='http://127.0.0.1:'+(proxy?'5185':'4173')+'/english-ear-player/';
let browser;const result={mode:process.env.PROBE_MODE,transport:process.env.PROBE_TRANSPORT,trials:[],stalls:[]};
try{
 for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break;}catch{}await sleep(100);}
 browser=await webkit.launch();
 for(let round=0;round<4;round++){
  const context=await browser.newContext({...devices[round%2?'iPhone 13 landscape':'iPad Mini'],serviceWorkers:'block'}),page=await context.newPage();
  await page.addInitScript(()=>{
   const w=window;w.__probe=[];w.__calls=[];
   const snapshot=a=>({ms:performance.now(),time:a.currentTime,paused:a.paused,ready:a.readyState,network:a.networkState,seeking:a.seeking,duration:a.duration,source:a.currentSrc,buffered:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)]),error:a.error?.code});
   const native=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){const c={...snapshot(this),state:'pending'};w.__calls.push(c);const p=native.call(this);p.then(()=>{c.state='resolved';c.finished=snapshot(this);},e=>{c.state='rejected';c.error=String(e);});return p;};
   for(const type of ['play','playing','pause','waiting','canplay','loadedmetadata','seeking','seeked','stalled','suspend','error','progress'])document.addEventListener(type,e=>{if(e.target instanceof HTMLMediaElement)w.__probe.push({type,...snapshot(e.target)});},true);
  });
  await page.goto(base+(proxy?'sessions/probe-'+round+'/':''));
  const ids=await page.locator('[data-chapter]').evaluateAll(es=>es.map(e=>e.dataset.chapter));
  const trial={round,starts:0,stalls:0};
  for(const id of ids){
   await page.locator('[data-chapter="'+id+'"]').click();await page.waitForTimeout(130);
   if(await page.locator('audio').evaluate(a=>a.paused))await page.locator('#play').click();
   trial.starts++;
   try{await page.waitForFunction(()=>{const a=document.querySelector('audio');return !a.paused&&a.currentTime>.12;},null,{timeout:6000});}
   catch{
    trial.stalls++;
    const record={round,id,...await page.evaluate(()=>{const a=document.querySelector('audio');return {time:a.currentTime,paused:a.paused,ready:a.readyState,network:a.networkState,seeking:a.seeking,source:a.currentSrc,duration:a.duration,buffered:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)]),events:window.__probe.slice(-60),calls:window.__calls.slice(-16)};})};
    for(const strategy of ['play','pause-play','reload-play']){
     await page.evaluate(strategy=>{const a=document.querySelector('audio');if(strategy==='pause-play')a.pause();if(strategy==='reload-play')a.load();void a.play().catch(()=>{});},strategy);
     try{await page.waitForFunction(()=>document.querySelector('audio').currentTime>.2,null,{timeout:1500});record.recoveredBy=strategy;break;}catch{}
    }
    result.stalls.push(record);
   }
  }
  result.trials.push(trial);await context.close();console.log(JSON.stringify(trial));
 }
 console.log(JSON.stringify({mode:result.mode,transport:result.transport,starts:result.trials.reduce((n,t)=>n+t.starts,0),stalls:result.stalls.length}));
}finally{await fs.mkdir('.local/qa',{recursive:true});await fs.writeFile('.local/qa/webkit-startup-probe.json',JSON.stringify(result,null,2));await browser?.close();for(const child of children)child.kill();}
