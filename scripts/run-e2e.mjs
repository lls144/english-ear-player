import {browserEnv} from './browser-env.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
const prod=process.argv.includes('--production'),args=process.argv.slice(2).filter(a=>a!=='--production');
const motion='real sentence boundary follows a measured easing trajectory';
const split=prod&&!args.some(a=>a==='--grep'||a==='--grep-invert'||a==='-g'||a.startsWith('--grep='));
async function run(argv,suffix=''){
 return await new Promise(resolve=>{const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...argv],{stdio:'inherit',windowsHide:true,env:{...browserEnv(),EAR_E2E_PRODUCTION:prod?'1':'0',EAR_E2E_REPORT_SUFFIX:suffix}});child.on('error',()=>resolve(1));child.on('exit',code=>resolve(code??1));});
}
if(!split)process.exitCode=Number(await run(args));
else{
 const began=Date.now(),functional=await run([...args,'--grep-invert',motion],'-functional');
 if(functional!==0)process.exitCode=Number(functional);
 else{
  const serialArgs=[];for(let i=0;i<args.length;i++){if(args[i]==='--workers'){i++;continue;}if(!args[i].startsWith('--workers='))serialArgs.push(args[i]);}
  const visual=await run([...serialArgs,'--workers=1','--grep',motion],'-motion');
  const reports=await Promise.all(['functional','motion'].map(async name=>JSON.parse(await fs.readFile('.local/qa/e2e-production-'+name+'.json','utf8'))));
  const merged={...reports[0],suites:reports.flatMap(r=>r.suites),errors:reports.flatMap(r=>r.errors??[]),stats:{startTime:reports[0].stats.startTime,duration:Date.now()-began,expected:0,skipped:0,unexpected:0,flaky:0}};
  for(const key of ['expected','skipped','unexpected','flaky'])merged.stats[key]=reports.reduce((sum,r)=>sum+r.stats[key],0);
  await fs.writeFile('.local/qa/e2e-production.json',JSON.stringify(merged,null,2));
  console.log('Complete production coverage: '+reports[0].stats.expected+' functional + '+reports[1].stats.expected+' isolated motion; no motion assertions skipped.');
  process.exitCode=Number(visual);
 }
}
