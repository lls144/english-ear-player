"""Independent local ASR audit, bound to exact published MP3 and reading hashes."""
import argparse,json,re,sys,subprocess,hashlib,time,os
from pathlib import Path
import numpy as np
import imageio_ffmpeg
from faster_whisper import WhisperModel
ROOT=Path(__file__).resolve().parents[1]
AUDIT='faster-whisper-base.en-cpu-int8-no-prompt-cue-bounded-v2'
def load(p,default=None):return json.loads(p.read_text(encoding='utf8')) if p.exists() else default
def sha(b):return hashlib.sha256(b).hexdigest()
def words(s):return re.findall('[a-z]+',s.lower().replace('’',"'").replace("'",''))
def distance(a,b):
 d=list(range(len(b)+1))
 for i,x in enumerate(a):
  q=[i+1]
  for j,y in enumerate(b):q.append(min(q[-1]+1,d[j+1]+1,d[j]+(x!=y)))
  d=q
 return d[-1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--force',action='store_true');a=p.parse_args()
 receipts=load(ROOT/'content/audio-provenance.json');manifest=load(ROOT/'content/audio-manifest.json');materials=load(ROOT/'content/materials.json');cues=load(ROOT/'content/audio-timings.json');prior=load(ROOT/'content/audio-quality.json',{}).get('entries',[]);asr=None;rows=[];detail=[]
 for r in receipts:
  old=next((x for x in prior if x['id']==r['id']),None);file=ROOT/'public'/manifest[r['id']]
  if sha(file.read_bytes())!=r['mp3Sha256']:raise ValueError('Audio changed before quality audit')
  if old and old.get('audit')==AUDIT and not a.force and all(old.get(k)==r.get(k) for k in ['mp3Sha256','readingPlanSha256','settingsSha256']):rows.append(old);continue
  if asr is None:asr=WhisperModel(os.environ.get('EAR_ASR_MODEL_DIR',str(ROOT/'.local/models/whisper-base-en')),device='cpu',compute_type='int8',cpu_threads=4)
  raw=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(file),'-f','f32le','-ar','16000','-ac','1','-'],capture_output=True,check=True).stdout;audio=np.frombuffer(raw,dtype='<f4').copy()
  # The production MP3 includes recall gaps of up to 12 seconds. Bound speech
  # by its real assembly cues for ASR, retaining all speech and internal slots.
  # Only known inter-item silence is shortened; the published file is untouched.
  full_segments,_=asr.transcribe(audio,language='en',beam_size=5,temperature=0,condition_on_previous_text=False)
  full_transcript=' '.join(s.text.strip() for s in full_segments)
  bounded=np.concatenate([np.concatenate([audio[round(t['start']*16000):round((t['speechEnd']+.10)*16000)],np.zeros(4800,dtype=np.float32)]) for t in cues[r['id']]])
  segments,_=asr.transcribe(bounded,language='en',beam_size=5,temperature=0,condition_on_previous_text=False,word_timestamps=True,vad_filter=True,vad_parameters={'min_silence_duration_ms':500,'speech_pad_ms':200})
  result=list(segments);transcript=' '.join(s.text.strip() for s in result)
  c=next(c for c in materials['chapters'] if c['id']==r['chapterId']);reference=' '.join(p['text'] for s in c['segments'] for p in s['parts'] if 'text' in p)
  expected=words(reference);recognized=words(transcript);edits=distance(expected,recognized);wer=edits/max(1,len(expected))
  # Homophonic orthography is reported, not quietly treated as perfect ASR.
  normalized=transcript.lower().replace("they're up on",'thereupon').replace('they are upon','thereupon').replace('there upon','thereupon').replace('all together','altogether').replace('further more','furthermore')
  adjusted=distance(expected,words(normalized))/max(1,len(expected))
  row={k:r[k] for k in ['id','mp3Sha256','readingPlanSha256','settingsSha256']};row.update(referenceWords=len(expected),rawWordErrorRate=round(wer,4),normalizedWordErrorRate=round(adjusted,4),fullTrackWordErrorRate=round(distance(expected,words(full_transcript))/max(1,len(expected)),4),passed=adjusted<=.18,audit=AUDIT)
  rows.append(row);detail.append({'id':r['id'],'reference':reference,'transcript':transcript,'fullTrackTranscript':full_transcript,'wordErrorRate':wer,'normalizedWordErrorRate':adjusted,'asrWords':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in result for w in s.words or []]})
  print(json.dumps({'id':r['id'],'rawWER':round(wer,4),'normalizedWER':round(adjusted,4),'passed':row['passed']}),flush=True)
 out=ROOT/'.local/qa/audio-asr-full.json';out.parent.mkdir(parents=True,exist_ok=True)
 if detail:
  previous=load(out,[]);updated={d['id']:d for d in previous};updated.update({d['id']:d for d in detail});out.write_text(json.dumps(list(updated.values()),ensure_ascii=False,indent=2),encoding='utf8')
 report={'schemaVersion':1,'method':'Actual MP3 decoded; known inter-item recall silence shortened to 300ms for cue-bounded English ASR without a reference prompt. Full-track error rates retained. Homophonic orthography normalized explicitly. ASR is not a subjective naturalness score.','asrModel':'Systran/faster-whisper-base.en','entries':rows}
 if not all(r['passed'] for r in rows):raise ValueError('Audio ASR needs investigation; see private detailed report')
 (ROOT/'content/audio-quality.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
 print(json.dumps({'audited':len(detail),'reused':len(rows)-len(detail),'passed':True}),flush=True)
if __name__=='__main__':main()
