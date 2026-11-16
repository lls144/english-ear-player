import {defineConfig} from '@playwright/test';
import local from './playwright.config';
// Workers inherit this run ID; independent invocations must never clear each other's traces.
const proxyAddress=process.env.EAR_ONLINE_PROXY?new URL(process.env.EAR_ONLINE_PROXY):null;
if(proxyAddress?.username||proxyAddress?.password)throw Error('Do not put proxy credentials into test reports');
const runId=process.env.EAR_ONLINE_RUN_ID??=Date.now()+'-'+process.pid;
const projects=process.env.EAR_ONLINE_CI_ONLY==='1'?local.projects!.filter(p=>p.name==='android-chrome'):local.projects!;
// The existing explicit proxy is scoped to this Windows WebKit run, not the OS.
// Other profiles and Linux CI keep their normal transport and exact HTTPS files.
export default defineConfig({testDir:'./tests/online',workers:process.platform==='win32'?1:2,retries:0,timeout:90000,expect:{timeout:60000},reporter:[['list'],['json',{outputFile:'.local/qa/online-'+runId+'.json'}]],outputDir:'.local/online-results/'+runId,projects:projects.map(p=>process.platform==='win32'&&p.use?.browserName==='webkit'&&proxyAddress?{...p,use:{...p.use,proxy:{server:proxyAddress.origin}}}:p),use:{baseURL:process.env.EAR_ONLINE_URL,serviceWorkers:'allow',trace:'retain-on-failure'}});

