/** Symmetric depth around the actual sentence; stable between play and pause. */
export function lyricDepth(distance:number){
 const d=Math.abs(distance),focus=Math.exp(-Math.pow(d/2.4,2));
 return {blur:d===0?0:3.4*(1-focus),opacity:d===0?1:.4+.48*focus};
}
/** The whole rail hit area uses the same coordinate system, including iOS touch. */
export function scrubValue(clientX:number,left:number,width:number){
 return Math.round(Math.max(0,Math.min(1,(clientX-left)/Math.max(1,width)))*1000);
}
