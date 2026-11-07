import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {workerFor} from '../../scripts/package-site.mjs';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('verified PWA update preserves playing old assets, then serves new bytes on reopen',async({browser})=>{
 const fixture=await fs.mkdtemp(path.resolve('.local/qa/pwa-'));
 const a=path.join(fixture,'a'),b=path.join(fixture,'b');await fs.cp('dist',a,{recursive:true});await fs.cp('dist',b,{recursive:true});
 const meta=JSON.parse(await fs.readFile(path.join(b,'version.json'),'utf8')),old=meta.audio.picture;
 const original=await fs.readFile(path.join(b,old));
 // A valid ID3v1 metadata-only change keeps the same spoken text but changes MP3 bytes.
 const id3=Buffer.alloc(128);id3.write('TAG');id3.write('PWA update regression',3);const updated=Buffer.concat([original,id3]);
 const next='assets/audio/generated/picture.'+sha(updated).slice(0,16)+'.mp3';
 await fs.writeFile(path.join(b,next),updated);await fs.unlink(path.join(b,old));meta.audio.picture=next;
 const priorVersion=meta.contentVersion;meta.contentVersion='pwa-regression-'+sha(updated).slice(0,8);
 await fs.writeFile(path.join(b,'version.json'),JSON.stringify(meta,null,2)+'\n');
 const js=(await fs.readdir(path.join(b,'assets'))).find(n=>/^index-.*\.js$/.test(n))!;
 let script=await fs.readFile(path.join(b,'assets',js),'utf8');script=script.split(old).join(next).split(priorVersion).join(meta.contentVersion);
 const nextJs='index-'+sha(Buffer.from(script)).slice(0,12)+'.js';
 await fs.writeFile(path.join(b,'assets',nextJs),script);await fs.unlink(path.join(b,'assets',js));
 const html=(await fs.readFile(path.join(b,'index.html'),'utf8')).split(js).join(nextJs);await fs.writeFile(path.join(b,'index.html'),html);
 await fs.writeFile(path.join(b,'sw.js'),await workerFor(b));
 let active=a;
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url!,'http://localhost').pathname);
   const relative=pathname.replace(/^\/reader\//,'')||'index.html';
   const file=path.resolve(active,relative);if(!file.startsWith(active+path.sep))throw Error('Bad path');
   const body=await fs.readFile(file),type=file.endsWith('.js')?'application/javascript':file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/json';
   res.writeHead(200,{'content-type':type,'content-length':body.length,'cache-control':'no-store','service-worker-allowed':'/reader/'});res.end(body);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+(server.address() as any).port+'/reader/';
 const context=await browser.newContext({serviceWorkers:'allow'}),p=await context.newPage();
 try{
  await p.goto(url);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const oldCaches=await p.evaluate(()=>caches.keys());expect(oldCaches.length).toBe(1);
  await p.locator('#play').click();await expect.poll(()=>p.locator('audio').evaluate((x:HTMLAudioElement)=>x.currentTime)).toBeGreaterThan(.1);
  const element=await p.locator('audio').elementHandle();active=b;
  await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();});
  await p.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);
  expect(await element!.evaluate(e=>e===document.querySelector('audio'))).toBe(true);
  expect(await p.locator('audio').evaluate((x:HTMLAudioElement)=>x.paused)).toBe(false);
  const range=await p.evaluate(async name=>{const r=await fetch(name,{headers:{Range:'bytes=0-127'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength};},old);
  expect(range).toEqual({status:206,length:128});
  expect(await p.locator('audio').evaluate((x:HTMLAudioElement)=>x.currentSrc)).toContain(old);
  await p.close();const newer=await context.newPage();await newer.goto(url);
  await newer.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await newer.locator('#play').click();await expect.poll(()=>newer.locator('audio').evaluate((x:HTMLAudioElement)=>x.currentTime)).toBeGreaterThan(.1);
  await context.setOffline(false);
  const c=path.join(fixture,'incomplete');await fs.cp(b,c,{recursive:true});
  const brokenMeta={...meta,contentVersion:'incomplete-candidate'};
  await fs.writeFile(path.join(c,'version.json'),JSON.stringify(brokenMeta));
  await fs.writeFile(path.join(c,'sw.js'),await workerFor(c));
  await fs.unlink(path.join(c,next));active=c;
  const beforeFailed=await newer.evaluate(()=>caches.keys());
  const rejected=await newer.evaluate(async()=>{
   const reg=(await navigator.serviceWorker.getRegistration())!;
   const failed=new Promise<boolean>(resolve=>reg.addEventListener('updatefound',()=>{
    const worker=reg.installing!;worker.addEventListener('statechange',()=>{if(worker.state==='redundant')resolve(true);});
   },{once:true}));
   await reg.update();return failed;
  });
  expect(rejected).toBe(true);expect(await newer.evaluate(()=>caches.keys())).toEqual(beforeFailed);
  expect(await newer.locator('audio').evaluate((x:HTMLAudioElement)=>x.paused)).toBe(false);
  expect(await newer.locator('audio').evaluate((x:HTMLAudioElement)=>x.currentSrc)).toContain(next);
  const bytes=Buffer.from(await newer.evaluate(async file=>[...new Uint8Array(await(await fetch(file)).arrayBuffer())],next));expect(sha(bytes)).toBe(sha(updated));
  await context.setOffline(true);await newer.reload();await expect(newer.locator('#chapter-title')).toHaveText('首段描图');
  await newer.locator('#play').click();await expect.poll(()=>newer.locator('audio').evaluate((x:HTMLAudioElement)=>x.currentTime)).toBeGreaterThan(.1);
 }finally{await context.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('service worker waits for complete verified assets and never uses skipWaiting',async()=>{
 const worker=await fs.readFile('dist/sw.js','utf8');
 expect(worker).not.toContain('skipWaiting(');expect(worker).toContain('crypto.subtle.digest');expect(worker).toContain('caches.delete(CACHE)');expect(worker).toContain("cache:'no-store'");
 const m=JSON.parse(await fs.readFile('dist/manifest.webmanifest','utf8'));expect(m.display).toBe('standalone');
 for(const icon of m.icons)expect((await fs.stat(path.join('dist',icon.src))).size).toBeGreaterThan(100);
});

