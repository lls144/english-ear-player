"""Local waveform regression, with a fake neural model explicitly identified."""
import tempfile,unittest
from pathlib import Path
import numpy as np
from kokoro_audio import ROOT,load,synth_clip,compose,plan

class Tokenizer:
 def known(self,p):return p
 def phonemize(self,p,lang):return p
 def tokenize(self,p):return [1]*20
class Model:
 tokenizer=Tokenizer()
 def __init__(self):
  self.calls=0;self.raw=np.sin(np.arange(24000)*.1).astype('float32')*.03
  self.raw[:400]=0;self.raw[-2400:]*=.002
 def get_voice_style(self,v):return v
 def _style_for(self,v,n):return n
 def _infer(self,t,style,speed):self.calls+=1;return self.raw.copy(),np.ones(22)

class SentencePipeline(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.cache=Path(self.temp.name);self.settings=load(ROOT/'content/audio-settings.json');self.model=Model()
 def tearDown(self):self.temp.cleanup()
 def test_whole_sentence_is_one_neural_call(self):
  synth_clip(self.model,'A message about something, which merits discussion.',.7,self.settings,self.cache)
  self.assertEqual(self.model.calls,1)
 def test_quiet_tail_is_retained_in_full(self):
  out=synth_clip(self.model,'A message.',.7,self.settings,self.cache);head=4800
  self.assertEqual(len(out),24000+4800+8400)
  np.testing.assert_allclose(out[head:head+24000],self.model.raw*1.5,atol=1e-7)
  self.assertGreater(float(np.max(np.abs(out[head+21600:head+24000]))),0)
 def test_waveform_cache_reuses_only_matching_processing(self):
  synth_clip(self.model,'A message.',.7,self.settings,self.cache);synth_clip(self.model,'A message.',.7,self.settings,self.cache);self.assertEqual(self.model.calls,1)
  changed={**self.settings,'fadeMs':13};synth_clip(self.model,'A message.',.7,changed,self.cache);self.assertEqual(self.model.calls,2)
 def test_phrase_kind_changes_reading_cache_key(self):
  u=dict(id='unit',segmentId='parent',kind='source-example',displayText='Original text.',speechText='Original text.',pronunciationText='Original text.')
  self.assertNotEqual(plan([u]),plan([{**u,'kind':'source-phrase'}]))
 def test_single_loop_gap_only_follows_complete_clip(self):
  u=dict(id='unit',segmentId='parent',kind='source-template',speechText='A message about something, which merits discussion.',pronunciationText='A message about something, which merits discussion.')
  out,cues=compose([u],'recite',self.model,self.settings,self.cache,single=True)
  self.assertEqual(self.model.calls,1);self.assertEqual(len(cues),1);self.assertGreaterEqual(cues[0]['gapSeconds'],2.6)
  self.assertEqual(float(np.max(np.abs(out[round(cues[0]['speechEnd']*24000):]))),0)

if __name__=='__main__':unittest.main()
