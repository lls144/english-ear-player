import rawLibrary from './library.generated.json';
import { nextIndex, safeNumber, speechChunk, type LoopMode } from './logic';
export type Preset = 'continuous'|'slow'|'recite';
type Part={text?:string;pauseMs?:number};
type Cue={sentenceId?:string;segmentId:string;start:number;speechEnd:number;end:number};
type Sentence={id:string;displayText:string;speechText:string;pronunciationText?:string;sourceIds:string[]};
type SourceChapter={id:string;title:string;subtitle:string;inMainLoop:boolean;segments:{id:string;text:string;displayText:string;speechText:string;sentences:Sentence[];kind:string;category:string;tier?:string;parts:Part[]}[]};
type Profile={id:Preset;label:string;modelSpeed:number;sentenceGapMs:number;phraseGapMs:number;loopGapMs:number;recallFactor:number};
export const library=rawLibrary as unknown as {version:string;contentVersion:string;chapters:SourceChapter[];audio:Record<string,string>;audioModes:Record<Preset,Record<string,string>>;sentenceAudio:Record<Preset,Record<string,string>>;timings:Record<Preset,Record<string,Cue[]>>;presets:Profile[];defaultRate:number;defaultPreset:Preset;referenceRate:number};
export const chapters = library.chapters;
export type Chapter = typeof chapters[number];
export type Mode = 'speech' | 'audio';
type Settings = { schemaVersion:number;selectedSentences:Record<string,string>;manualSentences:Record<string,boolean>;contentVersion:string;chapter: string; mode: Mode; preset:Preset;loop: LoopMode; rate: number; voice: string; audioPositions: Record<string, number>; speechPositions: Record<string, number> };
export const storageKey = 'english-ear-player:v1.2';
export const rates=[.55,.60,.65,.70,.75,.80,.85,.90,1];
const defaults: Settings = {schemaVersion:2,selectedSentences:{},manualSentences:{},contentVersion:library.contentVersion,chapter: chapters[0].id, mode:'audio',preset:'slow',loop: 'all', rate:.7, voice: '', audioPositions: {}, speechPositions: {}};
export class Player {
  readonly audio = new Audio();
  settings: Settings = structuredClone(defaults);
  playing = false;
  busy = false;
  status = '准备好了，按播放开始。';
  speechOffset = 0;
  voices: SpeechSynthesisVoice[] = [];
  readonly imported = new Map<string, {url: string; name: string}>();
  readonly speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  private token = 0;
  private utterance?: SpeechSynthesisUtterance;
  private savedAt = 0;
  private restoredAt = 0;
  private audioReady = false;
  private restorePending = false;
  private stopStartup?:()=>void;
  private pauseGuard?:ReturnType<typeof setTimeout>;
  private wantedPlayback = false;
  private loopRestartAllowed = false;
  private audioFailed = false;
  private speechTimer?:ReturnType<typeof setTimeout>;
  private speechActiveIndex=0;
  private audioTimer?:ReturnType<typeof setTimeout>;
  private notify: () => void;
  private synth = this.speechSupported ? window.speechSynthesis : undefined;
  constructor(notify: () => void) {
    this.notify = notify;
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem('english-ear-player:v1.1') ?? localStorage.getItem('english-ear-player:v1') ?? 'null');
      if (raw && typeof raw === 'object') {
        this.settings.chapter = chapters.some(c => c.id === raw.chapter) ? raw.chapter : defaults.chapter;
        this.settings.mode = raw.schemaVersion===2&&raw.mode==='speech' ? 'speech' : 'audio';
        this.settings.preset = ['continuous','slow','recite'].includes(raw.preset)?raw.preset:'slow';
        this.settings.loop = ['all','one','off','sentence'].includes(raw.loop) ? raw.loop : 'all';
        this.settings.rate = raw.schemaVersion===2&&rates.includes(raw.rate)?raw.rate:.7;
        for(const c of chapters){const id=raw.selectedSentences?.[c.id];if(c.segments.some(s=>s.sentences.some(u=>u.id===id))){this.settings.selectedSentences[c.id]=id;this.settings.manualSentences[c.id]=raw.manualSentences?.[c.id]===true;}}
        this.settings.voice = typeof raw.voice === 'string' ? raw.voice : '';
        if(raw.schemaVersion===2)for(const [key,value]of Object.entries(raw.audioPositions??{}))this.settings.audioPositions[key]=safeNumber(value,0,0,86400);
        if(raw.schemaVersion===2&&raw.contentVersion===library.contentVersion)for (const c of chapters)this.settings.speechPositions[c.id] = safeNumber(raw.speechPositions?.[c.id],0,0,this.textFor(c).length);
      }
    } catch { this.status = '无法读取本机记录；仍可正常播放。'; }
    if (!this.speechSupported && this.settings.mode === 'speech') this.settings.mode = 'audio';
    if(this.settings.loop==='sentence')this.settings.selectedSentences[this.current.id]??=this.sentences[0].id;
    this.speechOffset = this.settings.speechPositions[this.current.id] ?? 0;
    this.audio.preload = 'metadata';
    this.audio.preservesPitch=true;
    (this.audio as HTMLAudioElement&{webkitPreservesPitch?:boolean}).webkitPreservesPitch=true;
    this.audio.controls = true;
    this.audio.setAttribute('aria-label', '系统 MP3 播放器');
    const nativeInteraction=()=>{if(this.pauseGuard)clearTimeout(this.pauseGuard);this.pauseGuard=undefined;};
    for(const event of ['pointerdown','touchstart','keydown'])this.audio.addEventListener(event,nativeInteraction);
    this.audio.addEventListener('play', () => {
      if(this.settings.mode !== 'audio' || this.audio.error) { this.audio.pause(); return; }
      if(this.pauseGuard){this.audio.pause();return;}
      if(this.audio.paused)return;
      this.audio.loop=this.settings.loop==='one'||this.settings.loop==='sentence';
      this.wantedPlayback = true;
      this.playing = true; this.busy = false; this.status = 'MP3 播放中'; this.changed();
    });
    this.audio.addEventListener('pause', () => {
      if(this.settings.mode !== 'audio' || !this.audio.paused) return;
      if(this.audio.ended)return; // The ended handler owns natural completion.
      // Some WebKit media backends pause after the native loop seek to zero.
      // Only resume a proven loop boundary, never a user/system pause elsewhere.
      if(this.wantedPlayback && this.audio.loop && this.loopRestartAllowed && this.audio.currentTime < .2 && !this.audio.error) {
        this.loopRestartAllowed=false; this.playing=false; this.busy=false; void this.play(); return;
      }
      this.wantedPlayback=false; this.playing=false; this.busy=false;
      if(!this.audio.error && !this.audioFailed)this.status='已暂停';
      this.save(); this.changed();
    });
    const observePosition=()=>{if(this.audio.duration>0 && this.audio.currentTime>this.audio.duration-1)this.loopRestartAllowed=true;else if(this.audio.currentTime>1)this.loopRestartAllowed=false;};
    this.audio.addEventListener('seeking',observePosition);
    this.audio.addEventListener('timeupdate', () => { if(this.settings.mode === 'audio') { observePosition(); this.save(false); this.changed(); } });
    this.audio.addEventListener('ratechange', () => {
      if (this.settings.mode === 'audio') { const requested=this.audio.playbackRate*(this.usingImportedAudio?1:library.referenceRate);this.settings.rate=rates.reduce((a,b)=>Math.abs(b-requested)<Math.abs(a-requested)?b:a);if(Math.abs(this.audio.playbackRate-this.mediaRate)>.0001)this.audio.playbackRate=this.mediaRate;this.save(); this.changed(); }
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if(this.audio.currentSrc !== this.audioSource) return;
      this.audioReady = true;
      // load() already starts at zero. Seeking to zero again as metadata arrives
      // can stall WebKit's media pipeline just after a user starts playback.
      if(this.audio.paused)this.restorePosition(false,true);
      this.audio.playbackRate = this.mediaRate; this.changed();
    });
    this.audio.addEventListener('ended', () => { if (this.settings.mode === 'audio'&&this.wantedPlayback&&this.audio.ended&&this.audio.currentSrc===this.audioSource) this.finished(); });
    this.audio.addEventListener('error', () => {
      if(this.settings.mode !== 'audio' || !this.audio.getAttribute('src')||!this.audio.error) return;
      this.busy = false; this.playing = false;
      this.wantedPlayback=false; this.audio.pause();
      this.audioFailed=true;
      this.status = '音频无法读取或格式不受支持。请重新导入真实 MP3，或检查内置文件。'; this.changed();
    });
    this.audio.addEventListener('waiting', () => { if(this.settings.mode === 'audio') { this.status = '正在缓冲音频…'; this.changed(); } });
    this.audio.addEventListener('playing', () => { if(this.pauseGuard){this.audio.pause();return;}if(this.settings.mode === 'audio' && !this.audio.error&&this.audio.currentSrc===this.audioSource&&!this.audio.paused) { this.restorePosition(true);this.playing=true;this.busy=false;this.status = 'MP3 播放中'; this.changed(); } });
    this.refreshVoices();
    this.synth?.addEventListener('voiceschanged', this.refreshVoices);
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => { if(document.hidden) this.save(); });
    this.configureMediaSession();
    if(this.settings.mode === 'audio') this.loadAudio();
  }
  get current() { return chapters.find(c => c.id === this.settings.chapter)!; }
  get index() { return chapters.indexOf(this.current); }
  textFor(c: Chapter) { return c.segments.flatMap(s=>s.sentences).map(u=>u.pronunciationText??u.speechText).join('\n\n'); }
  get sentences(){return this.current.segments.flatMap(s=>s.sentences);}
  get selectedSentence(){return this.sentences.find(u=>u.id===this.settings.selectedSentences[this.current.id])??this.sentences[0];}
  get usingImportedAudio(){return this.settings.loop!=='sentence'&&this.imported.has(this.current.id);}
  get activeSentenceId(){if(this.settings.loop==='sentence')return this.selectedSentence.id;if(this.settings.mode==='speech')return this.sentences[this.speechActiveIndex]?.id;const cue=(library.timings[this.settings.preset][this.current.id]??[]).find(t=>this.audio.currentTime>=t.start&&this.audio.currentTime<t.end);return this.usingImportedAudio?undefined:cue?.sentenceId??this.current.segments.find(s=>s.id===cue?.segmentId)?.sentences[0]?.id;}
  get profile(){return library.presets.find(p=>p.id===this.settings.preset)!;}
  get mediaRate(){return this.settings.rate/(this.usingImportedAudio?1:library.referenceRate);}
  positionKeyFor(id:string){return this.settings.preset+':'+id+':'+(this.settings.loop==='sentence'?'sentence:'+this.selectedSentence.id+':'+library.sentenceAudio[this.settings.preset]?.[this.selectedSentence.id]:(this.imported.get(id)?.name??this.builtinSource(id)));}
  get positionKey(){return this.positionKeyFor(this.current.id);}
  get text() { return this.settings.loop==='sentence'?(this.selectedSentence.pronunciationText??this.selectedSentence.speechText):this.textFor(this.current); }
  get audioSource(): string | undefined {
    if(this.settings.loop==='sentence'){const file=library.sentenceAudio[this.settings.preset]?.[this.selectedSentence.id];return file?new URL(file,document.baseURI).href:undefined;}
    return this.imported.get(this.current.id)?.url ?? this.builtinSource(this.current.id);
  }
  builtinSource(id: string): string | undefined {
    const file = library.audioModes[this.settings.preset][id];
    return file ? new URL(file, document.baseURI).href : undefined;
  }
  get position() { return this.settings.mode === 'audio' ? this.audio.currentTime : this.speechOffset; }
  get duration() { return this.settings.mode === 'audio' ? (this.audioReady && Number.isFinite(this.audio.duration) ? this.audio.duration : 0) : this.text.length; }
  get progress() { return this.duration > 0 ? Math.min(1,this.position/this.duration) : 0; }
  get activeSegment() {return this.current.segments.findIndex(s=>s.sentences.some(u=>u.id===this.activeSentenceId));}
  refreshVoices = () => {
    this.voices = this.synth?.getVoices().filter(v => /^en(?:-|_)/i.test(v.lang) || v.lang.toLowerCase()==='en') ?? [];
    this.notify();
  };
  changed() { this.updateMediaSession(); this.notify(); }
  save(force = true) {
    const now = Date.now();
    if (!force && now-this.savedAt<1000) return;
    this.savedAt = now;
    if(this.settings.mode==='audio' && this.audioReady && this.audio.currentSrc===this.audioSource) this.settings.audioPositions[this.positionKey]=this.audio.currentTime;
    if(this.settings.mode==='speech') this.settings.speechPositions[this.current.id]=this.speechOffset;
    try { localStorage.setItem(storageKey, JSON.stringify(this.settings)); } catch { /* Storage can be disabled. Playback stays available. */ }
  }
  pause() {
    this.stopStartup?.();
    if(this.pauseGuard)clearTimeout(this.pauseGuard);
    this.pauseGuard=this.settings.mode==='audio'?setTimeout(()=>{this.pauseGuard=undefined;},250):undefined;
    if(this.speechTimer)clearTimeout(this.speechTimer);
    if(this.audioTimer)clearTimeout(this.audioTimer);
    this.wantedPlayback=false; this.loopRestartAllowed=false;
    this.token++; this.busy = false; this.playing = false;
    this.synth?.cancel(); this.utterance = undefined;
    this.audio.loop=false;this.audio.pause(); this.status = '已暂停'; this.save(); this.changed();
  }
  async play(retrying=false) {
    if(this.busy || this.playing) return;
    if(this.pauseGuard)clearTimeout(this.pauseGuard);this.pauseGuard=undefined;
    this.stopStartup?.();
    if(this.audioTimer)clearTimeout(this.audioTimer);
    this.wantedPlayback=true;
    if(this.settings.mode==='speech') {
      if(!this.synth) { this.status='此浏览器不支持朗读，请使用 MP3 模式。'; this.changed(); return; }
      this.refreshVoices();
      if(!this.voices.length) {this.wantedPlayback=false;this.status='未找到英语语音。请在系统中安装英语语音后重试，或使用 MP3。'; this.changed(); return;}
      if(this.speechOffset>=this.text.length) this.speechOffset=0;
      this.busy=true; this.speak(); return;
    }
    if(!this.audioSource) { this.status='本章还没有 MP3。请导入音频，或先使用浏览器朗读。'; this.changed(); return; }
    if(this.audio.getAttribute('src') !== this.audioSource || this.audio.error || this.audioFailed) this.loadAudio();
    if(this.audio.ended) this.audio.currentTime=0;
    this.audio.loop=this.settings.loop==='one'||this.settings.loop==='sentence';
    this.busy=true; this.status='正在打开音频…'; this.changed();
    const expected = ++this.token;
    this.audioTimer=setTimeout(()=>{
      if(expected!==this.token || this.settings.mode!=='audio' || !this.wantedPlayback)return;
      // Cleared only after observed clock progress, not merely a play event or seek.
      this.stopStartup?.();
      this.token++;this.audioFailed=true;this.wantedPlayback=false;this.audio.pause();
      this.playing=false;this.busy=false;this.status='音频加载失败或长时间无响应。请检查文件或网络后重试。';this.changed();
    },60000);
    try { await this.audio.play();if(expected===this.token&&this.settings.mode==='audio'&&this.wantedPlayback)this.observeStartup(expected,retrying); }
    catch (e) {
      if(expected!==this.token) return;
      if(this.audioTimer)clearTimeout(this.audioTimer);
      this.busy=false; this.playing=false;this.wantedPlayback=false;
      this.status=e instanceof DOMException && e.name==='NotAllowedError' ? '浏览器阻止了自动播放。请轻点播放继续。' : '播放失败，请确认文件是可播放的 MP3 后重试。'; this.changed();
    }
  }
  private hasBufferedPosition(at:number){
    if(this.audio.readyState<3||!Number.isFinite(this.audio.duration))return false;
    const ranges=this.audio.buffered;if(!ranges)return false;
    for(let i=0;i<ranges.length;i++)if(ranges.start(i)<=at&&ranges.end(i)>=Math.min(this.audio.duration,at+.2))return true;
    return false;
  }
  private restorePosition(final:boolean,metadata=false){
    if(!this.restorePending||!this.audioReady||(!metadata&&this.audio.readyState<3))return;
    const at=Math.min(this.restoredAt,Math.max(0,this.audio.duration-.05));
    if(final)this.restorePending=false;
    if(Math.abs(this.audio.currentTime-at)>.03)this.audio.currentTime=at;
  }
  private observeStartup(expected:number,retrying:boolean){
    let previous:number|undefined,stalledSince=0;const began=performance.now();
    const seeking=()=>{previous=undefined;stalledSince=0;};
    const cleanup=()=>{clearInterval(timer);this.audio.removeEventListener('seeking',seeking);if(this.stopStartup===cleanup)this.stopStartup=undefined;};
    const timer=setInterval(()=>{
      if(expected!==this.token||!this.wantedPlayback||this.settings.mode!=='audio'){cleanup();return;}
      const now=performance.now(),at=this.audio.currentTime;
      if(!this.audio.paused&&!this.audio.seeking&&this.audio.readyState>=2){
        if(previous!==undefined&&Math.abs(at-previous)>.03){if(this.audioTimer)clearTimeout(this.audioTimer);this.audioTimer=undefined;this.restoredAt=0;cleanup();return;}
        previous=at;
      }else previous=undefined;
      const full=this.audio.networkState===1&&!this.audio.paused&&!this.audio.seeking&&this.hasBufferedPosition(Math.max(at,this.restoredAt));
      if(!full)stalledSince=0;
      else if(!stalledSince)stalledSince=now;
      else if(now-stalledSince>=1000){
        cleanup();
        if(retrying){if(this.audioTimer)clearTimeout(this.audioTimer);this.audioFailed=true;this.wantedPlayback=false;this.token++;this.audio.pause();this.playing=false;this.busy=false;this.status='音频播放失败，请轻点重试。';this.changed();return;}
        const resume=Math.max(at,this.restoredAt);this.pause();this.settings.audioPositions[this.positionKey]=resume;this.loadAudio();void this.play(true);return;
      }
      if(now-began>6000)cleanup();
    },250);
    this.audio.addEventListener('seeking',seeking);this.stopStartup=cleanup;
  }
  private speak() {
    if(!this.synth) return;
    this.refreshVoices();
    if(!this.voices.length){this.wantedPlayback=false;this.playing=false;this.busy=false;this.status='未找到英语语音，请使用内置 MP3。';this.changed();return;}
    let at=0;
    const units:{text:string;start:number;end:number;segment:number;pause:number}[]=[];
    const choices=this.settings.loop==='sentence'?[this.selectedSentence]:this.sentences;
    choices.forEach(s=>{const segment=this.sentences.indexOf(s),text=s.pronunciationText??s.speechText;units.push({text,start:at,end:at+text.length,segment,pause:Math.max(this.profile.sentenceGapMs,this.settings.loop==='sentence'?this.profile.loopGapMs:0)});at+=text.length+2;});
    const unit=units.find(u=>this.speechOffset<u.end);
    if(!unit){this.finished();return;}
    const start=Math.max(this.speechOffset,unit.start),chunk=unit.text.slice(start-unit.start),expected=++this.token;
    if(!chunk.trim()) { this.finished(); return; }
    const utterance=new SpeechSynthesisUtterance(chunk);
    this.utterance=utterance; utterance.lang='en-US'; utterance.rate=this.settings.rate*(this.settings.preset==='continuous'?1:.88);
    utterance.voice=this.voices.find(v=>v.voiceURI===this.settings.voice) ?? this.voices.find(v=>v.localService) ?? this.voices[0];
    utterance.lang=utterance.voice?.lang ?? 'en-US';
    utterance.onstart=()=>{ if(expected!==this.token)return; this.speechActiveIndex=unit.segment;this.playing=true; this.busy=false; this.status='英语朗读中'; this.changed(); };
    utterance.onboundary=e=>{ if(expected!==this.token)return; this.speechOffset=start+e.charIndex; this.save(false); this.changed(); };
    utterance.onend=()=>{ if(expected!==this.token)return; this.speechOffset=unit.end+2; this.save();const recall=this.profile.recallFactor?Math.max(2400,chunk.split(/\s+/).length*420*this.profile.recallFactor):0;this.speechTimer=setTimeout(()=>{if(expected!==this.token)return;if(this.speechOffset>=this.text.length){if(this.settings.loop==='sentence'){this.speechOffset=0;this.speak();}else this.finished();}else this.speak();},Math.max(unit.pause,recall)); };
    utterance.onerror=e=>{ if(expected!==this.token)return; this.playing=false; this.busy=false; this.status='朗读中断（'+e.error+'）。请轻点播放重试，或切换英语语音。'; this.changed(); };
    this.synth.speak(utterance); this.changed();
  }
  select(id: string, autoplay = this.playing || this.busy, restart = false) {
    if(!chapters.some(c=>c.id===id)) return;
    if(id===this.current.id&&!restart){if(autoplay&&!this.playing&&!this.busy)void this.play();return;}
    this.pause(); this.settings.chapter=id;
    if(this.settings.loop==='sentence')this.settings.selectedSentences[id]??=this.sentences[0].id;
    if(restart) { this.settings.audioPositions[this.positionKeyFor(id)]=0; this.settings.speechPositions[id]=0; }
    this.speechOffset=this.settings.speechPositions[id] ?? 0;
    if(this.settings.mode==='audio') this.loadAudio();
    this.status='已选择：'+this.current.title; this.save(); this.changed();
    if(autoplay) void this.play();
  }
  step(direction: number) { this.select(chapters[(this.index+direction+chapters.length)%chapters.length].id, this.playing || this.busy, true); }
  setMode(mode: Mode) {
    if(mode===this.settings.mode)return;
    this.pause(); this.settings.mode=mode; this.speechOffset=this.settings.speechPositions[this.current.id] ?? 0;
    if(mode==='audio')this.loadAudio();
    this.status=mode==='audio' ? 'MP3 模式 · 请轻点播放' : '浏览器朗读 · 锁屏时可能中断';
    this.save(); this.changed();
  }
  setRate(rate: number) {
    const resume=this.playing||this.busy;
    if(this.settings.mode==='speech')this.pause();
    const requested=safeNumber(rate,.7,.55,1);this.settings.rate=rates.reduce((a,b)=>Math.abs(b-requested)<Math.abs(a-requested)?b:a); this.audio.playbackRate=this.mediaRate; this.save(); this.changed();
    if(resume && this.settings.mode==='speech')void this.play();
  }
  setVoice(uri: string) {
    const resume=this.playing||this.busy;
    this.pause(); this.settings.voice=uri; this.save(); this.changed(); if(resume)void this.play();
  }
  selectSentence(id:string){
    if(!this.sentences.some(u=>u.id===id))return;
    const resume=this.playing||this.busy;if(this.settings.loop==='sentence')this.pause();
    this.settings.selectedSentences[this.current.id]=id;this.settings.manualSentences[this.current.id]=true;
    if(this.settings.loop==='sentence'){this.settings.audioPositions[this.positionKey]=0;this.speechOffset=0;if(this.settings.mode==='audio')this.loadAudio();}
    this.save();this.changed();if(resume&&this.settings.loop==='sentence')void this.play();
  }
  setLoop(loop:LoopMode){
    if(loop===this.settings.loop)return;
    const old=this.settings.loop,resume=this.playing||this.busy,active=this.activeSentenceId;
    if(old==='sentence'||loop==='sentence'){
      this.pause();
      if(loop==='sentence'&&!this.settings.manualSentences[this.current.id])this.settings.selectedSentences[this.current.id]=active??this.sentences[0].id;
      this.settings.loop=loop;this.speechOffset=0;
      if(old==='sentence'){const cue=library.timings[this.settings.preset][this.current.id].find(t=>t.sentenceId===this.selectedSentence.id);this.settings.audioPositions[this.positionKey]=cue?.start??0;}
      if(this.settings.mode==='audio')this.loadAudio();this.save();this.changed();if(resume)void this.play();return;
    }
    this.settings.loop=loop;this.audio.loop=loop==='one';this.save();this.changed();
  }
  setPreset(preset:Preset){
    if(!['continuous','slow','recite'].includes(preset)||preset===this.settings.preset)return;
    const resume=this.playing||this.busy,segment=this.activeSegment,activeId=this.activeSentenceId;
    this.pause();this.settings.preset=preset;
    if(this.settings.loop!=='sentence'&&this.settings.audioPositions[this.positionKey]===undefined&&segment>=0)this.settings.audioPositions[this.positionKey]=(library.timings[preset][this.current.id]?.find(t=>t.sentenceId===activeId)??library.timings[preset][this.current.id]?.[segment])?.start??0;
    if(this.settings.mode==='audio')this.loadAudio();this.save();this.changed();if(resume)void this.play();
  }
  seek(ratio: number) {
    ratio=safeNumber(ratio,0,0,1);
    if(this.settings.mode==='audio') {
      if(this.duration>0) this.audio.currentTime=ratio*this.duration;
      this.restorePending=false;this.restoredAt=this.audio.currentTime;
    } else {
      const resume=this.playing||this.busy; this.pause();
      const at=Math.floor(ratio*this.text.length);
      const space=this.text.indexOf(' ',at);
      this.speechOffset=at===0?0:space<0?this.text.length:space+1;
      if(resume)void this.play();
    }
    this.save(); this.changed();
  }
  loadAudio() {
    this.audioReady = false;
    this.loopRestartAllowed=false;
    this.audioFailed=false;
    const source=this.audioSource;
    this.audio.pause(); this.audio.loop=(this.settings.loop==='one'||this.settings.loop==='sentence'); this.audio.playbackRate=this.mediaRate;
    // Every newly loaded sentence starts whole. Seeking a saved per-preset
    // offset during remote metadata loading can strand WebKit on partial data.
    // Pause/resume and explicit seeking keep the existing media element/position.
    if(this.settings.loop==='sentence')this.settings.audioPositions[this.positionKey]=0;
    this.restoredAt=this.settings.audioPositions[this.positionKey] ?? 0;
    this.restorePending=this.restoredAt>0;
    if(source) this.audio.src=source; else this.audio.removeAttribute('src');
    this.audio.load();
  }
  private finished() {
    if(this.settings.loop==='sentence'){this.playing=false;this.busy=false;this.audio.currentTime=0;void this.play();return;}
    const completed=this.current.id;
    const completedKey=this.positionKey;
    const preferred=chapters.filter(c=>c.inMainLoop),list=preferred.length?preferred:chapters,index=list.findIndex(c=>c.id===completed);
    let next: number|null;
    if(this.settings.loop==='one')next=this.index;
    else if(index>=0){const target=nextIndex(index,list.length,this.settings.loop);next=target===null?null:chapters.indexOf(list[target]);}
    else {const after=chapters.findIndex((c,i)=>i>this.index&&c.inMainLoop);next=this.settings.loop==='off'?null:after>=0?after:chapters.indexOf(list[0]);}
    if(next===null) { this.wantedPlayback=false;this.playing=false; this.busy=false; this.status='本列表已播放完毕'; this.changed(); this.save(); return; }
    this.select(chapters[next].id,true,true);
    this.settings.audioPositions[completedKey]=0;this.settings.speechPositions[completed]=0;
    this.save();
  }
  importFile(id: string, file: File) {
    if(!chapters.some(c=>c.id===id) || !/\.mp3$/i.test(file.name) || file.size===0) throw Error('请选择非空的 .mp3 文件。');
    const previous=this.imported.get(id), current=id===this.current.id, resume=current && this.settings.mode==='audio' && (this.playing||this.busy);
    if(current && this.settings.mode==='audio')this.pause();
    const url=URL.createObjectURL(file);
    this.imported.set(id,{url,name:file.name});
    if(current && this.settings.mode==='audio') { this.settings.audioPositions[this.positionKey]=0; this.loadAudio(); }
    if(previous)URL.revokeObjectURL(previous.url);
    this.status='已在本机关联：'+file.name+'。刷新后需要重新导入。'; this.changed();
    if(resume)void this.play();
  }
  removeFile(id: string) {
    const previous=this.imported.get(id); if(!previous)return;
    if(id===this.current.id && this.settings.mode==='audio')this.pause();
    this.imported.delete(id);
    if(id===this.current.id && this.settings.mode==='audio') { this.settings.audioPositions[this.positionKey]=0; this.loadAudio(); }
    URL.revokeObjectURL(previous.url); this.status='已移除本地关联'; this.changed();
  }
  private configureMediaSession() {
    if(!('mediaSession' in navigator))return;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play:()=>{if(this.settings.mode==='audio')void this.play();},
      pause:()=>this.pause(), stop:()=>{this.pause();this.seek(0);},
      previoustrack:()=>this.step(-1),nexttrack:()=>this.step(1),
      seekto:d=>{if(this.duration)this.seek((d.seekTime ?? 0)/this.duration);},
      seekbackward:d=>{if(this.duration)this.seek((this.position-(d.seekOffset??10))/this.duration);},
      seekforward:d=>{if(this.duration)this.seek((this.position+(d.seekOffset??10))/this.duration);}
    };
    for(const [action,handler] of Object.entries(handlers))try{navigator.mediaSession.setActionHandler(action as MediaSessionAction,handler!);}catch{/* Individual actions vary by browser. */}
  }
  private updateMediaSession() {
    if(!('mediaSession' in navigator))return;
    try {
      if(this.settings.mode!=='audio') {
        navigator.mediaSession.playbackState='none'; navigator.mediaSession.metadata=null; navigator.mediaSession.setPositionState?.(); return;
      }
      if(typeof MediaMetadata!=='undefined' && navigator.mediaSession.metadata?.title!==this.current.title) navigator.mediaSession.metadata=new MediaMetadata({title:this.current.title,artist:'听一遍',album:'考研英语作文磨耳朵'});
      navigator.mediaSession.playbackState=this.playing?'playing':'paused';
      if(this.duration>0)navigator.mediaSession.setPositionState?.({duration:this.duration,playbackRate:this.audio.playbackRate,position:Math.min(this.duration,this.position)});
      else navigator.mediaSession.setPositionState?.();
    } catch {/* Unsupported Media Session features must never stop playback. */}
  }
}

