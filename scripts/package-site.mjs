import fs from 'node:fs/promises';
import path from 'node:path';
import {root,readJson,sha} from './content.mjs';
export async function workerFor(directory){
 async function walk(d){return (await Promise.all((await fs.readdir(d,{withFileTypes:true})).map(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]))).flat();}
 const files=(await walk(directory)).filter(p=>!p.endsWith('sw.js'));
 const meta=JSON.parse(await fs.readFile(path.join(directory,'version.json'),'utf8'));
 const primary=new Set(Object.values(meta.defaultAudio??meta.audio));
 const entries=await Promise.all(files.sort().map(async p=>{const url=path.relative(directory,p).replaceAll('\\','/');return {url,sha256:sha(await fs.readFile(p)),precache:!url.endsWith('.mp3')||primary.has(url)};}));
 const buildId=sha(JSON.stringify(entries)).slice(0,24);
 const template=await fs.readFile(path.join(root,'scripts/service-worker.template.js'),'utf8');
 return template.replace('__BUILD_ID__',JSON.stringify(buildId)).replace('__PRECACHE__',JSON.stringify(entries));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(root,'scripts/package-site.mjs')){
 const library=await readJson('src/library.generated.json'),dist=path.join(root,'dist');
 const allAudio=Object.fromEntries(Object.entries(library.audioModes).flatMap(([mode,entries])=>Object.entries(entries).map(([id,file])=>[id+(mode==='continuous'?'':'-'+mode),file])));
 const allowed=new Set(Object.values(allAudio).map(p=>path.resolve(dist,p)));
 async function walk(d){return (await Promise.all((await fs.readdir(d,{withFileTypes:true})).map(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]))).flat();}
 for(const file of await walk(path.join(dist,'assets/audio')))if(!allowed.has(path.resolve(file)))await fs.unlink(file);
 const meta={version:library.version,contentVersion:library.contentVersion,chapters:library.chapters.map(c=>({id:c.id,title:c.title,segments:c.segments.length})),audio:allAudio,defaultAudio:library.audio};
 await fs.writeFile(path.join(dist,'version.json'),JSON.stringify(meta,null,2)+'\n');
 await fs.writeFile(path.join(dist,'sw.js'),await workerFor(dist));
 console.log('Packaged '+library.version+', '+allowed.size+' content-addressed MP3s and an atomic PWA cache.');
}

