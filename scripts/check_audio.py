"""Decode all production MP3s and validate source, voice, timelines and ASR receipts."""
from pathlib import Path
import json,subprocess,array,math,hashlib
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text(encoding='utf8'))
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(x):
 if isinstance(x,float) and x.is_integer():return int(x)
 if isinstance(x,list):return [canonical(v) for v in x]
 if isinstance(x,dict):return {k:canonical(v) for k,v in x.items()}
 return x
def digest(x):return sha(json.dumps(canonical(x),ensure_ascii=False,separators=(',',':')).encode())
materials=load('content/materials.json');manifest=load('content/audio-manifest.json');receipts=load('content/audio-provenance.json');timings=load('content/audio-timings.json');settings=load('content/audio-settings.json');quality=load('content/audio-quality.json')['entries'];result=[]
assert len(manifest)==len(receipts)==len(quality)==len(materials['chapters'])*3
for r in receipts:
 c=next(c for c in materials['chapters'] if c['id']==r['chapterId']);file=ROOT/'public'/manifest[r['id']];cue=timings[r['id']]
 body=file.read_bytes();assert body[:3]==b'ID3' or body[0]==255
 pcm=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(file),'-f','f32le','-ac','1','-ar','16000','-'],capture_output=True,check=True).stdout
 s=array.array('f');s.frombytes(pcm);duration=len(s)/16000;rms=math.sqrt(sum(v*v for v in s)/len(s));peak=max(abs(v) for v in s);voiced=sum(abs(v)>.01 for v in s)/len(s)
 assert duration>2 and rms>.005 and .05<peak<.99 and voiced>.04,r['id']
 assert sha(body)==r['mp3Sha256']
 assert sha((chr(10)*2).join(s['text'] for s in c['segments']).encode())==r['textSha256']
 assert digest([{'id':s['id'],'parts':s['parts']} for s in c['segments']])==r['readingPlanSha256']
 assert digest({**settings,'presets':{r['preset']:settings['presets'][r['preset']]}})==r['settingsSha256']
 assert r['engine']=='kokoro-onnx' and r['modelSha256']==settings['modelSha256'] and r['voice']==settings['voice']
 assert digest(cue)==r['timingsSha256'] and abs(duration-cue[-1]['end'])<.15 and len(cue)==len(c['segments'])
 for t,segment in zip(cue,c['segments']):
  assert t['segmentId']==segment['id'] and 0<=t['start']<t['speechEnd']<=t['end']+.01
  gap=s[round((t['speechEnd']+.10)*16000):round((t['end']-.10)*16000)]
  if gap:assert math.sqrt(sum(v*v for v in gap)/len(gap))<.004,('gap',r['id'],segment['id'])
 q=next(q for q in quality if q['id']==r['id']);assert q['passed'] and all(q[k]==r[k] for k in ['mp3Sha256','readingPlanSha256','settingsSha256'])
 result.append(dict(id=r['id'],durationSeconds=round(duration,3),rmsDb=round(20*math.log10(rms),2),peak=round(peak,4),voicedPercent=round(voiced*100,2),sourceVoiceTimingsAndASRHashesMatch=True))
out=ROOT/'.local/qa/audio-analysis.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result,indent=2))
