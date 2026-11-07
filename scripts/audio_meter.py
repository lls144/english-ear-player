"""Read only the isolated Firefox test process's Windows audio-session meter.
Does not change endpoint volume, mute, routing, or any user audio settings.
"""
from pathlib import Path
from pycaw.pycaw import AudioUtilities
from pycaw.api.endpointvolume import IAudioMeterInformation
import time, sys, json
ROOT=Path(__file__).resolve().parents[1]
device=AudioUtilities.GetSpeakers()
result={'masterMute':device.EndpointVolume.GetMute(),'masterVolume':device.EndpointVolume.GetMasterVolumeLevelScalar(),'samples':[]}
print('READY',flush=True)
end=time.monotonic()+int(sys.argv[1])
while time.monotonic()<end:
    for session in AudioUtilities.GetAllSessions():
        try:
            process=session.Process
            if process and process.name().lower()=='firefox.exe' and Path(process.exe()).resolve().is_relative_to(ROOT/'.local/browsers'):
                result['samples'].append(session._ctl.QueryInterface(IAudioMeterInformation).GetPeakValue())
        except Exception:
            continue
    time.sleep(.05)
result['peak']=max(result['samples'],default=0)
print(json.dumps(result),flush=True)

