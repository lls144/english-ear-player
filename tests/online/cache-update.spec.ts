import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const library=JSON.parse(fs.readFileSync('src/library.generated.json','utf8'));
const receipts=JSON.parse(fs.readFileSync('content/audio-provenance.json','utf8'));

test('formal HTTPS ignores an old HTML metadata and MP3 cache after reopening',async({page,baseURL})=>{
 test.setTimeout(90000);
 const errors:string[]=[],obsoleteRequests:string[]=[];
 page.on('pageerror',e=>errors.push(String(e)));
 // The manifest-only setup document may request the account-root favicon;
 // it is outside this project's Pages path and is not an app resource.
 const setupFavicon=new URL('/favicon.ico',baseURL!).href;
 page.on('console',m=>{if(m.type()==='error'&&m.location().url!==setupFavicon)errors.push(m.text());});
 page.on('request',r=>{if(r.url().includes('obsolete-release'))obsoleteRequests.push(r.url());});
 const navigation='./?cache-regression='+Date.now();
 // Establish the real origin without starting the app. The stale cache must
 // precede the current cache, as it would after a previous installed version.
 await page.goto('./manifest.webmanifest');
 // A previous installation may leave old cache entries on the same real origin.
 // Only this isolated browser profile is modified; all current resources use Pages.
 await page.evaluate(async navigation=>{
  const cache=await caches.open('english-ear-regression-old-version');
  const html='<html><body>Obsolete release<script src="obsolete-release.js"></script></body></html>';
  for(const file of ['index.html',navigation])await cache.put(new URL(file,document.baseURI),new Response(html,{headers:{'Content-Type':'text/html'}}));
  await cache.put(new URL('version.json',document.baseURI),new Response(JSON.stringify({version:'0.0.0',contentVersion:'obsolete-release'}),{headers:{'Content-Type':'application/json'}}));
  await cache.put(new URL('assets/audio/generated/obsolete-release.mp3',document.baseURI),new Response('obsolete audio'));
 },navigation);
 await page.goto(navigation);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:60000});
 expect((await page.evaluate(()=>caches.keys()))[0]).toBe('english-ear-regression-old-version');
 await page.reload();
 await expect(page.locator('#chapter-title')).toHaveText(library.chapters[0].title);
 const metadata=await page.evaluate(async()=>{const r=await fetch(new URL('version.json',document.baseURI));return r.json();});
 expect(metadata.version).toBe(library.version);expect(metadata.contentVersion).toBe(library.contentVersion);
 const chapter=library.chapters[2];await page.locator('[data-chapter="'+chapter.id+'"]').click();
 await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.duration)).toBeGreaterThan(0);
 await page.locator('#play').click();
 await expect.poll(()=>page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.1);
 expect(await page.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentSrc)).toContain(library.audio[chapter.id]);
 const digest=await page.evaluate(async file=>{
  const r=await fetch(new URL(file,document.baseURI)),data=await r.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
 },library.audio[chapter.id]);
 expect(digest).toBe(receipts.find((r:any)=>r.id===chapter.id).mp3Sha256);
 expect(obsoleteRequests).toEqual([]);expect(errors).toEqual([]);
 await page.evaluate(()=>caches.delete('english-ear-regression-old-version'));
});
