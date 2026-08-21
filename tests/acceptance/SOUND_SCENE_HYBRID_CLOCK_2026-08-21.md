# Sound Scene hybrid clock acceptance — 2026-08-21

## Scope

This closes the Sound Scene clock-contract audit without changing the Product
layout, persistence model, PlaylistEngine, or long-stream architecture.

The accepted playback order is now:

1. close the one audible master shared by streamed and buffered audio;
2. prepare active MediaElements and wait for actual playback;
3. pause, align, and prime those streams at the requested timeline position;
4. align the buffered transport;
5. schedule Sequence mix automation from that audible timeline position;
6. establish the AudioContext-backed transport clock;
7. start buffered playback and open the common master.

The same ordering is used after a playing seek. A delayed-start regression test
proves that Sequence fade/mute automation and the buffered adapter do not
advance while stream preparation is unresolved, and that the common master
stays closed until both paths are aligned.

Echo Delay, Feedback, and Mix now update the browser effect chain during a
slider drag and persist exactly once on commit for both Music clips and
Sequence Parts.

## Real-browser method

The focused harness runs the production `SoundScenePlayout` with:

- one 60-minute Sequence MediaElement stream;
- one 60-minute Music MediaElement stream;
- 120 ms precision AudioBuffer cues at 01:00, 20:00, and 50:00.

An acceptance-only signal probe observes the actual common-master output. It
measures the onset difference between the 880 Hz stream transient and the
1760 Hz buffered cue. The probe copies samples unchanged and is not part of the
product engine. This avoids treating `HTMLMediaElement.currentTime` telemetry
as audible truth.

The operator exercise was: start near 01:00, seek to 20:00, seek to 50:00,
pause/resume, seek backward to 01:00, then leave Sound Design.

## Measurements

| Browser | Long-stream fixture | 01:00 | 20:00 | 50:00 | Back to 01:00 |
| --- | --- | ---: | ---: | ---: | ---: |
| Chrome 151 | zero-timestamp FLAC | 5 ms | 11 ms | 11 ms | 5 ms |
| Safari 26.6 | one-pass MP3 | 3 ms | 3 ms | 3 ms | 3 ms |

Chrome also reported 0 ms onset spread, a maximum 1 ms stream-to-stream
telemetry difference, and a maximum 11 ms timeline telemetry offset.

The Safari MP3 was generated as one continuous file. A previously explored
concatenated MP3 carried about 138 ms of encoder delay and was rejected as a
clock fixture. WebKit did not reliably expose the post-seek FLAC transient in
this harness, so Safari's formal run used the one-pass MP3 and measured the
actual audible common-master output rather than media-time properties.
Safari's `currentTime` properties lagged the AudioContext-backed audible clock
by as much as 1.47 seconds after seeks even while the measured output drift
remained 3 ms. This is why MediaElement property telemetry is diagnostic only
and does not drive the live transport clock.

Pause/resume and backward seek passed in both browsers. After leaving Sound
Design, both reported:

- `active: false`;
- `decodedBytes: 0`;
- `bufferedSources: 0`;
- `streamedSources: 0`;
- `sequenceMode: none`.

No long stream was reverted to an AudioBuffer.

## Automated verification

- TypeScript and production Vite build: passed.
- Frontend: 76 files, 315 tests passed.
- Python: 368 tests passed.
- Domain integrity: 11/11 checks passed.
- FFmpeg Echo: real impulse-level tests cover Mix 0/.25/1 and Feedback 0/>0,
  alongside the browser dry/wet contract.
- Sound Scene delayed startup/seek: common gate, Sequence automation, and
  buffered transport ordering covered by regression tests.
- Echo sliders: local preview plus one canonical commit covered for Music and
  Sequence presentations.

The first full frontend run was performed while two duplicate long-form Vite
acceptance servers were still active and produced non-deterministic 5-second UI
test timeouts. Every affected test passed in isolation. After those completed
QA servers were stopped, the unchanged full frontend suite passed 315/315.
