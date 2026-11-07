import {defineConfig} from '@playwright/test';
import local from './playwright.config';
// Workers inherit this run ID; independent invocations must never clear each other's traces.
const runId=process.env.EAR_ONLINE_RUN_ID??=Date.now()+'-'+process.pid;
export default defineConfig({testDir:'./tests/online',workers:2,retries:0,timeout:90000,expect:{timeout:60000},reporter:[['list'],['json',{outputFile:'.local/qa/online-'+runId+'.json'}]],outputDir:'.local/online-results/'+runId,projects:process.env.EAR_ONLINE_CI_ONLY==='1'?local.projects!.filter(p=>p.name==='android-chrome'):local.projects,use:{baseURL:process.env.EAR_ONLINE_URL,serviceWorkers:'allow',trace:'retain-on-failure'}});

