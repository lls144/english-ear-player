"""Fault-injection regression for the acoustic gate; no AI dependencies."""
import math, tempfile, unittest, wave, array
from pathlib import Path
import imageio_ffmpeg
from audio_metrics import measure

class AcousticGate(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.file=Path(self.temp.name)/'fixture.wav';self.sr=24000
  self.pcm=[.08*math.sin(2*math.pi*220*i/self.sr)*min(1,(i/self.sr-.2)/.03,(1.7-i/self.sr)/.03) if .2<i/self.sr<1.7 else 0. for i in range(self.sr*3)]
 def tearDown(self):self.temp.cleanup()
 def result(self,end=3):
  with wave.open(str(self.file),'wb') as f:
   f.setnchannels(1);f.setsampwidth(2);f.setframerate(self.sr);f.writeframes(array.array('h',(round(max(-1,min(1,x))*32767) for x in self.pcm)).tobytes())
  return measure(self.file,[dict(sentenceId='fixture',start=0,speechEnd=2,end=end)],imageio_ffmpeg.get_ffmpeg_exe())
 def test_smooth_padded_speech_passes(self):self.assertTrue(self.result()['passed'])
 def test_clipping_fails(self):
  self.pcm[self.sr]=1.;self.assertFalse(self.result()['passed'])
 def test_isolated_impulse_fails(self):
  self.pcm[self.sr//2:self.sr//2+4800]=[0.]*4800;self.pcm[self.sr//2+2400]=.8
  r=self.result();self.assertFalse(r['passed']);self.assertTrue(r['spikeFlags'])
 def test_voiced_join_fails(self):
  self.pcm[round(1.98*self.sr):round(2.02*self.sr)]=[.1]*round(.04*self.sr)
  self.assertFalse(self.result()['passed'])
 def test_wrong_decoded_timeline_fails(self):self.assertFalse(self.result(2.8)['passed'])

if __name__=='__main__':unittest.main()
