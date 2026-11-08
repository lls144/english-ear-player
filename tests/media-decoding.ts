import {expect,type Page,type TestInfo} from '@playwright/test';
import fs from 'node:fs';
const receipts=JSON.parse(fs.readFileSync('content/audio-provenance.json','utf8'));

// Native browser decoder, separate from FFmpeg and actual <audio> playback tests.
export async function decodeEveryMP3(page:Page,files:Record<string,string>,info:TestInfo){
 const results=await page.evaluate(async(entries:[string,string][])=>{
  const decoder=new OfflineAudioContext(1,1,24000),out:{id:string;duration:number;rms:number;peak:number;edgePeak:number}[]=[];
  for(let offset=0;offset<entries.length;offset+=3){
   const batch=await Promise.all(entries.slice(offset,offset+3).map(async([id,url])=>{
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Missing MP3 '+id);
    const decoded=await decoder.decodeAudioData(await response.arrayBuffer()),pcm=decoded.getChannelData(0);let energy=0,peak=0,edgePeak=0;
    for(let i=0;i<pcm.length;i++){energy+=pcm[i]*pcm[i];peak=Math.max(peak,Math.abs(pcm[i]));if(i<600||i>pcm.length-600)edgePeak=Math.max(edgePeak,Math.abs(pcm[i]));}
    return {id,duration:decoded.duration,rms:Math.sqrt(energy/pcm.length),peak,edgePeak};
   }));out.push(...batch);
  }return out;
 },Object.entries(files));
 expect(results.length).toBe(Object.keys(files).length);
 for(const r of results){expect(r.duration,r.id).toBeGreaterThan(1);expect(Math.abs(r.duration-receipts.find((x:any)=>x.id===r.id).durationSeconds),r.id+' decoder delay').toBeLessThan(.06);expect(r.rms,r.id).toBeGreaterThan(.004);expect(r.peak,r.id).toBeGreaterThan(.05);expect(r.peak,r.id).toBeLessThan(.99);expect(r.edgePeak,r.id+' decoded edge').toBeLessThan(.003);}
 await info.attach('all-MP3-native-browser-decoding',{body:JSON.stringify(results),contentType:'application/json'});
}
