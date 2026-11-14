import {existsSync} from 'node:fs';
import path from 'node:path';
// Windows browser binaries stay on the project drive; Linux CI uses its normal cache.
// The publisher resolves this before entering an isolated worktree.
export function browserEnv(env=process.env,directory=process.cwd(),platform=process.platform){
 const folder=path.join(directory,'.local/browsers');
 return platform==='win32'&&!env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(folder)?{...env,PLAYWRIGHT_BROWSERS_PATH:folder}:{...env};
}
