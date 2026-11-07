import {setupPwa} from './pwa';
import './style.css';
import { Player, chapters, type Mode } from './player';
import { clock, type LoopMode } from './logic';
const svg=(body: string)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
const icons={
  ear:svg('<path d="M5 13v-2a7 7 0 0 1 14 0v2"/><rect x="3" y="11" width="4" height="8" rx="2"/><rect x="17" y="11" width="4" height="8" rx="2"/>'),
  play:svg('<path fill="currentColor" stroke="none" d="m9 5 11 7-11 7z"/>'),
  pause:svg('<path d="M9 5v14M15 5v14" stroke-width="3"/>'),
  prev:svg('<path d="M6 5v14"/><path fill="currentColor" stroke="none" d="m18 5-10 7 10 7z"/>'),
  next:svg('<path d="M18 5v14"/><path fill="currentColor" stroke="none" d="m6 5 10 7-10 7z"/>'),
  upload:svg('<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>'),
  repeat:svg('<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>')
};
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
  <header class="masthead"><a class="brand" href="#main"><span class="brand-icon">${icons.ear}</span><span>听一遍 <small>ENGLISH, EVERY DAY</small></span></a><span class="private-badge"><i></i> 本地聆听 · 无需登录</span></header>
  <main id="main"><section class="intro"><div class="eyebrow">THE DAILY LISTEN / 考研英语</div><h1>让好句子，<br class="mobile-break">慢慢成为语感。</h1><p>作文磨耳朵。从描图到结尾，每次听懂一点，每天记牢一点。</p></section>
  <div class="workspace">
    <aside class="library"><div class="section-heading"><h2>我的章节</h2><span>${String(chapters.length).padStart(2,'0')} CHAPTERS</span></div><nav id="chapters" aria-label="作文章节"></nav><div class="library-note"><span class="tiny-wave">▂ ▅ ▃ ▇ ▄ ▂</span><p>不求一次记住。<br>把听过的，再听一遍。</p></div></aside>
    <div class="reading-column">
      <section class="reader" aria-labelledby="chapter-title"><div class="reader-top"><span id="chapter-number" class="eyebrow"></span><span id="word-count" class="muted"></span></div><h2 id="chapter-title"></h2><p id="chapter-subtitle" lang="en"></p><div class="reading-label"><span>READ ALONG / 跟读文本</span><button id="text-toggle" class="text-button" aria-expanded="true">收起文本</button></div><div id="transcript" lang="en"></div><div class="source-note">材料含模板补全与练习句；原笔记示例单独标注。完整修改记录见本地 JSON。</div></section>
      <details class="settings panel"><summary>播放设置 <span>语音 · 速度 · 循环</span></summary><div class="settings-grid"><label>英语语音<select id="voice"></select></label><label>播放速度<select id="rate"><option value="0.5">0.5× 慢速</option><option value="0.75">0.75×</option><option value="0.9">0.9×</option><option value="1">1× 正常</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2× 快速</option></select></label><label>循环方式<select id="loop"><option value="all">全列表循环</option><option value="one">单篇循环</option><option value="off">顺序播放一次</option></select></label></div><p class="hint">英语 voice 由系统提供，部分语音可能需要联网。朗读进度依据字符位置；若语音不提供逐词事件，则在句子结束时更新。MP3 进度为实际时间。</p></details>
      <details id="import-panel" class="panel"><summary>我的 MP3 <span id="audio-count">本机文件，不上传</span></summary><p class="hint">将自己生成的 MP3 关联到对应章节。文件只在当前页面使用；刷新、关闭或换设备后需重新导入。内置音频可放入 assets/audio 并登记清单。</p><div id="import-list"></div><button id="batch-import" class="secondary-button">${icons.upload} 按章节文件名批量导入</button><p class="hint">批量文件名：picture.mp3、theme-trends.mp3、reasons.mp3、connectors.mp3、conclusion.mp3。</p><details class="native"><summary>系统音频控件（MP3 备用操作）</summary><div id="native-audio"></div></details></details>
      <footer>一份安静的复习时间。<span>LISTEN · REPEAT · REMEMBER</span></footer>
    </div>
  </div></main>
  <section class="player-dock" aria-label="播放器"><div class="dock-inner"><div class="dock-top"><div class="now-playing"><span class="track-art">${icons.ear}</span><div><small>正在聆听</small><strong id="now-title"></strong></div></div><div class="mode-switch" role="group" aria-label="播放模式"><button data-mode="speech" aria-pressed="true">浏览器朗读</button><button data-mode="audio" aria-pressed="false">MP3 音频</button></div></div><p id="mode-note" class="mode-note"></p><div class="timeline"><input id="progress" type="range" min="0" max="1000" value="0" aria-label="播放进度"><div class="time-labels"><span id="elapsed"></span><span id="total"></span></div></div><div class="transport"><button id="loop-button" class="utility-button" title="切换循环方式">${icons.repeat}<span id="loop-label"></span></button><div class="main-controls"><button id="previous" class="icon-button" aria-label="上一章">${icons.prev}</button><button id="play" class="play-button" aria-label="播放">${icons.play}</button><button id="next" class="icon-button" aria-label="下一章">${icons.next}</button></div><button id="rate-button" class="utility-button" aria-label="切换播放速度">1×</button></div><p id="status" class="status" role="status" aria-live="polite"></p></div></section>
  <input type="file" id="file-input" accept=".mp3,audio/mpeg" hidden><input type="file" id="batch-input" accept=".mp3,audio/mpeg" multiple hidden>
`;
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const player=new Player(()=>queueMicrotask(render));
el('native-audio').append(player.audio);
const kindLabels: Record<string,string>={'source-text':'原笔记 · 英文材料','source-example':'原笔记 · 漫画示例','adapted-template':'模板补全 · 练习用','editorial-practice':'连接词 · 编辑练习句','user-authored':'自定义 · 用户添加'};
const chapterButtons=new Map<string,HTMLButtonElement>();
const importRows=new Map<string,{name:HTMLElement,remove:HTMLButtonElement}>();
let progressDragging=false;
let importTarget=chapters[0].id, renderedChapter='', voicesSignature='', previousStatus='';
for(const [i,c]of chapters.entries()) {
  const button=document.createElement('button'); button.className='chapter'; button.dataset.chapter=c.id;
  const number=document.createElement('span'); number.className='chapter-index'; number.textContent=String(i+1).padStart(2,'0');
  const meta=document.createElement('span'); meta.className='chapter-meta';
  const title=document.createElement('strong'); title.textContent=c.title;
  const subtitle=document.createElement('small'); subtitle.textContent=c.subtitle;
  const available=document.createElement('span'); available.className='chapter-state';
  meta.append(title,subtitle); button.append(number,meta,available);
  button.addEventListener('click',()=>player.select(c.id));
  el('chapters').append(button); chapterButtons.set(c.id,button);
  const row=document.createElement('div'); row.className='import-row';
  const label=document.createElement('div'); const name=document.createElement('strong'); name.textContent=c.title;
  const file=document.createElement('small'); file.textContent='未关联音频'; label.append(name,file);
  const actions=document.createElement('div'); actions.className='import-actions';
  const choose=document.createElement('button'); choose.className='text-button'; choose.textContent='导入 MP3'; choose.setAttribute('aria-label','为'+c.title+'导入 MP3');
  choose.addEventListener('click',()=>{importTarget=c.id;el<HTMLInputElement>('file-input').click();});
  const remove=document.createElement('button'); remove.className='text-button remove'; remove.textContent='移除'; remove.setAttribute('aria-label','移除'+c.title+'本地音频');
  remove.addEventListener('click',()=>player.removeFile(c.id));
  actions.append(choose,remove); row.append(label,actions); el('import-list').append(row); importRows.set(c.id,{name:file,remove});
}
function render() {
  const current=player.current;
  if(renderedChapter!==current.id) {
    renderedChapter=current.id;
    el('chapter-title').textContent=current.title; el('chapter-subtitle').textContent=current.subtitle;
    el('chapter-number').textContent='CHAPTER '+String(player.index+1).padStart(2,'0')+' / '+String(chapters.length).padStart(2,'0');
    const words=player.text.split(/\s+/).length;
    el('word-count').textContent=words+' 词 · 朗读约 '+Math.max(1,Math.ceil(words/150))+' 分钟';
    el('transcript').replaceChildren();
    for(const s of current.segments) {
      const article=document.createElement('div'); article.className='passage';
      const badge=document.createElement('span'); badge.className='provenance'; badge.textContent=kindLabels[s.kind];
      const p=document.createElement('p'); p.textContent=s.text; article.append(badge,p); el('transcript').append(article);
    }
  }
  [...el('transcript').children].forEach((node,i)=>node.classList.toggle('speaking',player.playing && i===player.activeSegment));
  for(const c of chapters) {
    const button=chapterButtons.get(c.id)!; button.setAttribute('aria-current',String(c.id===current.id));
    const imported=player.imported.get(c.id), builtin=player.builtinSource(c.id);
    button.querySelector('.chapter-state')!.textContent=(c.id===current.id && player.playing)?'▥':(imported||builtin?'MP3':'');
    const row=importRows.get(c.id)!;
    row.name.textContent=imported?imported.name:builtin?'内置 MP3':'尚无 MP3';
    row.name.title=row.name.textContent; row.remove.hidden=!imported;
  }
  el('now-title').textContent=current.title;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===player.settings.mode)));
  const audioMode=player.settings.mode==='audio';
  el('mode-note').textContent=audioMode?'MP3 优先用于后台聆听；首次播放请轻点按钮。锁屏连续播放需在真机确认。':'系统英语语音 · 锁屏或切到后台可能中断，不会生成 MP3。';
  const play=el<HTMLButtonElement>('play'); play.innerHTML=player.playing||player.busy?icons.pause:icons.play;
  play.setAttribute('aria-label',player.playing||player.busy?'暂停':'播放'); play.setAttribute('aria-busy',String(player.busy));
  const progress=el<HTMLInputElement>('progress');
  if(!progressDragging)progress.value=String(Math.round(player.progress*1000));
  progress.style.setProperty('--progress',player.progress*100+'%');
  progress.disabled=audioMode && player.duration===0;
  progress.setAttribute('aria-valuetext',audioMode?clock(player.position)+' / '+clock(player.duration):'朗读位置 '+Math.round(player.progress*100)+'%');
  el('elapsed').textContent=audioMode?clock(player.position):Math.round(player.progress*100)+'%';
  el('total').textContent=audioMode?(player.duration?clock(player.duration):'尚无可播放音频'):'朗读位置 · 非音频时长';
  el<HTMLSelectElement>('rate').value=String(player.settings.rate);
  el('rate-button').textContent=player.settings.rate+'×';
  el<HTMLSelectElement>('loop').value=player.settings.loop;
  el('loop-label').textContent=({all:'列表循环',one:'单篇循环',off:'顺序一次'})[player.settings.loop];
  el('loop-button').setAttribute('aria-label','循环方式：'+el('loop-label').textContent);
  const signature=JSON.stringify(player.voices.map(v=>[v.voiceURI,v.name]));
  const voice=el<HTMLSelectElement>('voice');
  if(signature!==voicesSignature) {
    voicesSignature=signature; voice.replaceChildren();
    const automatic=document.createElement('option'); automatic.value='';automatic.textContent=player.voices.length?'自动选择英语语音':'等待系统英语语音…'; voice.append(automatic);
    for(const v of player.voices) {const option=document.createElement('option');option.value=v.voiceURI;option.textContent=v.name+' · '+v.lang+(v.localService?' · 本机':'');voice.append(option);}
  }
  voice.value=player.voices.some(v=>v.voiceURI===player.settings.voice)?player.settings.voice:'';
  voice.disabled=audioMode||!player.speechSupported;
  el('audio-count').textContent=player.imported.size?player.imported.size+' 章已导入 · 刷新需重选':'本机文件，不上传';
  if(previousStatus!==player.status) {el('status').textContent=player.status;previousStatus=player.status;}
}
el('play').addEventListener('click',()=>{if(player.playing||player.busy)player.pause();else void player.play();});
el('previous').addEventListener('click',()=>player.step(-1));el('next').addEventListener('click',()=>player.step(1));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>player.setMode(b.dataset.mode as Mode)));
el('rate').addEventListener('change',e=>player.setRate(Number((e.target as HTMLSelectElement).value)));
el('loop').addEventListener('change',e=>player.setLoop((e.target as HTMLSelectElement).value as LoopMode));
el('voice').addEventListener('change',e=>player.setVoice((e.target as HTMLSelectElement).value));
el('progress').addEventListener('pointerdown',()=>{progressDragging=true;});
document.addEventListener('pointerup',()=>{if(progressDragging)setTimeout(()=>{progressDragging=false;render();},0);});
document.addEventListener('pointercancel',()=>{progressDragging=false;render();});
el('progress').addEventListener('change',e=>{progressDragging=false;player.seek(Number((e.target as HTMLInputElement).value)/1000);});
el('progress').addEventListener('input',e=>player.seek(Number((e.target as HTMLInputElement).value)/1000));
el('loop-button').addEventListener('click',()=>{const values:LoopMode[]=['all','one','off'];player.setLoop(values[(values.indexOf(player.settings.loop)+1)%values.length]);});
el('rate-button').addEventListener('click',()=>{const rates=[0.75,0.9,1,1.25,1.5,2];player.setRate(rates[(rates.indexOf(player.settings.rate)+1)%rates.length]);});
el('text-toggle').addEventListener('click',()=>{const transcript=el('transcript');transcript.hidden=!transcript.hidden;el('text-toggle').textContent=transcript.hidden?'展开文本':'收起文本';el('text-toggle').setAttribute('aria-expanded',String(!transcript.hidden));});
el<HTMLInputElement>('file-input').addEventListener('change',e=>{
  const input=e.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  try{player.importFile(importTarget,file);}catch(error){player.status=String(error);render();}input.value='';
});
el('batch-import').addEventListener('click',()=>el<HTMLInputElement>('batch-input').click());
el<HTMLInputElement>('batch-input').addEventListener('change',e=>{
  const input=e.target as HTMLInputElement;let count=0;const rejected:string[]=[];
  for(const file of input.files??[]) {
    const id=file.name.replace(/\.mp3$/i,'');
    if(chapters.some(c=>c.id===id))try{player.importFile(id,file);count++;}catch{rejected.push(file.name);}else rejected.push(file.name);
  }
  player.status='已关联 '+count+' 个本机文件；刷新后需重选。'+(rejected.length?'未匹配：'+rejected.join('、'):'');input.value='';render();
});
render();


setupPwa();
