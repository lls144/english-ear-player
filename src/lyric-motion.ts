export type ViewBounds={top:number;bottom:number};
export function focusDestination(top:number,height:number,scroll:number,bounds:ViewBounds,maxScroll:number){
 const available=Math.max(80,bounds.bottom-bounds.top);
 const anchor=height>available?bounds.top+8:bounds.top+(available-height)*.36;
 return Math.max(0,Math.min(maxScroll,scroll+top-anchor));
}
export const focusEase=(t:number)=>1-Math.pow(1-Math.max(0,Math.min(1,t)),4);
export const isScrollGesture=(x:number,y:number,startX:number,startY:number)=>Math.hypot(x-startX,y-startY)>9;

export const shouldReduceEffects=(intervals:number[])=>intervals.length>=8&&intervals.slice(-8).filter(n=>n>40&&n<500).length>=6;
