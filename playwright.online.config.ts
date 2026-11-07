import {defineConfig} from '@playwright/test';
import local from './playwright.config';
export default defineConfig({testDir:'./tests/online',workers:2,retries:0,timeout:45000,expect:{timeout:12000},reporter:[['list'],['json',{outputFile:'.local/qa/online.json'}]],outputDir:'.local/online-results',projects:process.env.EAR_ONLINE_CI_ONLY==='1'?local.projects!.filter(p=>p.name==='android-chrome'):local.projects,use:{baseURL:process.env.EAR_ONLINE_URL,serviceWorkers:'allow',trace:'retain-on-failure'}});

