import {focusDestination,springFrame,cascadeOffset,isScrollGesture,motionStep,FollowMachine,type ViewBounds} from './lyric-motion';
/** Native scrolling remains in charge during touch and momentum. Audio cues own focus. */
export class LyricsFollower{
 private machine=new FollowMachine();private frame=0;private serial=0;private target='';private playing=false;private velocity=0;private clearFocus=false;
 private pointer?:{id:number;x:number;y:number;moved:boolean};private pointers=new Set<number>();private touches=0;
 private ignoredClickUntil=0;private expectedScroll=scrollY;private settleTimer?:ReturnType<typeof setTimeout>;private layoutUntil=performance.now()+220;private shifted=new Set<HTMLElement>();
 readonly reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private transcript:HTMLElement,private bounds:()=>ViewBounds){
  window.addEventListener('wheel',e=>{if(!(e.target as Element)?.closest('dialog,.player-dock,#chapters'))this.manual(false);},{passive:true});
  transcript.addEventListener('pointerdown',e=>{this.pointers.add(e.pointerId);this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};this.ignoredClickUntil=0;this.cancel();this.machine.begin(performance.now());this.paintState();},{passive:true});
  window.addEventListener('pointermove',e=>{const p=this.pointer;if(p&&p.id===e.pointerId&&isScrollGesture(e.clientX,e.clientY,p.x,p.y)){p.moved=true;this.ignoredClickUntil=performance.now()+350;this.manual(true);}},{passive:true});
  const release=(e:PointerEvent)=>{if(!this.pointers.delete(e.pointerId))return;if(this.pointer?.moved)this.ignoredClickUntil=performance.now()+350;this.pointer=undefined;if(!this.held){this.machine.release(performance.now());this.paintState();this.settle();}};
  window.addEventListener('pointerup',release,{passive:true});window.addEventListener('pointercancel',release,{passive:true});
  transcript.addEventListener('touchstart',e=>{this.touches=e.touches?.length??1;this.cancel();this.machine.begin(performance.now());this.paintState();},{passive:true});
  transcript.addEventListener('touchmove',()=>{this.ignoredClickUntil=performance.now()+350;this.manual(this.held);},{passive:true});
  const touchEnd=(e:TouchEvent)=>{this.touches=e.touches?.length??0;if(!this.held&&this.machine.browsing){this.machine.release(performance.now());this.paintState();this.settle();}};
  window.addEventListener('touchend',touchEnd,{passive:true});window.addEventListener('touchcancel',touchEnd,{passive:true});
  window.addEventListener('keydown',e=>{if(['PageDown','PageUp','Home','End','ArrowDown','ArrowUp'].includes(e.key)&&!(e.target as Element)?.closest('input,select,dialog'))this.manual(false);});
  window.addEventListener('scroll',()=>{if(Math.abs(scrollY-this.expectedScroll)>3&&performance.now()>this.layoutUntil){this.expectedScroll=scrollY;this.manual(this.held);}},{passive:true});
  const resize=()=>{this.layoutUntil=performance.now()+140;this.expectedScroll=scrollY;this.cancel();if(!this.machine.browsing)this.position(false);};window.addEventListener('resize',resize,{passive:true});window.visualViewport?.addEventListener('resize',resize);
  this.reduced.addEventListener('change',()=>{this.cancel();if(!this.machine.browsing)this.position(false);});
  const leave=()=>{this.cancel();if(this.held){this.pointers.clear();this.touches=0;this.pointer=undefined;this.machine.release(performance.now());this.paintState();this.settle();}else if(this.machine.state==='ANIMATING_TO_LINE'){this.machine.finish();this.paintState();}};window.addEventListener('blur',leave);document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
  this.paintState();
 }
 private get held(){return this.pointers.size>0||this.touches>0;}
 private paintState(){if(this.transcript.dataset.follow!==this.machine.state)this.transcript.dataset.follow=this.machine.state;this.transcript.dataset.browsing=String(this.clearFocus);const motion=this.machine.state==='ANIMATING_TO_LINE'?'moving':'still';if(document.documentElement.dataset.lyricMotion!==motion)document.documentElement.dataset.lyricMotion=motion;if(motion==='still')delete document.documentElement.dataset.motionBudget;}
 private clearCascade(){for(const row of this.shifted)row.style.removeProperty('--flow-offset');this.shifted.clear();}
 private cancel(clear=true){this.serial++;cancelAnimationFrame(this.frame);this.frame=0;this.velocity=0;if(clear)this.clearCascade();}
 private manual(held:boolean){this.clearFocus=true;this.cancel();this.machine.move(performance.now(),held);this.paintState();this.settle();}
 private settle(){clearTimeout(this.settleTimer);this.settleTimer=setTimeout(()=>{if(this.held)return;const resume=this.machine.settle(performance.now());this.paintState();if(resume&&this.playing)this.position(true);else if(this.machine.state==='MOMENTUM_SCROLLING')this.settle();},190);}
 canChoose(){return performance.now()>this.ignoredClickUntil&&!this.pointer?.moved;}
 reset(){clearTimeout(this.settleTimer);this.cancel();this.expectedScroll=scrollY;this.machine.reset();this.target='';this.clearFocus=false;this.paintState();}
 reveal(){this.layoutUntil=performance.now()+120;this.expectedScroll=scrollY;if(!this.machine.browsing)this.position(false);}
 hold(){this.cancel();this.machine.finish();this.paintState();}
 resume(){this.machine.reset();this.clearFocus=false;this.paintState();}
 returnToCurrent(){this.machine.reset();this.position(true);}
 select(id:string){clearTimeout(this.settleTimer);this.expectedScroll=scrollY;this.target=id;this.machine.reset();this.position(true);}
 update(id:string|undefined,playing:boolean){
  const changed=!!id&&id!==this.target,wasPlaying=this.playing;this.playing=playing;this.target=id??'';
  // Cues may arrive while native playback briefly buffers. Preserve their
  // boundary even before 'playing', so a held gesture cannot lose its return.
  const follow=changed&&this.machine.boundary();
  if(changed&&!playing&&this.machine.browsing)this.machine.pendingBoundary=true;
  if(playing&&follow)this.position(true);
  else if(playing&&!wasPlaying&&((!this.machine.browsing&&this.machine.state!=='ANIMATING_TO_LINE')||(this.machine.state==='AWAITING_NEXT_LINE'&&this.machine.pendingBoundary&&!this.held)))this.position(true);
  this.paintState();
 }
 private position(animate:boolean){
  const row=this.target?this.transcript.querySelector<HTMLElement>('[data-sentence="'+this.target+'"]'):null;if(!row||document.hidden)return;
  const offset=(el:HTMLElement)=>{const transform=getComputedStyle(el).transform;return transform==='none'?0:new DOMMatrixReadOnly(transform).m42;};
  const r=row.getBoundingClientRect(),from=scrollY,bounds=this.bounds(),maxScroll=Math.max(0,document.documentElement.scrollHeight-innerHeight),to=focusDestination(r.top-offset(row),r.height,from,bounds,maxScroll);
  const distance=to-from,velocity=distance*this.velocity>0?Math.max(-1800,Math.min(1800,this.velocity)):0;
  const entries=[...this.transcript.querySelectorAll<HTMLElement>('.lyric-visible')].map(el=>({el,initial:offset(el),bottom:el.getBoundingClientRect().bottom}));
  const first=Math.max(0,entries.findIndex(e=>e.bottom>bounds.top));
  this.cancel(false);this.clearFocus=false;this.machine.animate();this.paintState();
  const cascade=entries.map((e,i)=>({...e,delay:Math.min(.084,Math.max(0,i-first)*.014),cap:Math.min(24,Math.max(0,i-first)*6)}));
  const scroll=(top:number)=>{this.expectedScroll=Math.max(0,Math.min(maxScroll,top));window.scrollTo({top:this.expectedScroll,behavior:'instant'});};
  if(Math.abs(distance)<2||!animate||this.reduced.matches){this.clearCascade();scroll(to);this.machine.finish();this.paintState();return;}
  const serial=this.serial;let previous=performance.now(),elapsed=0,lastCascade=0,slowFrames=0;
  const tick=(now:number)=>{if(serial!==this.serial||document.hidden)return;const dt=now-previous;previous=now;if(dt>50)slowFrames++;if(slowFrames>=3)document.documentElement.dataset.motionBudget='quiet';const quiet=document.documentElement.dataset.effects==='quiet'||document.documentElement.dataset.motionBudget==='quiet';elapsed+=motionStep(dt,quiet);const value=springFrame(elapsed,distance,velocity);this.velocity=value.velocity;scroll(from+value.position);if(quiet){this.clearCascade();}else if(now-lastCascade>=14){lastCascade=now;for(const entry of cascade)if(entry.el.classList.contains('lyric-visible')){entry.el.style.setProperty('--flow-offset',cascadeOffset(elapsed,distance,velocity,entry.delay,entry.initial,entry.cap).toFixed(3)+'px');this.shifted.add(entry.el);}}if(elapsed<.9&&(elapsed<.22||Math.abs(distance-value.position)>.35||Math.abs(value.velocity)>8))this.frame=requestAnimationFrame(tick);else{scroll(to);this.clearCascade();this.frame=0;this.velocity=0;this.machine.finish();this.paintState();}};
  this.frame=requestAnimationFrame(tick);
 }
}
