import {spawn} from 'node:child_process';
import path from 'node:path';
const python=process.env.EAR_PYTHON??path.resolve(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const child=spawn(python,['scripts/generate_audio.py','--register',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);

