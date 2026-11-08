# V1.2 audio and sentence boundaries

The model is unchanged: Kokoro-82M, af_heart, Apache-2.0 weights; kokoro-onnx 0.6.1 (MIT). Models and the isolated environment remain local and ignored. This version has 68 original entries and 69 real sentence/phrase units. Latest source adds two conclusion entries; no removed editorial sentence returns.

## Display and speech

`text` and `displayText` retain the selected original, including templates and alternatives. `speechText` uses only deterministic neutral replacements in reading.mjs; substitutions and stable source/sentence IDs are retained. `pronunciationText` spells neutral letter names eigh/bee for reliable G2P, without changing an original English article A. Unknown placeholders fail validation. A complete introduction before an unfilled whole-sentence slot ends naturally; no assertion is invented.

Example display: “Behind the drawing/picture lies a profound message about [主题词], which merits further discussion.” Speech: “Behind the drawing lies a profound message about something, which merits further discussion.” This is ONE neural request, with no slot silence. Trend A/B remain distinct; sth./sb. become something/somebody. True sentence boundaries, abbreviations and decimals are tested; commas, semicolons and nonrestrictive clauses do not split a sentence.

## Preserved speech and quiet seams

The previous repeated-context phrase splicing and amplitude trimming are removed. Inspection also found that kokoro-onnx's create wrapper trims by default and can add clause pauses. V1.2 tokenizes the whole sentence and makes one raw model inference, retaining ALL returned waveform samples. It does not add context words, overlap sentences or insert comma/placeholder silence.

Each waveform gets 200 ms leading and 350 ms trailing padding. A 12 ms continuity ramp is placed in that extra padding, never across generated consonants. A voiced raw edge fails rather than being cut. RMS gain is capped at 1.5 (formerly 4), with a 0.70 pre-encode peak ceiling. Post-encode 4x decoding measures true peaks, isolated impulses, active RMS, edge/seam energy and actual duration. Short phoneme-duration outliers fail for local investigation; no blanket word-tail trim is used.

Full generation produced 15 chapter tracks and 207 independent sentence MP3s. Sentence files contain exactly one whole unit and its recall gap. They use the persistent HTMLAudioElement's native loop, with no timeupdate seek/crop. All three presets have their own sentence files; changing preset preserves the selected stable ID. MP3 encoder delay is represented by real decoded duration, checked against sample-derived cues within 30 ms, with quiet edges and no neighbor speech.

Continuous: 650 ms sentence / 850 ms phrase gap, minimum 1000 ms between sentence repetitions. Slow: 1200 / 1400 ms, loop minimum 1500 ms. Recite: minimum 2400 ms between units, 2600 ms loop minimum, or 85% of spoken-unit duration (maximum 12 s). Model speeds remain 0.70 / 0.60 / 0.65. At UI 0.70 the native audio rate is 1; supported UI settings remain 0.55–1.00. Sentence punctuation is handled by the model; these gaps occur only AFTER complete units.

## Local retries and evidence limits

Prompt-free ASR flagged “Thus” and the neutral “seemingly indifferent to something” at some settings. Local style/speed A/B synthesis selected Thus style-length 16 at 0.9, and the latter's slow/recite style-length 32 at 0.8. Only 10 affected files regenerated; 212 files reused unchanged. A subsequent unchanged update reused all 222 files and generated zero. These overrides are scoped in settings/hash keys, not hidden manual edits.

Every MP3 has passed acoustic gates and local English ASR. Raw and explicitly normalized ASR errors are separate; short units may additionally use repeated-audio recognition without any text prompt, with original transcripts retained privately. Synthetic clipping, impulse, voiced seam and wrong timeline fault injections prove that the gate can reject failures. These checks do not prove human-rated naturalness or eliminate every possible subjective plosive/elongation. No physical phone is available for lock-screen, calls or OS suspension validation.

All reading plans, display/speech hashes, scoped engine/voice/processor settings, exact MP3 bytes, quality records and cues are cross-validated. Every deployed MP3 has an immutable hashed URL; the waiting PWA worker does not interrupt active sessions. A rollback restores a coherent runtime and matching content through a forward commit.

Actual G2P testing caught ay/ey as /aɪ/; eigh produces /eɪ/. This correction regenerated only 21 affected files while 201 were reused. Prompt-free ASR now recognizes trend A/trend B; a separate real-synthesis somebody/something probe also passes.

Residual automatic uncertainty: the recite sentence beginning “Modern society having entered an era…” (sentence-source-52b65c3aa95b9e9e-s-15dd40e24d54-recite.mp3) has a low-confidence ASR “Yes” at 12.53–12.85 s after “focus” (probability 0.16). The submitted phonemes contain no such added word. This is not confirmed as an audible extra word, and its naturalness is not declared fully resolved. The waveform is preserved rather than cutting the final consonant to satisfy a recognizer. All objective seam/peak checks pass; ASR remains an auxiliary check.

Formal Windows WebKit playback revealed native loop seek pause events, followed by the existing player recovery in roughly 14–18 ms in the captured trace. QA now measures bounded recovery (hard limit 250 ms at the native boundary only), twenty real repetitions, resumed clock advance and a subsequent explicit user pause. It does not fail solely on one sampled transient paused bit. WebKit also reports 4.872 s for a 4.800 s FFmpeg-decoded short file; independent full-file loops include the decoder padding rather than cutting at an estimated timestamp. Physical iPhone behavior is still unverified.

Formal landscape WebKit also reproduced a metadata-only restore stall when returning to a preset: currentTime was restored to 1.0504 s with readyState 2 and no buffered ranges, and no canplay/playing followed. New sentence-source loads now start from zero. The selected sentence ID/preset stays saved; pause/resume and explicit seeking within an existing loaded element retain position. Chapter mode restoration is unchanged. This prevents implicit mid-sentence restarts and avoids seeking into not-yet-buffered remote sentence data.

A separate Linux trace showed a complete buffered recite file (readyState 4, network idle, buffered 0–7.008 s) emitting playing while its clock stayed at 0.00285 s. The player now confirms clock movement during a short startup observation, performs at most one same-element reload only for a fully buffered frozen decoder, and cancels recovery on user pause or source change. Slow network data is not reloaded. Actual clock progress clears the 60 s load watchdog, preventing a valid native loop landing at zero near 60 s from being mistaken for an initial stall. Normal chapter restore is deferred/reapplied on playing to avoid losing the seek during decoder initialization.

The long-loop user-pause check exposed a queued WebKit loop restart after explicit pause. Pause now disables the native loop flag and briefly guards queued play/playing events; deliberate API play and native control gestures clear the guard and reapply the chosen loop mode. No audio data is trimmed, replaced or uploaded for this player-state fix.
