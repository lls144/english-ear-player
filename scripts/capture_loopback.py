"""Sample the current default output for QA only; never opens a microphone."""
import soundcard as sc
import numpy as np
import json,sys
speaker=sc.default_speaker()
mic=sc.get_microphone(id=speaker.id,include_loopback=True)
with mic.recorder(samplerate=16000,channels=2) as recorder:
    print('READY',flush=True)
    data=recorder.record(numframes=16000*int(sys.argv[1]))
    rms=float(np.sqrt(np.mean(data**2)));peak=float(np.max(np.abs(data)))
print(json.dumps({'rms':rms,'peak':peak,'seconds':len(data)/16000}),flush=True)
