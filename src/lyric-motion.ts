export type ViewBounds={top:number;bottom:number};
export function focusDestination(top:number,height:number,scroll:number,bounds:ViewBounds,maxScroll:number){
 const available=Math.max(80,bounds.bottom-bounds.top);
 const anchor=height>available?bounds.top+8:bounds.top+(available-height)*.30;
 return Math.max(0,Math.min(maxScroll,scroll+top-anchor));
}
/** Damped oscillator: about one small rebound, never a repeating bounce. */
export function springFrame(seconds:number,distance:number,velocity=0){
 const omega=21,zeta=.84,decay=zeta*omega,damped=omega*Math.sqrt(1-zeta*zeta),t=Math.max(0,seconds);
 const a=-distance,b=(velocity-decay*distance)/damped,e=Math.exp(-decay*t),c=Math.cos(damped*t),s=Math.sin(damped*t);
 const offset=e*(a*c+b*s),speed=e*((-a*damped*s+b*damped*c)-decay*(a*c+b*s));
 const raw=distance+offset,cap=Math.min(8,Math.abs(distance)*.012);
 return {position:Math.max(Math.min(0,distance)-cap,Math.min(Math.max(0,distance)+cap,raw)),velocity:speed};
}
export const focusEase=(t:number)=>t<=0?0:t>=1?1:springFrame(t*.6,1).position;
export const isScrollGesture=(x:number,y:number,startX:number,startY:number)=>Math.hypot(x-startX,y-startY)>9;
// A delayed frame must not jump over most of the visible spring trajectory.
export const motionStep=(milliseconds:number,quiet=false)=>Math.max(0,Math.min(quiet?50:32,milliseconds))/1000;
export const shouldReduceEffects=(intervals:number[])=>{const samples=intervals.filter(n=>n>0&&n<250);const elapsed=samples.reduce((n,t)=>n+t,0);return samples.length>=10&&elapsed>=1500&&samples.filter(n=>n>80).length/samples.length>=.8||samples.length>=48&&elapsed>=4000&&samples.filter(n=>n>40).length/samples.length>=.7;};
export type FollowState='FOLLOWING'|'USER_INTERACTING'|'MOMENTUM_SCROLLING'|'AWAITING_NEXT_LINE'|'ANIMATING_TO_LINE';
export class FollowMachine{
 state:FollowState='FOLLOWING';lastManual=0;pendingBoundary=false;
 get browsing(){return ['USER_INTERACTING','MOMENTUM_SCROLLING','AWAITING_NEXT_LINE'].includes(this.state);}
 begin(now:number){this.pendingBoundary=false;this.lastManual=now;this.state='USER_INTERACTING';}
 move(now:number,held:boolean){this.lastManual=now;this.state=held?'USER_INTERACTING':'MOMENTUM_SCROLLING';}
 release(now:number){this.lastManual=now;this.state='MOMENTUM_SCROLLING';}
 boundary(){if(this.state==='USER_INTERACTING'||this.state==='MOMENTUM_SCROLLING'){this.pendingBoundary=true;return false;}return true;}
 settle(now:number){if(this.state!=='MOMENTUM_SCROLLING'||now-this.lastManual<180)return false;this.state='AWAITING_NEXT_LINE';return this.pendingBoundary;}
 animate(){this.pendingBoundary=false;this.state='ANIMATING_TO_LINE';}
 finish(){if(this.state==='ANIMATING_TO_LINE')this.state='FOLLOWING';}
 reset(){this.pendingBoundary=false;this.state='FOLLOWING';}
}

/** A shared spring with bounded row lag, not independent random row springs. */
export function cascadeOffset(seconds:number,distance:number,velocity:number,delay:number,initial=0,cap=24){
 const lead=springFrame(seconds,distance,velocity).position,tail=seconds<=delay?0:springFrame(seconds-delay,distance,velocity).position;
 const lag=Math.max(-cap,Math.min(cap,lead-tail)),carry=Math.exp(-Math.max(0,seconds)*20);
 return initial*carry+lag*(1-carry);
}
