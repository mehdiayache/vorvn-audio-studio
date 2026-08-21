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
