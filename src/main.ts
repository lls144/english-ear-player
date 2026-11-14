import './style.css';
import {Player,chapters,library,rates,type Mode,type Preset} from './player';
import {type LoopMode} from './logic';
import {setupPwa} from './pwa';
import {LyricsFollower} from './lyrics';
import {shouldReduceEffects} from './lyric-motion';
const svg=(s:string)=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+s+'</svg>';
const icons={play:svg('<path d="m8 5 11 7-11 7Z"/>'),pause:svg('<path d="M7 5h3v14H7zm7 0h3v14h-3z"/>'),prev:svg('<path d="M5 5h2v14H5zm14 0L8 12l11 7z"/>'),next:svg('<path d="M17 5h2v14h-2zM5 5l11 7-11 7z"/>'),loop:svg('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M18 6H7a4 4 0 0 0-4 4m3-7L3 6l3 3m0 9h11a4 4 0 0 0 4-4m-3 7 3-3-3-3"/>')};
document.querySelector('#app')!.innerHTML=`
 <div class="ambient" aria-hidden="true"><div class="ambient-field"><div class="ambient-scene"></div><div class="ambient-scene"></div></div></div>
 <header class="app-header"><a class="brand" href="#main">听一遍</a><button id="more-open" aria-haspopup="dialog" aria-controls="more-settings" aria-label="更多设置">${svg('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>')}</button></header>
 <main id="main" class="layout"><nav id="chapters" aria-label="作文章节"></nav><section class="reader" aria-labelledby="chapter-title"><h1 id="chapter-title" class="sr-only"></h1><div id="transcript" aria-label="英文原文"></div><details id="source-info"><summary>原文与模板说明</summary><p>只保留笔记已有英文。展示保留原模板；朗读使用中性占位词和一项备选，不添加作文事实。点击正文选句，可开启单句循环。短语与连接词单独归组，默认不进入主循环，可手动选择或单章循环。</p><div id="source-lines"></div></details><footer></footer></section></main>
 <button id="follow-current" class="follow-button" hidden>${svg('<path d="m12 5 6 6-1.5 1.5L13 9v10h-2V9l-3.5 3.5L6 11z"/>')}<span>返回当前句</span></button>
 <section class="player-dock" aria-label="播放器"><div class="dock-inner"><div class="dock-top"><div class="seek-area"><strong id="now-title"></strong><span id="elapsed" aria-hidden="true"></span><span id="total" class="sr-only"></span><input id="progress" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度"></div><label class="preset"><span class="sr-only">聆听方式</span><select id="preset">${library.presets.map(p=>'<option value="'+p.id+'">'+p.label+'</option>').join('')}</select></label></div><div class="transport"><button id="loop-button" aria-label="循环方式">${icons.loop}<span id="loop-label"></span></button><div class="main-controls"><button id="previous" aria-label="上一章">${icons.prev}</button><button id="play" aria-label="播放">${icons.play}</button><button id="next" aria-label="下一章">${icons.next}</button></div><label class="rate"><span class="sr-only">播放速度</span><select id="rate">${rates.map(n=>'<option value="'+n+'">'+n.toFixed(2)+'×</option>').join('')}</select></label></div></div></section>
 <p id="status" class="notice" role="status" aria-live="polite" hidden></p>
 <dialog id="more-settings"><div class="dialog-heading"><h2>更多设置</h2><button id="more-close" aria-label="关闭设置">✕</button></div><div class="settings-content"><fieldset><legend>播放来源</legend><div class="mode-switch"><button data-mode="audio" aria-pressed="true">内置 MP3</button><button data-mode="speech" aria-pressed="false">浏览器朗读</button></div><p class="hint">内置音频在本机用 Kokoro 生成。浏览器朗读依赖系统英语 voice，适合前台使用，不能承诺锁屏连续播放。</p><label>英语语音<select id="voice"></select></label></fieldset><fieldset><legend>循环</legend><label class="sr-only" for="loop">循环方式</label><select id="loop"><option value="all">主列表循环</option><option value="one">单章循环</option><option value="off">顺序播放一次</option><option value="sentence">单句循环</option></select></fieldset><details id="imports"><summary>我的 MP3</summary><p class="hint">只在本机使用，不上传。刷新后需要重新导入。自选文件不含分段时间，也不会因切换预设而自动插入停顿。单句循环使用与原文对应的内置句子音频。</p><div id="import-list"></div><button id="batch-import">按章节文件名批量导入</button><details><summary>系统音频控件</summary><div id="native-audio"></div></details></details><p id="preferences-status" role="status"></p></div></dialog>
 <input type="file" id="file-input" accept=".mp3,audio/mpeg" hidden><input type="file" id="batch-input" accept=".mp3,audio/mpeg" multiple hidden>`;
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const dialog=el<HTMLDialogElement>('more-settings');
const player=new Player(()=>queueMicrotask(render));el('native-audio').append(player.audio);
const chapterButtons=new Map<string,HTMLButtonElement>(),rows=new Map<string,{file:HTMLElement;remove:HTMLButtonElement}>();
let renderedChapter='',voicesSignature='',previousStatus='',noticeTimer:ReturnType<typeof setTimeout>,dragging=false,importTarget=chapters[0].id;
let lastActiveSentence='',motionFrame=0,chapterSerial=0,pendingChapter='',chapterFade:Animation|undefined;
const follower=new LyricsFollower(el('transcript'),el<HTMLButtonElement>('follow-current'),()=>({top:matchMedia('(max-width:760px), (max-height:500px) and (orientation:landscape)').matches?el('chapters').getBoundingClientRect().bottom+18:Math.max(50,document.querySelector('.app-header')!.getBoundingClientRect().bottom+12),bottom:document.querySelector('.player-dock')!.getBoundingClientRect().top-22}));
el('more-settings').querySelector('.settings-content')!.append(el('source-info'),document.querySelector('footer')!);
const candidateTheme=new URLSearchParams(location.search).get('design');document.documentElement.dataset.theme=candidateTheme==='graphite'?'graphite':'indigo';
const palettes=[['#30415e','#41334f','#18243a'],['#33455c','#353951','#172a3c'],['#3a405d','#4b354a','#1d263c'],['#2d4659','#3f3c58','#1a2c3d'],['#3e3d5d','#51414e','#22283d'],['#36455c','#45405a','#1e293e'],['#2e4359','#414859','#172939'],['#3a3f5a','#4b3c56','#20283e'],['#314456','#3f3e55','#1b2b3c']];
let ambientIndex=0,ambientReady=false;
function setAtmosphere(index:number){const fields=[...document.querySelectorAll<HTMLElement>('.ambient-scene')];const colors=candidateTheme==='graphite'?['#3d4b58','#4c444b','#232d37']:palettes[index%palettes.length];if(!ambientReady){ambientReady=true;fields[0].style.transition='none';fields[0].style.background=`radial-gradient(ellipse at 15% 20%,${colors[0]} 0,transparent 67%),radial-gradient(ellipse at 85% 45%,${colors[1]} 0,transparent 67%),${colors[2]}`;requestAnimationFrame(()=>{fields[0].style.transition='';});return;}const next=fields[1-ambientIndex];next.style.background=`radial-gradient(ellipse at 15% 20%,${colors[0]} 0,transparent 67%),radial-gradient(ellipse at 85% 45%,${colors[1]} 0,transparent 67%),${colors[2]}`;next.style.opacity='1';fields[ambientIndex].style.opacity='0';ambientIndex=1-ambientIndex;}

for(const c of chapters){
 const button=document.createElement('button');button.dataset.chapter=c.id;button.textContent=c.title;button.addEventListener('click',()=>{follower.reset();player.select(c.id);window.scrollTo({top:0,behavior:'instant'});});el('chapters').append(button);chapterButtons.set(c.id,button);
 const row=document.createElement('div');row.className='import-row';const label=document.createElement('div'),title=document.createElement('strong'),file=document.createElement('small');title.textContent=c.title;label.append(title,file);
 const choose=document.createElement('button');choose.textContent='导入';choose.setAttribute('aria-label','为'+c.title+'导入 MP3');choose.addEventListener('click',()=>{importTarget=c.id;el<HTMLInputElement>('file-input').click();});
 const remove=document.createElement('button');remove.textContent='移除';remove.setAttribute('aria-label','移除'+c.title+'本地音频');remove.addEventListener('click',()=>player.removeFile(c.id));
 row.append(label,choose,remove);el('import-list').append(row);rows.set(c.id,{file,remove});
}
function clock(seconds:number){if(!Number.isFinite(seconds))return '0:00';return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');}
function sourceText(p:HTMLElement,text:string){
 let at=0;for(const match of text.matchAll(/\[[^\]]+\]|×+|do sth\.?|\.{3,}|…+/g)){p.append(document.createTextNode(text.slice(at,match.index)));const slot=document.createElement('span');slot.className='slot';slot.textContent=match[0];slot.setAttribute('aria-label','模板留白：'+match[0]);p.append(slot);at=match.index!+match[0].length;}p.append(document.createTextNode(text.slice(at)));
}
function mountChapter(){
 const c=player.current;
  window.scrollTo({top:0,behavior:'instant'});renderedChapter=c.id;el('transcript').dataset.lyricChapter=c.id;pendingChapter='';lastActiveSentence='';follower.reset();setAtmosphere(player.index);el('chapter-title').textContent=c.title;el('transcript').replaceChildren();el('source-lines').replaceChildren();let group='';
  c.segments.forEach(s=>{if((c.id==='connectors'||c.id==='phrases')&&group!==s.category){group=s.category;const h=document.createElement('h2');h.textContent=group;el('transcript').append(h);}const article=document.createElement('div');article.className='passage';article.dataset.segment=s.id;const p=document.createElement('p');let textAt=0;s.sentences.forEach(u=>{const start=s.displayText.indexOf(u.displayText,textAt);p.append(document.createTextNode(s.displayText.slice(textAt,start)));textAt=start+u.displayText.length;const span=document.createElement('span');span.className='sentence';span.dataset.sentence=u.id;span.tabIndex=0;span.setAttribute('role','button');span.title='选中此句';sourceText(span,u.displayText);const choose=()=>{if(!follower.canChoose())return;if(player.settings.loop==='sentence')follower.select(u.id);else follower.hold();player.selectSentence(u.id);};span.addEventListener('click',choose);span.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(player.settings.loop==='sentence')follower.select(u.id);else follower.hold();player.selectSentence(u.id);}});p.append(span);});p.append(document.createTextNode(s.displayText.slice(textAt)));article.append(p);el('transcript').append(article);const info=document.createElement('p');info.textContent=(s.kind==='source-template'?'原文模板':s.kind==='source-example'?'原文例句':'原文短语')+' · '+s.category+(s.tier?' · '+s.tier:'');el('source-lines').append(info);});
 }
function render(){
 const c=player.current;
 if(renderedChapter!==c.id&&pendingChapter!==c.id){
  const serial=++chapterSerial;pendingChapter=c.id;chapterFade?.cancel();
  if(!renderedChapter||follower.reduced.matches){mountChapter();}
  else{chapterFade=el('transcript').animate([{opacity:1},{opacity:0}],{duration:90,easing:'ease-out',fill:'forwards'});void chapterFade.finished.catch(()=>{}).then(()=>{if(serial!==chapterSerial)return;mountChapter();chapterFade?.cancel();chapterFade=el('transcript').animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.7,.3,1)'});render();});}
 }
 const active=player.activeSegment,activeId=player.activeSentenceId;
 if(renderedChapter===c.id){
  const units=player.sentences,activeIndex=units.findIndex(u=>u.id===activeId);
  document.querySelectorAll<HTMLElement>('.sentence').forEach((row,i)=>{const selected=row.dataset.sentence===player.settings.selectedSentences[c.id],current=row.dataset.sentence===activeId;row.classList.toggle('selected',selected);row.classList.toggle('current-sentence',current);row.classList.toggle('past-sentence',i<activeIndex);row.classList.toggle('next-sentence',i===activeIndex+1);row.setAttribute('aria-pressed',String(selected));if(current)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');});
  el('transcript').classList.toggle('playing',player.playing);
  el('transcript').querySelectorAll<HTMLElement>('.passage').forEach((p,i)=>{p.classList.toggle('speaking',i===active&&player.playing);if(i===active&&player.playing)p.setAttribute('aria-current','true');else p.removeAttribute('aria-current');});
  follower.update(activeId,player.playing);lastActiveSentence=activeId??'';
 }
 document.documentElement.dataset.playing=String(player.playing&&!document.hidden);
 if(player.playing&&!document.hidden&&!motionFrame)motionFrame=requestAnimationFrame(tickProgress);
 if((!player.playing||document.hidden)&&motionFrame){cancelAnimationFrame(motionFrame);motionFrame=0;}
 for(const c of chapters){chapterButtons.get(c.id)!.setAttribute('aria-current',String(c.id===player.current.id));const row=rows.get(c.id)!,file=player.imported.get(c.id);row.file.textContent=file?.name??'使用内置音频';row.remove.hidden=!file;}
 el('now-title').textContent=player.settings.loop==='sentence'?'单句 '+(player.sentences.indexOf(player.selectedSentence)+1)+' · '+c.title:c.title;el('now-title').title=player.settings.loop==='sentence'?player.selectedSentence.speechText:c.title;const play=el<HTMLButtonElement>('play');const icon=player.playing||player.busy?'pause':'play';if(play.dataset.icon!==icon){play.dataset.icon=icon;play.innerHTML=icons[icon];}play.setAttribute('aria-label',player.playing||player.busy?'暂停':'播放');play.setAttribute('aria-busy',String(player.busy));
 paintProgress();
 el<HTMLSelectElement>('rate').value=String(player.settings.rate);el<HTMLSelectElement>('preset').value=player.settings.preset;el<HTMLSelectElement>('loop').value=player.settings.loop;el('loop-label').textContent=({all:'列表',one:'单章',off:'顺序',sentence:'单句'})[player.settings.loop];el('loop-button').setAttribute('aria-label','循环方式：'+({all:'主列表循环',one:'单章循环',off:'顺序一次',sentence:'单句循环'})[player.settings.loop]);
 document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===player.settings.mode)));
 const signature=JSON.stringify(player.voices.map(v=>[v.voiceURI,v.name]));const voice=el<HTMLSelectElement>('voice');if(signature!==voicesSignature){voicesSignature=signature;voice.replaceChildren();const auto=document.createElement('option');auto.value='';auto.textContent=player.voices.length?'自动选择英语语音':'未找到英语语音';voice.append(auto);for(const v of player.voices){const option=document.createElement('option');option.value=v.voiceURI;option.textContent=v.name+' · '+v.lang;voice.append(option);}}voice.value=player.settings.voice;voice.disabled=player.settings.mode==='audio'||!player.voices.length;
 if(previousStatus!==player.status){previousStatus=player.status;clearTimeout(noticeTimer);const show=/失败|无法|阻止|未找到|中断|不支持|关联|移除|请选择|非空/.test(player.status);el('status').textContent=show?player.status:'';el('status').hidden=!show;el('preferences-status').textContent=show?player.status:'';if(show)noticeTimer=setTimeout(()=>{el('status').hidden=true;el('preferences-status').textContent='';},7000);}
}
el('more-open').addEventListener('click',()=>dialog.showModal());el('more-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
el('play').addEventListener('click',()=>{if(player.playing||player.busy)player.pause();else void player.play();});el('previous').addEventListener('click',()=>{follower.reset();player.step(-1);});el('next').addEventListener('click',()=>{follower.reset();player.step(1);});
el('rate').addEventListener('change',e=>player.setRate(Number((e.target as HTMLSelectElement).value)));el('preset').addEventListener('change',e=>player.setPreset((e.target as HTMLSelectElement).value as Preset));el('loop').addEventListener('change',e=>player.setLoop((e.target as HTMLSelectElement).value as LoopMode));el('voice').addEventListener('change',e=>player.setVoice((e.target as HTMLSelectElement).value));
el('loop-button').addEventListener('click',()=>{const modes:LoopMode[]=['all','one','off','sentence'];player.setLoop(modes[(modes.indexOf(player.settings.loop)+1)%modes.length]);});document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>player.setMode(b.dataset.mode as Mode)));
const progress=el<HTMLInputElement>('progress');let lastSeekAt=0,lastSeekValue='';
function paintProgress(){
 if(!dragging)progress.value=String(Math.round(player.progress*1000));
 const ratio=Number(progress.value)/1000,position=dragging?ratio*player.duration:player.position;
 progress.style.setProperty('--progress',ratio*100+'%');progress.disabled=player.settings.mode==='audio'&&!player.duration;
 progress.setAttribute('aria-valuetext',clock(position)+' / '+clock(player.duration));el('elapsed').textContent=player.settings.mode==='audio'?clock(position):Math.round(ratio*100)+'%';el('total').textContent=clock(player.duration);
}
let lastFrame=0;const intervals:number[]=[];
function tickProgress(now:number){if(lastFrame&&now-lastFrame<500){intervals.push(now-lastFrame);if(intervals.length>8)intervals.shift();if(shouldReduceEffects(intervals))document.documentElement.dataset.effects='quiet';}lastFrame=now;motionFrame=0;if(!player.playing||document.hidden)return;paintProgress();if((player.activeSentenceId??'')!==lastActiveSentence&&!dragging)render();if(!motionFrame)motionFrame=requestAnimationFrame(tickProgress);}
function commitSeek(){const value=progress.value;if(value===lastSeekValue&&performance.now()-lastSeekAt<100)return;lastSeekAt=performance.now();lastSeekValue=value;follower.resume();player.seek(Number(value)/1000);queueMicrotask(()=>follower.returnToCurrent());}
function finishDrag(commit:boolean){if(!dragging)return;dragging=false;el('progress').parentElement!.dataset.seeking='false';if(commit)commitSeek();else paintProgress();}
progress.addEventListener('pointerdown',()=>{dragging=true;el('progress').parentElement!.dataset.seeking='true';});
progress.addEventListener('input',()=>{if(dragging)paintProgress();else commitSeek();});
progress.addEventListener('change',()=>{if(dragging)finishDrag(true);else commitSeek();});
window.addEventListener('pointerup',()=>finishDrag(true));window.addEventListener('pointercancel',()=>finishDrag(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishDrag(false);if(motionFrame)cancelAnimationFrame(motionFrame);motionFrame=0;}render();if(!document.hidden)queueMicrotask(()=>follower.reveal());});
el<HTMLInputElement>('file-input').addEventListener('change',e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(file)try{player.importFile(importTarget,file);}catch(error){player.status=String(error);render();}input.value='';});el('batch-import').addEventListener('click',()=>el<HTMLInputElement>('batch-input').click());el<HTMLInputElement>('batch-input').addEventListener('change',e=>{const input=e.target as HTMLInputElement;let count=0;for(const file of input.files??[]){const id=file.name.replace(/\.mp3$/i,'').replace(/-(slow|recite)$/,'');if(chapters.some(c=>c.id===id))try{player.importFile(id,file);count++;}catch{}}player.status='已关联 '+count+' 个本机文件，刷新后需重新导入。';input.value='';render();});
new ResizeObserver(entries=>{document.documentElement.style.setProperty('--dock-height',entries[0].target.getBoundingClientRect().height+'px');}).observe(document.querySelector('.player-dock')!);
render();setupPwa(()=>player.playing||player.busy);
