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
def synth_clip(model,text,speed,settings,cache,pronunciation=None):
 if not re.search('[a-zA-Z]',text) or re.search(r'[\u3400-\u9fff\[\]×]|do sth\b|\.\.\.|/|==|\*\*',text):raise ValueError('Non-source placeholder in speech request: '+repr(text))
 # Punctuation controls prosody; no English words are appended to a phrase.
 spoken=pronunciation or text;prompt=spoken if re.search(r'[.!?]$',spoken) else spoken+'.'
 words=len(re.findall(r'[A-Za-z]+',text));speed=max(speed,settings.get('shortPhraseMinSpeed',.85)) if words<=3 else speed
 key=sha(canonical([settings['engineVersion'],settings['modelSha256'],settings['voicesSha256'],settings['voice'],settings['language'],settings['processor'],{k:v for k,v in settings.items() if k!='presets'},speed,prompt]).encode())
 file=cache/(key+'.npy');meta=cache/(key+'.json')
 if file.exists() and meta.exists():
  data=np.load(file,allow_pickle=False);info=load(meta)
  if info.get('sha256')==sha(data.tobytes()):return data
 # Synthesize one whole sentence/phrase. No repeated-context cropping.
 phonemes=model.tokenizer.known(model.tokenizer.phonemize(prompt,lang=settings['language']));tokens=model.tokenizer.tokenize(phonemes)
 # One neural invocation per whole sentence; no wrapper trimming or inserted comma pauses.
 samples,durations=model._infer(tokens,model._style_for(model.get_voice_style(settings['voice']),max(len(tokens),settings.get('styleLength',len(tokens)))),speed);sr=settings['sampleRate']
 max_phone=float(np.max(durations[1:-1]))*len(samples)/(sr*float(np.sum(durations))) if durations is not None else 0
 if max_phone>1.5:raise ValueError('Abnormal phoneme duration; regenerate this sentence locally: '+text)
 if sr!=settings['sampleRate']:raise ValueError('Unexpected model sample rate')
 samples=np.asarray(samples,dtype=np.float32).flatten()
 if not len(samples) or not np.isfinite(samples).all():raise ValueError('Invalid synthesis')
 # Never trim by amplitude: quiet final consonants and breaths belong to speech.
 active=samples[np.abs(samples)>max(.001,float(np.max(np.abs(samples)))*.02)]
 if len(active)<sr*.03:raise ValueError('Model returned silence')
 rms=float(np.sqrt(np.mean(active**2)))
 gain=min(settings['maxGain'],settings['activeRmsTarget']/max(rms,.0001),settings['peakCeiling']/max(float(np.max(np.abs(samples))),.0001));samples*=gain
 head=np.zeros(round(sr*settings['edgePaddingMs']['leading']/1000),dtype=np.float32);tail=np.zeros(round(sr*settings['edgePaddingMs']['trailing']/1000),dtype=np.float32)
 # Fade the raw waveform edge, retaining all samples; energy there is audited.
 fade=min(round(sr*settings['fadeMs']/1000),len(samples)//4)
 edge=max(float(np.max(np.abs(samples[:fade]))),float(np.max(np.abs(samples[-fade:]))))
 if edge>.004:raise ValueError('Voiced model edge requires local regeneration, not a destructive fade')
 head[-fade:]=np.linspace(0,float(samples[0]),fade);tail[:fade]=np.linspace(float(samples[-1]),0,fade)
 samples=np.concatenate([head,samples,tail])
 np.save(file,samples,allow_pickle=False);write_json(meta,dict(text=text,prompt=prompt,voice=settings['voice'],speed=speed,maxPhonemeSeconds=max_phone,phonemes=phonemes,sha256=sha(samples.tobytes())))
 return samples
def units(chapter):
 return [dict(**u,segmentId=s['id'],kind=s['kind']) for s in chapter['segments'] for u in s['sentences']]
def plan(items):return [dict(id=u['id'],segmentId=u['segmentId'],displayText=u['displayText'],speechText=u['speechText'],pronunciationText=u['pronunciationText'],kind=u['kind']) for u in items]
def scoped_settings(settings,preset,items):
 base={k:v for k,v in settings.items() if k!='sentenceOverrides'};matched={}
 for u in items:
  rules=settings.get('sentenceOverrides',{}).get(u['id'],{});rule={**rules.get('all',{}),**rules.get(preset,{})}
  if rule:matched[u['id']]=rule
 base['presets']={preset:settings['presets'][preset]}
 if matched:base['sentenceOverrides']=matched
 return base
def compose(items,preset,model,settings,cache,single=False):
 sr=settings['sampleRate'];policy=settings['presets'][preset];pieces=[];cursor=0;cues=[]
 for u in items:
  rules=settings.get('sentenceOverrides',{}).get(u['id'],{});rule={**rules.get('all',{}),**rules.get(preset,{})};effective={k:v for k,v in settings.items() if k!='sentenceOverrides'};effective.update(rule)
  clip=synth_clip(model,u['speechText'],rule.get('modelSpeed',policy['modelSpeed']),effective,cache,u.get('pronunciationText'));start=cursor/sr;pieces.append(clip);cursor+=len(clip);speech_end=cursor/sr
  base=policy['phraseGapMs'] if u['kind']=='source-phrase' else policy['sentenceGapMs']
  gap=max(base/1000,min(12,len(clip)/sr*policy['recallFactor']),policy['loopGapMs']/1000 if single else 0)
  silence=np.zeros(round(gap*sr),dtype=np.float32);pieces.append(silence);cursor+=len(silence)
  cues.append(dict(sentenceId=u['id'],segmentId=u['segmentId'],start=round(start,4),speechEnd=round(speech_end,4),end=round(cursor/sr,4),gapSeconds=round(gap,4)))
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
   if s['id'] not in index or sha(s['text'].encode())!=index[s['id']]['textSha256'] or sha(canonical(s['sentences']).encode())!=index[s['id']]['sentencesSha256'] or sha(canonical(s['parts']).encode())!=index[s['id']]['partsSha256']:raise ValueError('Material or speech is not source-verified')
 work=ROOT/'.local/generated'/str(time.time_ns());work.mkdir(parents=True);cache=ROOT/'.local/audio-cache/kokoro';cache.mkdir(parents=True,exist_ok=True)
 clips=cache/'clips';clips.mkdir(exist_ok=True)
 old=load(ROOT/'content/audio-provenance.json',[]);old_manifest=load(ROOT/'content/audio-manifest.json',{});old_cues=load(ROOT/'content/audio-timings.json',{})
 if any(not re.fullmatch(r'assets/audio/[A-Za-z0-9_-]+\.mp3',f) for f in old_manifest.values()):raise ValueError('Unsafe old audio manifest')
 receipts=[];manifest={};timelines={};generated=[];changed=[];reused=[];synthesizer=None;started=time.perf_counter()
 for chapter in materials['chapters']:
  chapter_units=units(chapter)
  tasks=[(chapter['id'],'chapter',chapter_units)]+[('sentence-'+u['id'],'sentence',[u]) for u in chapter_units]
  for base_id,kind,items in tasks:
   text_hash=sha('\n\n'.join(u['displayText'] for u in items).encode());reading_plan=plan(items);plan_hash=sha(canonical(reading_plan).encode())
   for preset in settings['presets']:
    ident=base_id+('' if preset=='continuous' else '-'+preset);file=work/(ident+'.mp3');scoped=scoped_settings(settings,preset,items);settings_hash=sha(canonical(scoped).encode());key=sha((text_hash+plan_hash+settings_hash+kind).encode())
    prior=next((r for r in old if r['id']==ident),None);existing=ROOT/'public/assets/audio'/(ident+'.mp3');cached=cache/(key+'.mp3');cached_cues=cache/(key+'.cues.json')
    valid=prior and prior.get('kind')==kind and prior.get('engine')=='kokoro-onnx' and prior.get('readingPlanSha256')==plan_hash and prior.get('settingsSha256')==settings_hash and existing.is_file() and sha(existing.read_bytes())==prior['mp3Sha256'] and ident in old_cues
    if valid and not a.force:
     shutil.copy2(existing,file);cues=old_cues[ident];reused.append(ident)
    elif cached.is_file() and cached_cues.is_file() and not a.force:
     shutil.copy2(cached,file);cues=load(cached_cues);changed.append(ident)
    else:
     if synthesizer is None:synthesizer=engine(settings)
     samples,cues=compose(items,preset,synthesizer,settings,clips,kind=='sentence');wav=work/(ident+'.wav');sf.write(wav,samples,settings['sampleRate'],subtype='PCM_16')
     subprocess.run([ffmpeg,'-v','error','-y','-i',str(wav),'-codec:a','libmp3lame','-b:a',settings['bitrate'],'-ac','1','-ar',str(settings['sampleRate']),str(file)],check=True)
     generated.append(ident);changed.append(ident)
    decoded=decode(ffmpeg,file);measurement=stats(decoded,settings['sampleRate']);verify_pauses(decoded,cues,settings['sampleRate'])
    if abs(len(decoded)/settings['sampleRate']-cues[-1]['end'])>.03:raise ValueError('Gapless MP3/timeline duration mismatch')
    receipt=dict(id=ident,chapterId=chapter['id'],kind=kind,**({'sentenceId':items[0]['id']} if kind=='sentence' else {}),preset=preset,engine=settings['engine'],engineVersion=settings['engineVersion'],model=settings['model'],modelSha256=settings['modelSha256'],voice=settings['voice'],license=settings['license'],textSha256=text_hash,speechTextSha256=sha(' '.join(u['speechText'] for u in items).encode()),readingPlanSha256=plan_hash,settingsSha256=settings_hash,timingsSha256=sha(canonical(cues).encode()),mp3Sha256=sha(file.read_bytes()),bytes=file.stat().st_size,**measurement)
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
 write_json(ROOT/'.local/generated/last-update.json',summary);print(json.dumps({k:len(v) if isinstance(v,list) else v for k,v in summary.items()}),flush=True)
if __name__=='__main__':main()
