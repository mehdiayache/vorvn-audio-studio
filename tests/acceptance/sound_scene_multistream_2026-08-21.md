# Sound Scene multistream browser acceptance — 2026-08-21

Browsers:

- Google Chrome `151.0.7922.138`
- Safari `26.6`

Fixture and method:

- One real 60-minute, 48 kHz compressed MP3 was served with HTTP byte-range
  support as the Sequence Stem, Music A, and Music B.
- The fixture contains a short aligned 880 Hz transient every minute so onset
  and relative alignment can be observed without decoding the whole source.
- The production `SoundScenePlayout` performed: play from the beginning, seek
  to 50:00, pause, resume, seek back to 1:00, and leave Sound Design.
- The harness records real media-element clocks, the audible Sequence playhead,
  onset spread, cross-stream drift, timeline offset, and playout diagnostics.
- RSS was recorded from the same browser renderer/WebContent process before,
  during, and after the workflow.

## Results

| Browser | Baseline RSS | Peak/playing RSS | After leave | Onset spread | Maximum stream drift / timeline offset |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chrome | 134,032 KiB | 179,120 KiB | 162,736 KiB | 0 ms | 8 / 8 ms |
| Safari | 40,048 KiB | 37,904 KiB | 37,904 KiB | 0 ms | 66 / 66 ms |

Both browsers passed the complete start/seek/pause/resume/backward-seek/leave
path. At the end, diagnostics reported `active: false`, `decodedBytes: 0`,
`bufferedSources: 0`, and `streamedSources: 0`.

Result: **PASS**.

The three long sources remain streamed rather than becoming full AudioBuffers.
The Voice Stem is the audible master clock, playback opens only after all active
streams actually start, and a seek keeps the stream master closed until the
media elements have sought and realigned. The measured working sets remain
bounded and do not scale as three decoded 60-minute PCM buffers.
