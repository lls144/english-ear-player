import {spawn} from 'node:child_process';
const prod=process.argv.includes('--production');
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2).filter(a=>a!=='--production')],{stdio:'inherit',windowsHide:true,env:{...process.env,EAR_E2E_PRODUCTION:prod?'1':'0'}});
child.on('exit',code=>process.exitCode=code??1);

