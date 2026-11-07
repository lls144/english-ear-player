"""Incremental offline SAPI/Piper synthesis, staged validation, then transactional registration."""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, time, math, array
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(b): return hashlib.sha256(b).hexdigest()
def run(args,**kw): subprocess.run([str(a) for a in args],check=True,**kw)
def load(p,default):
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default
def atomic(p,obj):
    p.parent.mkdir(parents=True,exist_ok=True);t=p.with_suffix(p.suffix+'.tmp')
    t.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');os.replace(t,p)
def analyze(ffmpeg,p):
    data=subprocess.run([ffmpeg,'-v','error','-i',str(p),'-f','f32le','-ar','16000','-ac','1','-'],check=True,capture_output=True).stdout
    s=array.array('f');s.frombytes(data)
    if not s:raise ValueError('Empty decoded MP3')
    duration=len(s)/16000;rms=math.sqrt(sum(x*x for x in s)/len(s));peak=max(abs(x) for x in s)
    if duration<1 or rms<.005 or peak<.05:raise ValueError('Invalid/silent MP3: '+p.name)
    return dict(durationSeconds=round(duration,3),rmsDb=round(20*math.log10(rms),2),peak=round(peak,4))
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine',choices=['sapi','piper'],default='sapi' if os.name=='nt' else 'piper')
    p.add_argument('--voice',default='Microsoft Zira Desktop');p.add_argument('--model',type=Path)
    p.add_argument('--ffmpeg');p.add_argument('--output',type=Path,default=ROOT/'.local/audio')
    p.add_argument('--register',action='store_true');p.add_argument('--force',action='store_true')
    a=p.parse_args();ffmpeg=a.ffmpeg or shutil.which('ffmpeg')
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    chapters=load(ROOT/'content/materials.json',{})['chapters'];old=load(ROOT/'content/audio-provenance.json',[])
    old_manifest=load(ROOT/'content/audio-manifest.json',{})
    work=ROOT/'.local/generated'/str(time.time_ns());work.mkdir(parents=True)
    cache=ROOT/'.local/audio-cache';cache.mkdir(parents=True,exist_ok=True)
    changed=[];reuse=[];plans=[]
    for c in chapters:
        if not re.fullmatch('[a-z0-9-]+',c['id']):raise ValueError('Unsafe id')
        text='\n\n'.join(s['text'] for s in c['segments']);text_hash=sha(text.encode())
        voice=a.voice if a.engine=='sapi' else (a.model.name if a.model else '')
        key=sha((text_hash+a.engine+voice+'mp3-96k-mono-v1').encode())
        receipt=next((x for x in old if x['id']==c['id']),None);existing=ROOT/'public/assets/audio'/(c['id']+'.mp3')
        cached=cache/(key+'.mp3')
        unchanged=receipt and existing.exists() and receipt['textSha256']==text_hash and receipt['mp3Sha256']==sha(existing.read_bytes()) and receipt['voice']==voice and receipt['engine']==a.engine
        plan=dict(id=c['id'],text=text,textSha256=text_hash,voice=voice,key=key,file=work/(c['id']+'.mp3'))
        if unchanged and not a.force:
            if not cached.exists():shutil.copy2(existing,cached)
            plan['source']=existing;reuse.append(c['id'])
        elif cached.exists() and not a.force:
            plan['source']=cached;changed.append(c['id'])
        else:changed.append(c['id'])
        plans.append(plan)
    synth=[x for x in plans if 'source' not in x]
    if synth and a.engine=='sapi':
        if os.name!='nt':raise RuntimeError('SAPI is local Windows only')
        input_file=work/'input.json';input_file.write_text(json.dumps([{'id':x['id'],'text':x['text']} for x in synth]),encoding='utf-8')
        run(['powershell.exe','-NoProfile','-File',ROOT/'scripts/sapi.ps1','-InputJson',input_file,'-OutputDirectory',work,'-Voice',a.voice])
    if synth and a.engine=='piper':
        if not a.model or not a.model.is_file() or not Path(str(a.model)+'.json').is_file():raise ValueError('Existing local Piper model/config required')
        for x in synth:run([sys.executable,'-m','piper','-m',a.model.resolve(),'-f',work/(x['id']+'.wav')],input=x['text'].encode())
    receipts=[];manifest={}
    for x in plans:
        if 'source' in x:shutil.copy2(x['source'],x['file'])
        else:run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',work/(x['id']+'.wav'),'-codec:a','libmp3lame','-b:a','96k','-ac','1','-ar','44100',x['file']])
        stats=analyze(ffmpeg,x['file'])
        # Large duration mismatches catch truncated or accidentally empty chapter synthesis.
        words=len(x['text'].split())
        if not max(1,words/12)<stats['durationSeconds']<max(30,words*3):raise ValueError('Implausible chapter duration')
        receipts.append(dict(id=x['id'],engine=a.engine,voice=x['voice'],textSha256=x['textSha256'],mp3Sha256=sha(x['file'].read_bytes()),bytes=x['file'].stat().st_size,**stats))
        manifest[x['id']]='assets/audio/'+x['id']+'.mp3'
        if not (cache/(x['key']+'.mp3')).exists():shutil.copy2(x['file'],cache/(x['key']+'.mp3'))
    # No public writes happen until every chapter has successfully decoded and passed silence checks.
    targets=[ROOT/'content/audio-provenance.json',ROOT/'content/audio-manifest.json']
    targets += [ROOT/'public'/v for v in set(old_manifest.values())|set(manifest.values())]
    backups={str(t):t.read_bytes() if t.exists() else None for t in targets}
    if a.register:
        try:
            for x in plans:
                target=ROOT/'public'/manifest[x['id']];target.parent.mkdir(parents=True,exist_ok=True)
                if not target.exists() or sha(target.read_bytes())!=sha(x['file'].read_bytes()):os.replace(x['file'],target)
            for key,value in old_manifest.items():
                if key not in manifest:
                    target=(ROOT/'public'/value).resolve()
                    if target.parent!=(ROOT/'public/assets/audio').resolve():raise ValueError('Unsafe obsolete audio path')
                    if target.exists():target.unlink()
            atomic(ROOT/'content/audio-provenance.json',receipts);atomic(ROOT/'content/audio-manifest.json',manifest)
        except Exception:
            for name,data in backups.items():
                t=Path(name)
                if data is not None:t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(data)
                elif t.exists():t.unlink()
            raise
    else:
        a.output.mkdir(parents=True,exist_ok=True)
        for x in plans:shutil.copy2(x['file'],a.output/x['file'].name)
    atomic(ROOT/'.local/generated/receipts.json',receipts)
    summary=dict(changed=changed,reused=reuse,generated=[x['id'] for x in synth],deleted=[k for k in old_manifest if k not in manifest],chapters=len(chapters),segments=sum(len(c['segments']) for c in chapters))
    atomic(ROOT/'.local/generated/last-update.json',summary);print(json.dumps(summary))
if __name__=='__main__':main()

