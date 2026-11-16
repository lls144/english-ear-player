import{test as base}from'@playwright/test';
export*from'@playwright/test';

// Windows' native browser/media backends must not share a long-lived process
// across unrelated cases. A whole case (including twenty real native wraps)
// keeps its one browser. No retry or assertion is hidden by this isolation.
// Playwright Test applies the configured context options and artifact hooks to
// newContext(), including mobile emulation, HTTPS proxy and failure traces.
const isolated=process.platform==='win32'?base.extend({
 context:async({playwright,browserName,headless,channel,launchOptions},use)=>{
  const browser=await playwright[browserName].launch({...launchOptions,headless,...(channel?{channel}:{})});
  try{const context=await browser.newContext();try{await use(context);}finally{await context.close();}}
  finally{await browser.close();}
 }
}):base;

// Assertions finish before cleanup. Release native decoders before destroying
// the context; a renderer crash still fails the case and retains its trace.
export const test=isolated.extend<{nativeMediaCleanup:void}>({
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
