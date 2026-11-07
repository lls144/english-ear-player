import library from './library.generated.json';
export function setupPwa(isPlaying=()=>false){
 if(!import.meta.env.PROD||!('serviceWorker' in navigator))return;
 const badge=document.createElement('span');badge.className='version-note';badge.textContent='V'+library.version;document.querySelector('footer')?.append(badge);
 const register=()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'}).then(reg=>{void reg.update().catch(()=>{});}).catch(()=>{});
 if(document.readyState==='complete')void register();else window.addEventListener('load',()=>void register(),{once:true});
 let checking=false;
 async function check(returning=false){
  if(checking||!navigator.onLine)return;checking=true;
  try{
   const r=await fetch(new URL('version.json?check='+Date.now(),document.baseURI),{cache:'no-store',signal:AbortSignal.timeout(10000)}),v=r.ok?await r.json():null;
   if(v&&(v.contentVersion!==library.contentVersion||v.version!==library.version)){
    badge.textContent='新版本已就绪';
    let update=document.getElementById('update-app');
    if(!update){update=document.createElement('button');update.id='update-app';update.textContent='更新';update.setAttribute('aria-label','载入新版本');update.addEventListener('click',()=>{if(!isPlaying())location.reload();else badge.textContent='暂停后可更新';});document.querySelector('.app-header')?.append(update);}
    if(returning&&!isPlaying()&&sessionStorage.getItem('english-ear-refresh')!==v.contentVersion){sessionStorage.setItem('english-ear-refresh',v.contentVersion);location.reload();}
   }
  }catch{/* Offline and optional storage failures do not interrupt audio. */}finally{checking=false;}
 }
 void check();window.addEventListener('pageshow',event=>{if(event.persisted)void check(true);});document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check(true);});
}
