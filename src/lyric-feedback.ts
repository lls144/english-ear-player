import {isScrollGesture} from './lyric-motion';
/** Press feedback never changes layout, playback or the stable sentence lock. */
export class LyricFeedback{
 private pressed?:{row:HTMLElement;id:number;x:number;y:number};
 private active?:HTMLElement;private animation?:Animation;private timer?:ReturnType<typeof setTimeout>;private releaseFrame=0;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(root:HTMLElement){
  root.addEventListener('pointerdown',e=>{const row=(e.target as Element).closest<HTMLElement>('.sentence');if(!row||e.button>0)return;this.clear();this.pressed={row,id:e.pointerId,x:e.clientX,y:e.clientY};row.classList.add('is-pressing');},{passive:true});
  window.addEventListener('pointermove',e=>{const p=this.pressed;if(p&&p.id===e.pointerId&&isScrollGesture(e.clientX,e.clientY,p.x,p.y))this.clear();},{passive:true});
  window.addEventListener('pointerup',()=>{const pressed=this.pressed;if(pressed)this.releaseFrame=requestAnimationFrame(()=>{this.releaseFrame=0;if(this.pressed===pressed){pressed.row.classList.remove('is-pressing');this.pressed=undefined;}});},{passive:true});
  window.addEventListener('pointercancel',()=>this.clear(),{passive:true});window.addEventListener('blur',()=>this.clear());
 }
 activate(row:HTMLElement){
  const body=row.querySelector<HTMLElement>('.lyric-body')!;
  const transform=getComputedStyle(body).transform,from=transform==='none'?1:new DOMMatrixReadOnly(transform).a;
  this.clear();this.active=row;row.classList.add('is-picked');
  if(!this.reduced.matches){const keyframes=from<=.98?[{transform:`scale(${from})`,offset:0,easing:'cubic-bezier(.2,.65,.3,1)'},{transform:'scale(1.045)',offset:.25},{transform:'scale(1.045)',offset:.88,easing:'ease-out'},{transform:'scale(1.03)',offset:1}]:[{transform:`scale(${from})`,offset:0},{transform:'scale(.965)',offset:.12,easing:'cubic-bezier(.2,.65,.3,1)'},{transform:'scale(1.045)',offset:.34},{transform:'scale(1.045)',offset:.9,easing:'ease-out'},{transform:'scale(1.03)',offset:1}];this.animation=body.animate(keyframes,{duration:600,easing:'linear',fill:'both'});void this.animation.finished.catch(()=>{});}
  this.timer=setTimeout(()=>{row.classList.remove('is-picked');if(this.active===row){this.animation?.cancel();this.animation=undefined;this.active=undefined;}},750);
 }
 clear(){clearTimeout(this.timer);cancelAnimationFrame(this.releaseFrame);this.releaseFrame=0;this.animation?.cancel();this.animation=undefined;this.pressed?.row.classList.remove('is-pressing');this.pressed=undefined;this.active?.classList.remove('is-picked');this.active=undefined;}
}
