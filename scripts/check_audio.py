"""Decode actual MP3 bytes to PCM and measure duration, RMS, peaks, silence, and text provenance."""
from pathlib import Path
import json, subprocess, array, math, hashlib
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
materials=json.loads((ROOT/'content/materials.json').read_text(encoding='utf-8'))
manifest=json.loads((ROOT/'content/audio-manifest.json').read_text(encoding='utf-8'))
receipts=json.loads((ROOT/'content/audio-provenance.json').read_text(encoding='utf-8'))
result=[]
for c in materials['chapters']:
    file=ROOT/'public'/manifest[c['id']]
    pcm=subprocess.run([ffmpeg,'-v','error','-i',str(file),'-f','f32le','-ac','1','-ar','16000','-'],capture_output=True,check=True).stdout
    samples=array.array('f'); samples.frombytes(pcm)
    duration=len(samples)/16000
    rms=math.sqrt(sum(s*s for s in samples)/len(samples))
    peak=max(abs(s) for s in samples)
    voiced=sum(abs(s)>.01 for s in samples)/len(samples)
    receipt=next(r for r in receipts if r['id']==c['id'])
    text='\n\n'.join(s['text'] for s in c['segments'])
    text_match=hashlib.sha256(text.encode()).hexdigest()==receipt['textSha256']
    audio_match=hashlib.sha256(file.read_bytes()).hexdigest()==receipt['mp3Sha256']
    row=dict(id=c['id'],durationSeconds=round(duration,3),rmsDb=round(20*math.log10(max(rms,1e-12)),2),peak=round(peak,4),aboveMinus40dBPercent=round(voiced*100,2),textHashMatches=text_match,audioHashMatches=audio_match,bytes=file.stat().st_size)
    assert duration>2 and rms>.005 and peak>.05 and voiced>.05 and text_match and audio_match, row
    result.append(row)
out=ROOT/'.local/qa/audio-analysis.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))

