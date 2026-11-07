const CACHE='english-ear-'+__BUILD_ID__;
const ENTRIES=__PRECACHE__;
const BASE=new URL('./',self.location.href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{
  for(const item of ENTRIES){
   const url=new URL(item.url,BASE),response=await fetch(url,{cache:'reload'});
   if(!response.ok)throw Error('Incomplete release asset');
   const bytes=await response.clone().arrayBuffer();
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==item.sha256)throw Error('Release integrity mismatch');
   await cache.put(url,response);
  }
 }catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=(await caches.keys()).filter(n=>n.startsWith('english-ear-')),previous=names.filter(n=>n!==CACHE).at(-1);
 await Promise.all(names.filter(n=>n!==CACHE&&n!==previous).map(n=>caches.delete(n)));
 await self.clients.claim();
})()));
async function ranged(response,range){
 const bytes=await response.arrayBuffer(),total=bytes.byteLength,m=/^bytes=(\d*)-(\d*)$/.exec(range);
 if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+total}});
 const start=m[1]?Number(m[1]):Math.max(0,total-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(total-1,Number(m[2])):total-1):total-1;
 if(start>end||start>=total)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+total}});
 const headers=new Headers(response.headers);headers.set('Content-Range','bytes '+start+'-'+end+'/'+total);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
 return new Response(bytes.slice(start,end+1),{status:206,headers});
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>{const cache=await caches.open(CACHE);return cache.match(new URL('index.html',BASE));}));return;}
 if(url.pathname.endsWith('/version.json')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 event.respondWith((async()=>{
  const cached=await caches.match(request.url,{ignoreSearch:false});
  if(cached)return request.headers.has('range')?ranged(cached,request.headers.get('range')):cached;
  return fetch(request);
 })());
});

