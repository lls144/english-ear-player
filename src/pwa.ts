import library from './library.generated.json';
export function setupPwa(){
 if(!import.meta.env.PROD||!('serviceWorker' in navigator))return;
 const badge=document.createElement('span');badge.className='version-note';badge.textContent='V'+library.version;document.querySelector('footer')?.append(badge);
 const register=()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'})
  .then(reg=>{void reg.update().catch(()=>{});}).catch(()=>{badge.textContent='V'+library.version+' · 在线模式';});
 if(document.readyState==='complete')void register();else window.addEventListener('load',()=>void register(),{once:true});
 fetch(new URL('version.json?check='+Date.now(),document.baseURI),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{
  if(v&&v.contentVersion!==library.contentVersion)badge.textContent='新版本已就绪 · 下次打开生效';
 }).catch(()=>{});
}

