"""Local pinned G2P regression; public CI does not download or run the model."""
import json, subprocess, re
from kokoro_audio import ROOT,load,engine

model=engine(load(ROOT/'content/audio-settings.json'))
code="import {pronunciation} from './scripts/reading.mjs';console.log(JSON.stringify(['An era of [趋势 A] and [趋势 B].','Ask sb. to do sth.'].map(t=>pronunciation(t))));"
rows=json.loads(subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,capture_output=True,check=True).stdout)
phonemes=[model.tokenizer.phonemize(r['pronunciationText'],lang='en-us') for r in rows]
# 'ay' and 'ey' actually yield /aɪ/ in this pinned eSpeak, despite their spelling.
assert 'eɪ' in phonemes[0] and 'aɪ' not in phonemes[0] and re.search('b[ˈˌ]?iː',phonemes[0]),phonemes[0]
assert rows[1]['speechText']=='Ask somebody to do something.'
assert re.search('s[ˈˌ]?ʌm',phonemes[1]),phonemes[1]
print(json.dumps({'passed':2,'displaySpeech':rows,'actualPhonemes':phonemes}))
