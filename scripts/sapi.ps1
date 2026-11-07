param([Parameter(Mandatory=$true)][string]$InputJson,[Parameter(Mandatory=$true)][string]$OutputDirectory,[string]$Voice='Microsoft Zira Desktop')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$earSynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $earSynth.SelectVoice($Voice)
  if ($earSynth.Voice.Culture.TwoLetterISOLanguageName -ne 'en') { throw 'Select an installed English voice.' }
  $earChapters=Get-Content -LiteralPath $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach($earChapter in $earChapters) {
    $earSynth.SetOutputToWaveFile((Join-Path $OutputDirectory ($earChapter.id + '.wav')))
    $earSynth.Speak($earChapter.text)
    $earSynth.SetOutputToNull()
  }
} finally { $earSynth.Dispose() }

