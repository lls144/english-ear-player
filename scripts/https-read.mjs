import {setTimeout as delay} from 'node:timers/promises';
/** Retry only transport/interrupted-body and transient HTTP failures, never bad bytes or 404. */
export async function readHttpsBytes(url,{attempts=4,timeoutMs=90000,fetcher=globalThis.fetch,wait=delay}={}){
 if(!String(url).startsWith('https://'))throw Error('Formal asset verification requires HTTPS');
 for(let attempt=0;attempt<attempts;attempt++)try{
  const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw Object.assign(Error('Formal HTTPS HTTP '+response.status),{httpStatus:response.status});
  return {bytes:Buffer.from(await response.arrayBuffer()),status:response.status};
 }catch(error){
  if(attempt===attempts-1||error.httpStatus&&![408,429,500,502,503,504].includes(error.httpStatus))throw error;
  await wait(300*2**attempt);
 }
 throw Error('No HTTPS attempts configured');
}
