# V1.4.1 daily listening refinements

This release changes the client and its tests. The selected source text, placeholders, Kokoro voice settings, 360 MP3 files, cues and source ledger remain unchanged.

Loop arrows use separated upper and lower tracks with open space for the chapter marker or sentence line. They share rounded strokes; no speech bubble overlaps a return arrow. The loop mode names, direct choice in More, keyboard access and at least 44px touch targets remain intact.

Pointer down gives the entire sentence a pale rounded surface and scales its inner text inward. A successful tap rebounds the inner text slightly forward, then settles on the normal current-line scale. A drag cancels the surface and never starts playback; keyboard activation uses the same feedback. Rapid taps cancel previous feedback. Font size and line wrapping do not change, and reduced motion removes the scale animation.

Pointer up retains the pressed scale until the click handler takes ownership. A held press rebounds directly; a quick tap still includes its initial inward motion. The measured trajectory starts with the real held frame, so a slow renderer cannot discard the first phase before sampling release. Windows native-media and online browser checks run one worker to separate actual pause behavior from competing native sessions; the app continues to respect system/user pauses.

Each chapter has a blue field and a plum/rose field. Separate cached gradients drift through transform animations; the palette never changes to two similar blues. Static, reduced motion and low-performance modes retain both colors. The top reading edge dims the background without painting an opaque blue sheet over the whole view.

Motion samples only visible row geometry before travel. Per-frame work writes scroll/transform values without rereading every row. A frame delayed by 180ms advances at most 32ms of spring time, preserving intermediate positions. Filters and the fixed dock's blur/shadow yield during travel. After repeated slow frames, the current travel temporarily drops extra row layers and background animation; normal decoration returns after settling. This is a rendering budget, not a claim of physical-device 60fps.

Native playback failure handling preserves the intended source and the single HTML audio element. AbortError is handled as a request interruption. A native network/source error during intended built-in playback may fetch the exact content-addressed file, verify the SHA-256 prefix encoded in its filename, and reload/play that same URL once. This warms the normal HTTP/service-worker cache; it does not replace playback with a blob or Web Audio. Verification has a 12s deadline. Modified bytes, unavailable files and a failed retry stop with a specific message. A user pause, chapter/preset change or stale request cancels recovery. Imported files never use this fetch/retry path. Full SHA-256 publication checks remain separate release gates.

MP3 seek rounding can land just before a cue. The clicked sentence remains the focus until the actual media clock reaches its cue; startup recovery preserves that pending ID. This prevents a flash back to the previous sentence and a second focus animation during buffering.

The native request distinction follows the [Chrome play interruption explanation](https://developer.chrome.com/blog/play-request-was-interrupted) and the [HTML media error definitions](https://html.spec.whatwg.org/dev/media.html). Automated faults use real HTTP responses, actual native decoding and advancing clocks alongside deliberate unit mocks. Transcription accuracy and voice naturalness are not re-claimed from UI tests. Real phone lock screens, interruptions and hardware rendering remain separate from desktop mobile emulation.
