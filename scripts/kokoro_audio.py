"""Local-only, source-faithful Kokoro synthesis with measured segment timelines."""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, time
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(o):
 def numbers(x):
  if isinstance(x,float) and x.is_integer():return int(x)
  if isinstance(x,list):return [numbers(v) for v in x]
  if isinstance(x,dict):return {k:numbers(v) for k,v in x.items()}
  return x
 return json.dumps(numbers(o),ensure_ascii=False,separators=(',',':'))
def load(p,default=None):return json.loads(p.read_text(encoding='utf-8-sig')) if p.exists() else default
def write_json(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);temp=p.with_suffix(p.suffix+'.tmp');temp.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');os.replace(temp,p)
def decode(ffmpeg,file,sr=24000):
 b=subprocess.run([ffmpeg,'-v','error','-i',str(file),'-f','f32le','-ac','1','-ar',str(sr),'-'],capture_output=True,check=True).stdout
 return np.frombuffer(b,dtype='<f4').copy()
def stats(audio,sr):
 rms=float(np.sqrt(np.mean(audio**2)));peak=float(np.max(np.abs(audio)))
 if len(audio)<sr or rms<.005 or peak<.05 or peak>1.02:raise ValueError('Empty, silent, clipped or truncated audio')
 return dict(durationSeconds=round(len(audio)/sr,3),rmsDb=round(20*np.log10(rms),2),peak=round(peak,4))
def engine(settings):
 import onnxruntime as ort
 import importlib.metadata
 from kokoro_onnx import Kokoro
 if importlib.metadata.version('kokoro-onnx')!=settings['engineVersion']:raise ValueError('Unverified Kokoro runtime version')
 models=Path(os.environ.get('EAR_TTS_MODEL_DIR',ROOT/'.local/models/kokoro'))
 model=models/'model.onnx';voices=models/'voices.bin'
 for file,digest in [(model,settings['modelSha256']),(voices,settings['voicesSha256'])]:
  if not file.is_file() or sha(file.read_bytes())!=digest:raise ValueError('Missing or unverified local model: '+file.name)
 options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
 session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
 return Kokoro.from_session(session,str(voices))
def synth_clip(model,text,speed,settings,cache):
 if not re.search('[a-zA-Z]',text) or re.search(r'[\u3400-\u9fff\[\]×]|do sth\b|\.\.\.|/|==|\*\*',text):raise ValueError('Non-source placeholder in speech request')
 # Punctuation controls prosody; no English words are appended to a phrase.
 prompt=text if re.search(r'[.!?]$',text) else text+'.'
 words=len(re.findall(r'[A-Za-z]+',text));speed=max(speed,settings.get('shortPhraseMinSpeed',.85)) if words<=3 else speed
 key=sha(canonical([settings['engineVersion'],settings['modelSha256'],settings['voicesSha256'],settings['voice'],settings['language'],settings['processor'],speed,prompt]).encode())
 file=cache/(key+'.npy');meta=cache/(key+'.json')
 if file.exists() and meta.exists():
  data=np.load(file,allow_pickle=False);info=load(meta)
  if info.get('sha256')==sha(data.tobytes()):return data
 if words<=6:
  if not model.has_timings:raise ValueError('Short-phrase synthesis requires verified model duration output')
  phonemes=model.tokenizer.known(model.tokenizer.phonemize(prompt,lang=settings['language']));unit=model.tokenizer.tokenize(phonemes)
  context=unit+[model.tokenizer.vocab[' ']]+unit+[model.tokenizer.vocab[' ']]+unit
  samples,durations=model._infer(context,model._style_for(model.get_voice_style(settings['voice']),len(context)),speed)
  if len(durations)!=len(context)+2:raise ValueError('Invalid duration alignment')
  edges=np.rint(np.concatenate([[0],np.cumsum(durations)])*len(samples)/sum(durations)).astype(int)
  begin=len(unit)+2;end=2*len(unit)+2
  left=min(int(settings['sampleRate']*.08),(edges[begin]-edges[begin-2])//2);right=min(int(settings['sampleRate']*.08),(edges[end+1]-edges[end])//2)
  samples=samples[max(0,edges[begin]-left):min(len(samples),edges[end]+right)];sr=settings['sampleRate']
 else:samples,sr=model.create(prompt,voice=settings['voice'],speed=speed,lang=settings['language'])
 if sr!=settings['sampleRate']:raise ValueError('Unexpected model sample rate')
 samples=np.asarray(samples,dtype=np.float32).flatten()
 voiced=np.flatnonzero(np.abs(samples)>.003)
 if not len(voiced):raise ValueError('Model returned silence')
 # Preserve 80/120 ms of breathing room and final consonants; never cut at words.
 samples=samples[max(0,int(voiced[0])-int(sr*.08)):min(len(samples),int(voiced[-1])+int(sr*.12))]
 if len(samples)<sr*.12:raise ValueError('Model truncated an utterance')
 rms=float(np.sqrt(np.mean(samples**2)));gain=min(4.,.105/max(rms,.0001),.78/max(float(np.max(np.abs(samples))),.0001));samples*=gain
 fade=min(int(sr*.005),len(samples)//4);samples[:fade]*=np.linspace(0,1,fade);samples[-fade:]*=np.linspace(1,0,fade)
 np.save(file,samples,allow_pickle=False);write_json(meta,dict(text=text,prompt=prompt,voice=settings['voice'],speed=speed,sha256=sha(samples.tobytes())))
 return samples
def compose(chapter,preset,model,settings,cache):
 sr=settings['sampleRate'];policy=settings['presets'][preset];pieces=[];cursor=0;cues=[]
 def put(a):
  nonlocal cursor
  pieces.append(a);cursor+=len(a)
 def silence(seconds):put(np.zeros(round(seconds*sr),dtype=np.float32))
 for s in chapter['segments']:
  start=cursor/sr;speech_end=start;speech_seconds=0
  for part in s['parts']:
   if 'text' in part:
    # Original sentence punctuation is retained so internal commas and full stops
    # remain the model's prosodic cues. Slots are separate explicit silent parts.
    clip=synth_clip(model,part['text'],policy['modelSpeed'],settings,cache);put(clip);speech_seconds+=len(clip)/sr;speech_end=cursor/sr
   else:silence(part['pauseMs']/1000*policy['slotFactor'])
  base=policy['phraseGapMs'] if s['kind']=='source-phrase' else policy['sentenceGapMs']
  gap=max(base/1000,min(12,speech_seconds*policy['recallFactor']))
  silence(gap)
  cues.append(dict(segmentId=s['id'],start=round(start,4),speechEnd=round(speech_end,4),end=round(cursor/sr,4),gapSeconds=round(gap,4)))
 return np.concatenate(pieces),cues
def verify_pauses(audio,cues,sr):
 for c in cues:
  if c['end']-c['speechEnd']>.25:
   gap=audio[round((c['speechEnd']+.08)*sr):round((c['end']-.08)*sr)]
   if len(gap) and float(np.sqrt(np.mean(gap**2)))>.004:raise ValueError('Expected recall/phrase gap is not silent')
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--register',action='store_true');p.add_argument('--force',action='store_true');a=p.parse_args()
 import imageio_ffmpeg
 ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();settings=load(ROOT/'content/audio-settings.json');materials=load(ROOT/'content/materials.json')
 if materials.get('policy')!='verbatim-source-only':raise ValueError('Legacy/editorial content is forbidden')
 if set(settings['presets'])!={'continuous','slow','recite'} or any(not re.fullmatch('[a-z0-9-]+',c['id']) for c in materials['chapters']):raise ValueError('Unsafe chapter or preset identifier')
 index={e['id']:e for e in load(ROOT/'content/source-index.json')['entries']}
 for c in materials['chapters']:
  for s in c['segments']:
   if s['id'] not in index or sha(s['text'].encode())!=index[s['id']]['textSha256'] or sha(canonical(s['parts']).encode())!=index[s['id']]['partsSha256']:raise ValueError('Material or speech is not source-verified')
 work=ROOT/'.local/generated'/str(time.time_ns());work.mkdir(parents=True);cache=ROOT/'.local/audio-cache/kokoro';cache.mkdir(parents=True,exist_ok=True)
 clips=cache/'clips';clips.mkdir(exist_ok=True)
 old=load(ROOT/'content/audio-provenance.json',[]);old_manifest=load(ROOT/'content/audio-manifest.json',{});old_cues=load(ROOT/'content/audio-timings.json',{})
 if any(not re.fullmatch(r'assets/audio/[A-Za-z0-9_-]+\.mp3',f) for f in old_manifest.values()):raise ValueError('Unsafe old audio manifest')
 receipts=[];manifest={};timelines={};generated=[];changed=[];reused=[];synthesizer=None;started=time.perf_counter()
 for chapter in materials['chapters']:
  text_hash=sha('\n\n'.join(s['text'] for s in chapter['segments']).encode());plan_hash=sha(canonical([dict(id=s['id'],parts=s['parts']) for s in chapter['segments']]).encode())
  for preset in settings['presets']:
   ident=chapter['id']+('' if preset=='continuous' else '-'+preset);file=work/(ident+'.mp3');scoped={**settings,'presets':{preset:settings['presets'][preset]}};settings_hash=sha(canonical(scoped).encode());key=sha((text_hash+plan_hash+settings_hash).encode())
   prior=next((r for r in old if r['id']==ident),None);existing=ROOT/'public/assets/audio'/(ident+'.mp3');cached=cache/(key+'.mp3');cached_cues=cache/(key+'.cues.json')
   valid=prior and prior.get('engine')=='kokoro-onnx' and prior.get('textSha256')==text_hash and prior.get('readingPlanSha256')==plan_hash and prior.get('settingsSha256')==settings_hash and existing.is_file() and sha(existing.read_bytes())==prior['mp3Sha256'] and ident in old_cues
   if valid and not a.force:
    shutil.copy2(existing,file);cues=old_cues[ident];reused.append(ident)
   elif cached.is_file() and cached_cues.is_file() and not a.force:
    shutil.copy2(cached,file);cues=load(cached_cues);changed.append(ident)
   else:
    if synthesizer is None:synthesizer=engine(settings)
    samples,cues=compose(chapter,preset,synthesizer,settings,clips);wav=work/(ident+'.wav');sf.write(wav,samples,settings['sampleRate'],subtype='PCM_16')
    subprocess.run([ffmpeg,'-v','error','-y','-i',str(wav),'-codec:a','libmp3lame','-b:a',settings['bitrate'],'-ac','1','-ar',str(settings['sampleRate']),str(file)],check=True)
    generated.append(ident);changed.append(ident)
   decoded=decode(ffmpeg,file);measurement=stats(decoded,settings['sampleRate']);verify_pauses(decoded,cues,settings['sampleRate'])
   if abs(len(decoded)/settings['sampleRate']-cues[-1]['end'])>.15:raise ValueError('Audio/timeline duration mismatch')
   receipt=dict(id=ident,chapterId=chapter['id'],preset=preset,engine=settings['engine'],engineVersion=settings['engineVersion'],model=settings['model'],modelSha256=settings['modelSha256'],voice=settings['voice'],license=settings['license'],textSha256=text_hash,readingPlanSha256=plan_hash,settingsSha256=settings_hash,timingsSha256=sha(canonical(cues).encode()),mp3Sha256=sha(file.read_bytes()),bytes=file.stat().st_size,**measurement)
   receipts.append(receipt);manifest[ident]='assets/audio/'+ident+'.mp3';timelines[ident]=cues
   if not cached.exists():shutil.copy2(file,cached);write_json(cached_cues,cues)
   print(json.dumps(dict(id=ident,generated=ident in generated,**measurement)),flush=True)
 # All files are staged, fully decoded and pause-checked before any public write.
 targets=[ROOT/'content/audio-provenance.json',ROOT/'content/audio-manifest.json',ROOT/'content/audio-timings.json']+[ROOT/'public'/f for f in set(old_manifest.values())|set(manifest.values())]
 backups={str(f):f.read_bytes() if f.is_file() else None for f in targets}
 if a.register:
  try:
   for ident,f in manifest.items():
    target=ROOT/'public'/f;target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists() or sha(target.read_bytes())!=sha((work/(ident+'.mp3')).read_bytes()):shutil.copy2(work/(ident+'.mp3'),target)
   for ident,f in old_manifest.items():
    if ident not in manifest:
     target=(ROOT/'public'/f).resolve()
     if target.parent!=(ROOT/'public/assets/audio').resolve():raise ValueError('Unsafe obsolete audio path')
     if target.exists():target.unlink()
   write_json(ROOT/'content/audio-provenance.json',receipts);write_json(ROOT/'content/audio-manifest.json',manifest);write_json(ROOT/'content/audio-timings.json',timelines)
  except Exception:
   for f,data in backups.items():
    target=Path(f)
    if data is not None:target.write_bytes(data)
    elif target.exists():target.unlink()
   raise
 summary=dict(changed=changed,reused=reused,generated=generated,deleted=[i for i in old_manifest if i not in manifest],chapters=len(materials['chapters']),segments=sum(len(c['segments']) for c in materials['chapters']),engine='kokoro-onnx',seconds=round(time.perf_counter()-started,2))
 write_json(ROOT/'.local/generated/last-update.json',summary);print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
