import{test as base}from'@playwright/test';
export*from'@playwright/test';

// Assertions finish before cleanup. Release native decoders before destroying
// the context so sequential Windows WebKit tests cannot retain media sessions.
export const test=base.extend<{nativeMediaCleanup:void}>({
 nativeMediaCleanup:[async({page},use,info)=>{
  await use();
  for(const current of page.context().pages()){
   if(current.isClosed())continue;
   try{await current.evaluate(()=>{
    const play=document.querySelector<HTMLButtonElement>('#play');if(play?.getAttribute('aria-label')==='暂停')play.click();
    for(const audio of document.querySelectorAll('audio')){audio.loop=false;audio.pause();audio.removeAttribute('src');audio.load();}
    window.speechSynthesis?.cancel();
   });}catch(error){if(info.status===info.expectedStatus&&!current.isClosed())throw error;}
  }
 },{auto:true}]
});
