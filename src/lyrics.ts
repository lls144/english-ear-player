import {focusDestination,focusEase,isScrollGesture,type ViewBounds} from './lyric-motion';
/** The audio clock chooses a whole sentence. This class only positions that sentence. */
export class LyricsFollower{
 private frame=0;private serial=0;private target='';private playing=false;private browsing=false;
 private pointer?:{id:number;x:number;y:number;moved:boolean};private ignoredClickUntil=0;
 readonly reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private transcript:HTMLElement,private back:HTMLButtonElement,private bounds:()=>ViewBounds){
  const interrupt=()=>this.browse();
  window.addEventListener('wheel',e=>{if(!(e.target as Element)?.closest('dialog'))interrupt();},{passive:true});
  transcript.addEventListener('pointerdown',e=>{this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};this.cancel();},{passive:true});
  window.addEventListener('pointermove',e=>{const p=this.pointer;if(p&&p.id===e.pointerId&&isScrollGesture(e.clientX,e.clientY,p.x,p.y)){p.moved=true;this.ignoredClickUntil=performance.now()+450;interrupt();}},{passive:true});
  const release=()=>{if(this.pointer?.moved)this.ignoredClickUntil=performance.now()+450;this.pointer=undefined;};
  window.addEventListener('pointerup',release,{passive:true});window.addEventListener('pointercancel',release,{passive:true});
  // Touch events also cover older iOS Pointer cancellation during native scrolling.
  transcript.addEventListener('touchmove',()=>{this.ignoredClickUntil=performance.now()+450;interrupt();},{passive:true});
  window.addEventListener('keydown',e=>{if(['PageDown','PageUp','Home','End','ArrowDown','ArrowUp'].includes(e.key)&&!(e.target as Element)?.closest('input,select,dialog'))interrupt();});
  window.addEventListener('scroll',()=>this.updateBack(),{passive:true});
  window.addEventListener('resize',()=>{this.cancel();if(!this.browsing)this.position(false);this.updateBack();},{passive:true});
  window.visualViewport?.addEventListener('resize',()=>{if(!this.browsing)this.position(false);this.updateBack();});
  this.reduced.addEventListener('change',()=>this.cancel());
  back.addEventListener('click',()=>{this.browsing=false;this.position(true);this.updateBack();});
 }
 hold(){this.browse();}
 reveal(){if(!this.browsing)this.position(false);this.updateBack();}
 resume(){this.browsing=false;this.transcript.dataset.follow='following';}
 returnToCurrent(){this.browsing=false;this.position(true);this.updateBack();}
 canChoose(){return performance.now()>this.ignoredClickUntil&&!this.pointer?.moved;}
 private cancel(){this.serial++;cancelAnimationFrame(this.frame);this.frame=0;}
 private browse(){this.browsing=true;this.cancel();this.transcript.dataset.follow='browsing';this.updateBack();}
 reset(){this.cancel();this.browsing=false;this.target='';this.transcript.dataset.follow='following';this.back.hidden=true;}
 select(id:string){this.cancel();this.browsing=false;this.target=id;this.transcript.dataset.follow='following';this.updateBack();}
 update(id:string|undefined,playing:boolean){
  const changed=!!id&&id!==this.target;const wasPlaying=this.playing;this.playing=playing;
  this.target=id??'';
  if(!playing&&wasPlaying)this.cancel();
  if(!this.browsing&&(changed||playing&&!wasPlaying))this.position(playing);
  this.updateBack();
 }
 private element(){return this.target?this.transcript.querySelector<HTMLElement>('[data-sentence="'+this.target+'"]'):null;}
 private position(animate:boolean){
  const row=this.element();if(!row||document.hidden)return;
  const r=row.getBoundingClientRect(),bounds=this.bounds(),from=scrollY;
  const to=focusDestination(r.top,r.height,from,bounds,Math.max(0,document.documentElement.scrollHeight-innerHeight));
  this.cancel();this.transcript.dataset.follow='following';
  if(Math.abs(to-from)<2)return;
  if(!animate||this.reduced.matches){window.scrollTo({top:to,behavior:'instant'});return;}
  const serial=this.serial,started=performance.now(),duration=380;
  const tick=(now:number)=>{if(serial!==this.serial||document.hidden)return;const t=Math.min(1,(now-started)/duration);window.scrollTo({top:from+(to-from)*focusEase(t),behavior:'instant'});if(t<1)this.frame=requestAnimationFrame(tick);else this.frame=0;};
  this.frame=requestAnimationFrame(tick);
 }
 private updateBack(){
  const row=this.element(),b=this.bounds();if(!row){this.back.hidden=true;return;}
  const r=row.getBoundingClientRect(),away=r.top<b.top-28||r.top>Math.min(b.bottom-48,b.top+180)||r.bottom>b.bottom+28;
  this.back.hidden=!this.playing||!this.browsing||!away;
 }
}
