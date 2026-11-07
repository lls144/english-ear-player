"""Fetch pinned public Kokoro assets locally; never put model weights in Git."""
import argparse,hashlib,urllib.request,concurrent.futures,io,zipfile,os,json,shutil
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];REV='1939ad2a8e416c0acfeecc08a694d14ef25f2231'
BASE='https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/'+REV+'/'
ASSETS={'upstream.onnx':('onnx/model.onnx',325532232,'8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb'),'af_heart.bin':('voices/af_heart.bin',522240,'d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'),'af_bella.bin':('voices/af_bella.bin',522240,'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b')}
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def download(target,remote,size,digest):
 if target.exists() and sha(target)==digest:return
 folder=target.parent/(target.name+'.parts');folder.mkdir(exist_ok=True);step=4*1024*1024
 def part(i):
  start=i*step;end=min(size-1,start+step-1);p=folder/str(i)
  if p.exists() and p.stat().st_size==end-start+1:return
  for attempt in range(4):
   try:
    request=urllib.request.Request(BASE+remote+'?part='+str(i)+'&attempt='+str(attempt),headers={'Range':f'bytes={start}-{end}'})
    with urllib.request.urlopen(request,timeout=90) as r:
     if r.status!=206 and not(start==0 and size<step and r.status==200):raise ValueError('Server did not honor range')
     data=r.read()
    if len(data)!=end-start+1:raise ValueError('Incomplete asset range')
    p.write_bytes(data);return
   except Exception:
    if attempt==3:raise
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:list(pool.map(part,range((size+step-1)//step)))
 temporary=target.with_suffix(target.suffix+'.download')
 with temporary.open('wb') as f:
  for i in range((size+step-1)//step):f.write((folder/str(i)).read_bytes())
 if sha(temporary)!=digest:raise ValueError('Model integrity mismatch')
 os.replace(temporary,target)
def main():
 p=argparse.ArgumentParser();p.add_argument('--record-pack',action='store_true');a=p.parse_args();folder=ROOT/'.local/models/kokoro';folder.mkdir(parents=True,exist_ok=True)
 # A verified prior local transfer can be reused without another download.
 previous=folder/'hf-full.onnx'
 if previous.exists() and sha(previous)==ASSETS['upstream.onnx'][2] and not (folder/'upstream.onnx').exists():shutil.copy2(previous,folder/'upstream.onnx')
 for name,(remote,size,digest) in ASSETS.items():download(folder/name,remote,size,digest)
 # Expose an existing duration tensor; all trained initializers remain unchanged.
 # This permits precise removal of inference-only context around very short words.
 import onnx
 model=onnx.load(folder/'upstream.onnx');before=[hashlib.sha256(t.SerializeToString()).hexdigest() for t in model.graph.initializer]
 model.graph.node.append(onnx.helper.make_node('Identity',['/encoder/Cast_output_0'],['duration'],name='ExposeSourceDurations'))
 model.graph.output.append(onnx.helper.make_tensor_value_info('duration',onnx.TensorProto.INT64,[None,None]))
 assert before==[hashlib.sha256(t.SerializeToString()).hexdigest() for t in model.graph.initializer]
 onnx.save_model(model,folder/'model.onnx')
 output=folder/'voices.bin'
 with zipfile.ZipFile(output,'w') as z:
  for name in ['af_bella','af_heart']:
   values=np.fromfile(folder/(name+'.bin'),dtype='<f4').reshape(510,1,256);buffer=io.BytesIO();np.lib.format.write_array(buffer,values,version=(1,0),allow_pickle=False)
   info=zipfile.ZipInfo(name+'.npy',date_time=(1980,1,1,0,0,0));info.create_system=0;info.compress_type=zipfile.ZIP_STORED;z.writestr(info,buffer.getvalue())
 settings_file=ROOT/'content/audio-settings.json';settings=json.loads(settings_file.read_text(encoding='utf8'))
 if a.record_pack:
  settings['voicesSha256']=sha(output);settings['modelSha256']=sha(folder/'model.onnx');settings['upstreamModelSha256']=ASSETS['upstream.onnx'][2];settings_file.write_text(json.dumps(settings,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
 if settings['modelSha256']!=sha(folder/'model.onnx') or settings['voicesSha256']!=sha(output):raise ValueError('Pinned model or voice pack differs from release settings')
 print(json.dumps({'modelSha256':sha(folder/'model.onnx'),'voicesSha256':sha(output),'voices':['af_heart','af_bella'],'provider':'CPUExecutionProvider'}))
if __name__=='__main__':main()
