# Sound Scene multistream browser acceptance

This focused harness runs the production `SoundScenePlayout` with a 60-minute
Sequence Stem and two 60-minute Music streams. A Service Worker serves a small
synthetic aligned transient as a range-backed WAV, so the test exercises long
browser media without committing a large fixture or decoding an hour of PCM.

Build after changing the harness or playout engine:

```sh
pnpm exec vite build --config tests/acceptance/sound_scene_multistream_harness/vite.config.ts
```

The committed `dist/` can be opened from a public static origin in Chrome and
Safari. Use the visible controls in order: play, seek forward, pause, resume,
seek backward, then leave. The result block records stream onset, drift,
readiness, and whether streamed resources were released.

For exact hybrid drift certification, generate a compressed 60-minute source
with a zero source timestamp after building and open the harness with
`?fixture=flac`:

```sh
ffmpeg -f lavfi -i 'aevalsrc=if(lt(mod(t\,60)\,0.5)\,0.5*sin(2*PI*880*t)\,0):s=8000:d=3600' \
  -c:a flac -compression_level 12 -y \
  tests/acceptance/sound_scene_multistream_harness/dist/qa-60.flac
```

Open `?fixture=flac&mode=hybrid` to certify the shared audible clock with one
60-minute Sequence stream, one 60-minute Music stream, and decoded 120 ms cues
at 1, 20, and 50 minutes. The harness analyzes the real common-master output at
880 Hz (stream transient) and 1760 Hz (buffered cue), then reports their onset
drift.

Prefer the zero-timestamp FLAC for exact measurements. If a browser requires a
different long-stream codec for reliable post-seek output, generate that source
in one pass, record the codec in the acceptance report, and keep measuring the
real common-master signal. Do not use concatenated MP3 segments: their encoder
delay can be mistaken for Sound Scene clock drift.
