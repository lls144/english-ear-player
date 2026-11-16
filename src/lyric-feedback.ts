import {isScrollGesture} from './lyric-motion';
/** Press feedback never changes layout, playback or the stable sentence lock. */
export class LyricFeedback{
 private pressed?:{row:HTMLElement;id:number;x:number;y:number};
 private active?:HTMLElement;private animation?:Animation;private timer?:ReturnType<typeof setTimeout>;private releaseFrame=0;private settleFrame=0;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(root:HTMLElement){
  root.addEventListener('pointerdown',e=>{const row=(e.target as Element).closest<HTMLElement>('.sentence');if(!row||e.button>0)return;this.clear();this.pressed={row,id:e.pointerId,x:e.clientX,y:e.clientY};row.classList.add('is-pressing');},{passive:true});
  window.addEventListener('pointermove',e=>{const p=this.pressed;if(p&&p.id===e.pointerId&&isScrollGesture(e.clientX,e.clientY,p.x,p.y))this.clear();},{passive:true});
  window.addEventListener('pointerup',()=>{const pressed=this.pressed;if(pressed)this.releaseFrame=requestAnimationFrame(()=>{this.releaseFrame=0;if(this.pressed===pressed){pressed.row.classList.remove('is-pressing');this.pressed=undefined;}});},{passive:true});
  window.addEventListener('pointercancel',()=>this.clear(),{passive:true});window.addEventListener('blur',()=>this.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
 }
 activate(row:HTMLElement){
  const body=row.querySelector<HTMLElement>('.lyric-body')!;
  const transform=getComputedStyle(body).transform,from=transform==='none'?1:new DOMMatrixReadOnly(transform).a;
  this.clear();this.active=row;row.classList.add('is-picked');
  if(this.reduced.matches){this.timer=setTimeout(()=>this.clear(),180);return;}
  const keyframes=from<=.98?[{transform:`scale(${from})`},{transform:'scale(1.045)'}]:[{transform:`scale(${from})`,offset:0},{transform:'scale(.965)',offset:.22},{transform:'scale(1.045)',offset:1}];
  const rise=body.animate(keyframes,{duration:from<=.98?180:260,easing:'cubic-bezier(.2,.65,.3,1)',fill:'both'});this.animation=rise;
  void rise.finished.then(()=>{
   if(this.active!==row||this.animation!==rise)return;
   // Hold the compositor's peak across a real paint. A wall-clock timeout could
   // erase the whole rebound while a busy/slow renderer supplied no frames.
   this.settleFrame=requestAnimationFrame(()=>{this.settleFrame=requestAnimationFrame(()=>{
    this.settleFrame=0;if(this.active!==row||this.animation!==rise)return;
    const settle=body.animate([{transform:'scale(1.045)'},{transform:'scale(1.03)'}],{duration:160,easing:'ease-out',fill:'both'});this.animation=settle;rise.cancel();
    void settle.finished.then(()=>{if(this.active!==row||this.animation!==settle)return;this.settleFrame=requestAnimationFrame(()=>{this.settleFrame=0;if(this.active===row&&this.animation===settle)this.clear();});}).catch(()=>{});
   });});
  }).catch(()=>{});
 }
 clear(){clearTimeout(this.timer);cancelAnimationFrame(this.releaseFrame);cancelAnimationFrame(this.settleFrame);this.releaseFrame=0;this.settleFrame=0;this.animation?.cancel();this.animation=undefined;this.pressed?.row.classList.remove('is-pressing');this.pressed=undefined;this.active?.classList.remove('is-picked');this.active=undefined;}
}
