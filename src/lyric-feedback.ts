import {isScrollGesture} from './lyric-motion';
/** Press feedback never changes layout, playback or the stable sentence lock. */
export class LyricFeedback{
 private pressed?:{row:HTMLElement;id:number;x:number;y:number};
 private active?:HTMLElement;private animation?:Animation;private timer?:ReturnType<typeof setTimeout>;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(root:HTMLElement){
  root.addEventListener('pointerdown',e=>{const row=(e.target as Element).closest<HTMLElement>('.sentence');if(!row||e.button>0)return;this.clear();this.pressed={row,id:e.pointerId,x:e.clientX,y:e.clientY};row.classList.add('is-pressing');},{passive:true});
  window.addEventListener('pointermove',e=>{const p=this.pressed;if(p&&p.id===e.pointerId&&isScrollGesture(e.clientX,e.clientY,p.x,p.y))this.clear();},{passive:true});
  window.addEventListener('pointerup',()=>{const row=this.pressed?.row;this.pressed=undefined;if(row)queueMicrotask(()=>row.classList.remove('is-pressing'));},{passive:true});
  window.addEventListener('pointercancel',()=>this.clear(),{passive:true});window.addEventListener('blur',()=>this.clear());
 }
 activate(row:HTMLElement){
  const body=row.querySelector<HTMLElement>('.lyric-body')!;
  const transform=getComputedStyle(body).transform,from=transform==='none'?1:new DOMMatrixReadOnly(transform).a;
  this.clear();this.active=row;row.classList.add('is-picked');
  if(!this.reduced.matches){this.animation=body.animate([{transform:`scale(${from})`,offset:0},{transform:'scale(.965)',offset:.18},{transform:'scale(1.045)',offset:.66},{transform:'scale(1.03)',offset:1}],{duration:430,easing:'cubic-bezier(.2,.65,.3,1)'});void this.animation.finished.catch(()=>{});}
  this.timer=setTimeout(()=>{row.classList.remove('is-picked');if(this.active===row)this.active=undefined;},650);
 }
 clear(){clearTimeout(this.timer);this.animation?.cancel();this.animation=undefined;this.pressed?.row.classList.remove('is-pressing');this.pressed=undefined;this.active?.classList.remove('is-picked');this.active=undefined;}
}
