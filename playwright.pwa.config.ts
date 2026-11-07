import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests/pwa',timeout:60000,workers:1,retries:0,reporter:[['list'],['json',{outputFile:'.local/qa/pwa.json'}]],use:{...devices['Pixel 7'],channel:process.platform==='win32'?'chrome':undefined,serviceWorkers:'allow'},outputDir:'.local/pwa-results'});

