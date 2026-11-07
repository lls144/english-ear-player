import {spawn} from 'node:child_process';
import path from 'node:path';
import {existsSync} from 'node:fs';
const local=path.resolve(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const executable=process.env.EAR_PYTHON??(existsSync(local)?local:'python');
const child=spawn(executable,['scripts/check_audio.py'],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??1);
