"""Fault-injection regression for the acoustic gate; no AI dependencies."""
import math, tempfile, unittest, wave, array
from pathlib import Path
import imageio_ffmpeg
from audio_metrics import measure, onset_limits

class AcousticGate(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.file=Path(self.temp.name)/'fixture.wav';self.sr=24000
  self.pcm=[.08*math.sin(2*math.pi*220*i/self.sr)*min(1,(i/self.sr-.2)/.03,(1.7-i/self.sr)/.03) if .2<i/self.sr<1.7 else 0. for i in range(self.sr*3)]
 def tearDown(self):self.temp.cleanup()
 def result(self,end=3,limits=None):
  with wave.open(str(self.file),'wb') as f:
   f.setnchannels(1);f.setsampwidth(2);f.setframerate(self.sr);f.writeframes(array.array('h',(round(max(-1,min(1,x))*32767) for x in self.pcm)).tobytes())
  return measure(self.file,[dict(sentenceId='fixture',start=0,speechEnd=2,end=end)],imageio_ffmpeg.get_ffmpeg_exe(),limits)
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
 def test_watched_onset_rejects_sustained_hiss_inside_safe_edges(self):
  start=round(.20*self.sr)
  for i in range(round(.14*self.sr)):
   self.pcm[start+i]=.06*math.sin(2*math.pi*9500*i/self.sr)*min(i/240,1)
  self.assertTrue(self.result()['passed'])
  measured=self.result(limits={'fixture':20})
  self.assertFalse(measured['passed'])
  self.assertGreaterEqual(measured['onsetHissMs']['fixture'],100)
 def test_clean_onset_and_preset_scope(self):
  settings={'sentenceOverrides':{'fixture':{'slow':{'maxOnsetHissMs':20}}}}
  cues=[{'sentenceId':'fixture'},{'sentenceId':'another'}]
  self.assertEqual(onset_limits(settings,'continuous',cues),{})
  measured=self.result(limits=onset_limits(settings,'slow',cues))
  self.assertEqual(measured['onsetHissMs'],{'fixture':0})
  self.assertTrue(measured['passed'])
 def test_fricative_after_a_voiced_start_is_preserved(self):
  start=round(.32*self.sr)
  for i in range(round(.12*self.sr)):
   self.pcm[start+i]=.06*math.sin(2*math.pi*9500*i/self.sr)
  measured=self.result(limits={'fixture':20})
  self.assertEqual(measured['onsetHissMs'],{'fixture':0})
  self.assertTrue(measured['passed'])

if __name__=='__main__':unittest.main()
