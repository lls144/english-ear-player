import library from './library.generated.json';
import { nextIndex, safeNumber, speechChunk, type LoopMode } from './logic';
export const chapters = library.chapters;
export type Chapter = typeof chapters[number];
export type Mode = 'speech' | 'audio';
type Settings = { chapter: string; mode: Mode; loop: LoopMode; rate: number; voice: string; audioPositions: Record<string, number>; speechPositions: Record<string, number> };
export const storageKey = 'english-ear-player:v1';
const defaults: Settings = {chapter: chapters[0].id, mode: Object.keys(library.audio).length ? 'audio' : 'speech', loop: 'all', rate: 1, voice: '', audioPositions: {}, speechPositions: {}};
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
  private wantedPlayback = false;
  private loopRestartAllowed = false;
  private audioFailed = false;
  private notify: () => void;
  private synth = this.speechSupported ? window.speechSynthesis : undefined;
  constructor(notify: () => void) {
    this.notify = notify;
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (raw && typeof raw === 'object') {
        this.settings.chapter = chapters.some(c => c.id === raw.chapter) ? raw.chapter : defaults.chapter;
        this.settings.mode = raw.mode === 'audio' ? 'audio' : 'speech';
        this.settings.loop = ['all','one','off'].includes(raw.loop) ? raw.loop : 'all';
        this.settings.rate = safeNumber(raw.rate, 1, 0.5, 2);
        this.settings.voice = typeof raw.voice === 'string' ? raw.voice : '';
        for (const c of chapters) {
          this.settings.audioPositions[c.id] = safeNumber(raw.audioPositions?.[c.id],0,0,86400);
          this.settings.speechPositions[c.id] = safeNumber(raw.speechPositions?.[c.id],0,0,this.textFor(c).length);
        }
      }
    } catch { this.status = '无法读取本机记录；仍可正常播放。'; }
    if (!this.speechSupported && this.settings.mode === 'speech') this.settings.mode = 'audio';
    this.speechOffset = this.settings.speechPositions[this.current.id] ?? 0;
    this.audio.preload = 'metadata';
    this.audio.controls = true;
    this.audio.setAttribute('aria-label', '系统 MP3 播放器');
    this.audio.addEventListener('play', () => {
      if(this.settings.mode !== 'audio' || this.audio.error) { this.audio.pause(); return; }
      this.wantedPlayback = true;
      this.playing = true; this.busy = false; this.status = 'MP3 播放中'; this.changed();
    });
    this.audio.addEventListener('pause', () => {
      if(this.settings.mode !== 'audio' || !this.audio.paused) return;
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
      if (this.settings.mode === 'audio') { this.settings.rate = safeNumber(this.audio.playbackRate,1,0.5,2); this.save(); this.changed(); }
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if(this.audio.currentSrc !== this.audioSource) return;
      this.audioReady = true;
      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        this.audio.currentTime = Math.min(this.restoredAt, Math.max(0,this.audio.duration - 0.05));
      }
      this.restoredAt = 0; this.audio.playbackRate = this.settings.rate; this.changed();
    });
    this.audio.addEventListener('ended', () => { if (this.settings.mode === 'audio') this.finished(); });
    this.audio.addEventListener('error', () => {
      if(this.settings.mode !== 'audio' || !this.audio.getAttribute('src')) return;
      this.busy = false; this.playing = false;
      this.wantedPlayback=false; this.audio.pause();
      this.audioFailed=true;
      this.status = '音频无法读取或格式不受支持。请重新导入真实 MP3，或检查内置文件。'; this.changed();
    });
    this.audio.addEventListener('waiting', () => { if(this.settings.mode === 'audio') { this.status = '正在缓冲音频…'; this.changed(); } });
    this.audio.addEventListener('playing', () => { if(this.settings.mode === 'audio' && !this.audio.error) { this.status = 'MP3 播放中'; this.changed(); } });
    this.refreshVoices();
    this.synth?.addEventListener('voiceschanged', this.refreshVoices);
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => { if(document.hidden) this.save(); });
    this.configureMediaSession();
    if(this.settings.mode === 'audio') this.loadAudio();
  }
  get current() { return chapters.find(c => c.id === this.settings.chapter)!; }
  get index() { return chapters.indexOf(this.current); }
  textFor(c: Chapter) { return c.segments.map(s => s.text).join('\n\n'); }
  get text() { return this.textFor(this.current); }
  get audioSource(): string | undefined {
    return this.imported.get(this.current.id)?.url ?? this.builtinSource(this.current.id);
  }
  builtinSource(id: string): string | undefined {
    const file = (library.audio as Record<string,string>)[id];
    return file ? new URL(file, document.baseURI).href : undefined;
  }
  get position() { return this.settings.mode === 'audio' ? this.audio.currentTime : this.speechOffset; }
  get duration() { return this.settings.mode === 'audio' ? (this.audioReady && Number.isFinite(this.audio.duration) ? this.audio.duration : 0) : this.text.length; }
  get progress() { return this.duration > 0 ? Math.min(1,this.position/this.duration) : 0; }
  get activeSegment() {
    if (this.settings.mode === 'audio') return -1; // MP3 files have no invented word/sentence timestamps.
    let offset = 0;
    return this.current.segments.findIndex(s => { const end=offset+s.text.length+2; const found=this.speechOffset < end; offset=end; return found; });
  }
  refreshVoices = () => {
    this.voices = this.synth?.getVoices().filter(v => /^en(?:-|_)/i.test(v.lang) || v.lang.toLowerCase()==='en') ?? [];
    this.notify();
  };
  changed() { this.updateMediaSession(); this.notify(); }
  save(force = true) {
    const now = Date.now();
    if (!force && now-this.savedAt<1000) return;
    this.savedAt = now;
    if(this.settings.mode==='audio' && this.audioReady && this.audio.currentSrc===this.audioSource) this.settings.audioPositions[this.current.id]=this.audio.currentTime;
    if(this.settings.mode==='speech') this.settings.speechPositions[this.current.id]=this.speechOffset;
    try { localStorage.setItem(storageKey, JSON.stringify(this.settings)); } catch { /* Storage can be disabled. Playback stays available. */ }
  }
  pause() {
    this.wantedPlayback=false; this.loopRestartAllowed=false;
    this.token++; this.busy = false; this.playing = false;
    this.synth?.cancel(); this.utterance = undefined;
    this.audio.pause(); this.status = '已暂停'; this.save(); this.changed();
  }
  async play() {
    if(this.busy || this.playing) return;
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
    this.busy=true; this.status='正在打开音频…'; this.changed();
    const expected = ++this.token;
    const startedAt=this.audio.currentTime;
    setTimeout(()=>{
      if(expected!==this.token || this.settings.mode!=='audio' || !this.wantedPlayback)return;
      if(this.audio.readyState<2 || (!this.audio.paused && this.audio.currentTime<=startedAt+.02)){
        this.token++;this.audioFailed=true;this.wantedPlayback=false;this.audio.pause();
        this.playing=false;this.busy=false;this.status='音频加载失败或长时间无响应。请检查文件或网络后重试。';this.changed();
      }
    },5000);
    try { await this.audio.play(); }
    catch (e) {
      if(expected!==this.token) return;
      this.busy=false; this.playing=false;
      this.status=e instanceof DOMException && e.name==='NotAllowedError' ? '浏览器阻止了自动播放。请轻点播放继续。' : '播放失败，请确认文件是可播放的 MP3 后重试。'; this.changed();
    }
  }
  private speak() {
    if(!this.synth) return;
    const start=this.speechOffset, chunk=speechChunk(this.text,start), expected=++this.token;
    if(!chunk.trim()) { this.finished(); return; }
    const utterance=new SpeechSynthesisUtterance(chunk);
    this.utterance=utterance; utterance.lang='en-US'; utterance.rate=this.settings.rate;
    utterance.voice=this.voices.find(v=>v.voiceURI===this.settings.voice) ?? this.voices.find(v=>v.localService) ?? this.voices[0];
    utterance.lang=utterance.voice?.lang ?? 'en-US';
    utterance.onstart=()=>{ if(expected!==this.token)return; this.playing=true; this.busy=false; this.status='英语朗读中 · 适合前台聆听'; this.changed(); };
    utterance.onboundary=e=>{ if(expected!==this.token)return; this.speechOffset=start+e.charIndex; this.save(false); this.changed(); };
    utterance.onend=()=>{ if(expected!==this.token)return; this.speechOffset=start+chunk.length; this.save(); if(this.speechOffset>=this.text.length)this.finished(); else this.speak(); };
    utterance.onerror=e=>{ if(expected!==this.token)return; this.playing=false; this.busy=false; this.status='朗读中断（'+e.error+'）。请轻点播放重试，或切换英语语音。'; this.changed(); };
    this.synth.speak(utterance); this.changed();
  }
  select(id: string, autoplay = this.playing || this.busy, restart = false) {
    if(!chapters.some(c=>c.id===id)) return;
    this.pause(); this.settings.chapter=id;
    if(restart) { this.settings.audioPositions[id]=0; this.settings.speechPositions[id]=0; }
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
    this.settings.rate=safeNumber(rate,1,0.5,2); this.audio.playbackRate=this.settings.rate; this.save(); this.changed();
    if(resume && this.settings.mode==='speech')void this.play();
  }
  setVoice(uri: string) {
    const resume=this.playing||this.busy;
    this.pause(); this.settings.voice=uri; this.save(); this.changed(); if(resume)void this.play();
  }
  setLoop(loop: LoopMode) { this.settings.loop=loop; this.audio.loop=loop==='one'; this.save(); this.changed(); }
  seek(ratio: number) {
    ratio=safeNumber(ratio,0,0,1);
    if(this.settings.mode==='audio') {
      if(this.duration>0) this.audio.currentTime=ratio*this.duration;
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
    this.audio.pause(); this.audio.loop=this.settings.loop==='one'; this.audio.playbackRate=this.settings.rate;
    this.restoredAt=this.settings.audioPositions[this.current.id] ?? 0;
    if(source) this.audio.src=source; else this.audio.removeAttribute('src');
    this.audio.load();
  }
  private finished() {
    const completed=this.current.id;
    const next=nextIndex(this.index,chapters.length,this.settings.loop);
    if(next===null) { this.playing=false; this.busy=false; this.status='本列表已播放完毕'; this.changed(); this.save(); return; }
    this.select(chapters[next].id,true,true);
    this.settings.audioPositions[completed]=0; this.settings.speechPositions[completed]=0;
    this.save();
  }
  importFile(id: string, file: File) {
    if(!chapters.some(c=>c.id===id) || !/\.mp3$/i.test(file.name) || file.size===0) throw Error('请选择非空的 .mp3 文件。');
    const previous=this.imported.get(id), current=id===this.current.id, resume=current && this.settings.mode==='audio' && (this.playing||this.busy);
    if(current && this.settings.mode==='audio')this.pause();
    const url=URL.createObjectURL(file);
    this.imported.set(id,{url,name:file.name});
    if(current && this.settings.mode==='audio') { this.settings.audioPositions[id]=0; this.loadAudio(); }
    if(previous)URL.revokeObjectURL(previous.url);
    this.status='已在本机关联：'+file.name+'。刷新后需要重新导入。'; this.changed();
    if(resume)void this.play();
  }
  removeFile(id: string) {
    const previous=this.imported.get(id); if(!previous)return;
    if(id===this.current.id && this.settings.mode==='audio')this.pause();
    this.imported.delete(id);
    if(id===this.current.id && this.settings.mode==='audio') { this.settings.audioPositions[id]=0; this.loadAudio(); }
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
      if(this.duration>0)navigator.mediaSession.setPositionState?.({duration:this.duration,playbackRate:this.settings.rate,position:Math.min(this.duration,this.position)});
      else navigator.mediaSession.setPositionState?.();
    } catch {/* Unsupported Media Session features must never stop playback. */}
  }
}

