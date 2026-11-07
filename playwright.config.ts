import {defineConfig,devices} from '@playwright/test';
const prod=process.env.EAR_E2E_PRODUCTION==='1';
export default defineConfig({
 testDir:'./tests/e2e',timeout:35000,expect:{timeout:8000},workers:2,retries:0,
 reporter:[['list'],['json',{outputFile:prod?'.local/qa/e2e-production.json':'.local/qa/e2e-development.json'}]],
 outputDir:'.local/playwright-results',
 use:{baseURL:prod?'http://127.0.0.1:5185/english-ear-player/':'http://127.0.0.1:5184/',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[{command:prod?'npm run preview -- --host 127.0.0.1 --base /english-ear-player/':'npm run dev -- --host 127.0.0.1',url:prod?'http://127.0.0.1:4173/english-ear-player/':'http://127.0.0.1:5173/',reuseExistingServer:!prod,timeout:30000},{command:'node scripts/e2e-server.mjs',url:prod?'http://127.0.0.1:5185/english-ear-player/':'http://127.0.0.1:5184/',reuseExistingServer:false,timeout:30000}],
 projects:[
 {name:'edge-desktop',use:{...devices['Desktop Edge'],channel:process.platform==='win32'?'msedge':undefined}},
 {name:'android-chrome',use:{...devices['Pixel 7'],channel:process.platform==='win32'?'chrome':undefined}},
 {name:'small-android',use:{...devices['Pixel 7'],channel:process.platform==='win32'?'chrome':undefined,viewport:{width:320,height:568}}},
 {name:'iphone-webkit',use:{...devices['iPhone 13'],browserName:'webkit'}},
 {name:'ipad-webkit',use:{...devices['iPad Mini'],browserName:'webkit'}},
 {name:'landscape-webkit',use:{...devices['iPhone 13 landscape'],browserName:'webkit'}}
 ]});

