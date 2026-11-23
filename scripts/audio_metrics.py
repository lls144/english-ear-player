"""Decode real MP3 at 4x sampling; measure peaks, seams and speech loudness."""
import array,hashlib,json,math,subprocess


def onset_limits(settings, preset, cues):
 limits={}
 for cue in cues:
  ident=cue['sentenceId']
  rules=settings.get('sentenceOverrides',{}).get(ident,{})
  limit={**rules.get('all',{}),**rules.get(preset,{})}.get('maxOnsetHissMs')
  if limit is not None:
   if type(limit) is not int or not 0<=limit<=240:raise ValueError('Invalid onset limit for '+ident)
   limits[ident]=limit
 return limits


def onset_hiss_ms(pcm, start, end):
 # The decoder measures peaks at 96 kHz. Inspect the original 24 kHz grid
 # here, where squared first differences expose a sustained high band.
 samples=pcm[round(start*96000):round(min(start+1.24,end)*96000):4]
 onset=None
 for pos in range(0,min(24000,len(samples)-239),240):
  if sum(x*x for x in samples[pos:pos+240])>240*.004**2:
   onset=pos
   break
 if onset is None:return None
 longest=run=0
 for pos in range(onset,min(onset+5760,len(samples)-479),480):
  block=samples[pos:pos+480]
  energy=sum(x*x for x in block)
  difference=sum((current-previous)**2 for previous,current in zip(block,block[1:]))
  if energy>=480*.012**2 and difference<.45*energy:break
  run=run+1 if energy>=480*.012**2 and difference>=1.85*energy else 0
  longest=max(longest,run)
 return 20*longest


def measure(file,cues,ffmpeg,limits=None):
 sr=96000
 raw=subprocess.run([ffmpeg,'-v','error','-i',str(file),'-ac','1','-ar',str(sr),'-f','f32le','-'],capture_output=True,check=True).stdout
 pcm=array.array('f');pcm.frombytes(raw)
 if not pcm:raise ValueError('Empty decoded MP3')
 peak=max(map(abs,pcm));rms=math.sqrt(sum(x*x for x in pcm)/len(pcm));edge=max(max(map(abs,pcm[:1920])),max(map(abs,pcm[-1920:])))
 boundary=0.;energies=[];max_step=0.;spikes=[]
 for t in cues:
  for at in [t['start'],t['speechEnd'],t['end']]:
   window=pcm[max(0,round((at-.01)*sr)):min(len(pcm),round((at+.01)*sr))]
   if window:boundary=max(boundary,max(map(abs,window)))
  speech=pcm[round(t['start']*sr):round(t['speechEnd']*sr)]
  active=[x for x in speech if abs(x)>.003]
  energies.append(round(20*math.log10(math.sqrt(sum(x*x for x in active)/max(1,len(active)))+1e-12),2))
  # A 4x adjacent-sample jump is a diagnostic, not a naturalness score.
  local=max((abs(speech[i]-speech[i-1]) for i in range(1,len(speech))),default=0)
  max_step=max(max_step,local)
  if local>.18:
   for i in range(1,len(speech)):
    if abs(speech[i]-speech[i-1])<=.18:continue
    neighborhood=speech[max(0,i-288):max(0,i-20)]+speech[i+20:i+288]
    nrms=math.sqrt(sum(x*x for x in neighborhood)/max(1,len(neighborhood)))
    crest=max(abs(speech[i]),abs(speech[i-1]))/max(.001,nrms)
    if crest>12:spikes.append({'sentenceId':t['sentenceId'],'time':round(t['start']+i/sr,5),'crestOverNeighborhood':round(crest,2)})
 result={'durationSeconds':round(len(pcm)/sr,4),'truePeakDbTP':round(20*math.log10(peak+1e-12),2),'rmsDb':round(20*math.log10(rms+1e-12),2),'edgePeak':round(edge,7),'joinPeak':round(boundary,7),'maxStep4x':round(max_step,5),'speechActiveRmsDb':energies,'spikeFlags':spikes,'clipped':peak>=.99}
 result['passed']=peak<.85 and rms>.003 and edge<.003 and boundary<.004 and not spikes and abs(len(pcm)/sr-cues[-1]['end'])<.03
 if limits:
  onsets={t['sentenceId']:onset_hiss_ms(pcm,t['start'],t['speechEnd']) for t in cues if t['sentenceId'] in limits}
  result['onsetHissMs']=onsets
  result['passed']=result['passed'] and all(onsets.get(ident) is not None and onsets[ident]<=limit for ident,limit in limits.items())
 return result
