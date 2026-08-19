# Sound Scene external RSS acceptance — 2026-08-19

Commit under test: `62cd069` (`main`)

Browsers:

- Google Chrome `151.0.7922.138`
- Safari `26.6`

Method:

- Generated three distinct physical MP3 sources at 48 kHz: 10 minutes (2.3 MB), 30 minutes (6.9 MB), and 60 minutes (14 MB).
- Used the real `SoundScenePlayout` hybrid source selection in Chrome, with one streamed Sequence Stem, then sought to 20 seconds before the end of each scene.
- Recorded the same Chrome renderer PID (`85646`) with macOS `ps` after each far seek.
- Isolated Safari's native media-decoder duration behavior with the same three files and the same far seek, recording the same WebContent PID (`86339`). Sound Scene's internal diagnostics and browser tests separately assert `decodedBytes: 0`, one streamed Sequence source, and zero streamed sources after deactivation for 10/30/60-minute scenes.
- Left Sound Design and allowed a five-second release window. Temporary source files and the local QA harness were removed after measurement.

## Observations

| Browser/process | 10 min | 30 min | 60 min | After leaving Sound Design |
| --- | ---: | ---: | ---: | ---: |
| Chrome renderer RSS | 145,536 KiB | 177,904 KiB | 162,176 KiB | 153,856 KiB |
| Safari WebContent RSS | 39,936 KiB | 39,856 KiB | 38,960 KiB | 37,920 KiB |

Result: **PASS**.

Neither browser shows the old strong duration-proportional growth from fully decoded PCM. Chrome's 60-minute observation is lower than its 30-minute observation and only about 16 MiB above its 10-minute observation. Safari is effectively flat across the three distinct source durations. Resource diagnostics return to zero streamed sources after Sound Design deactivation; browser processes may retain allocator capacity, but no duration-scaled decoder allocation remains active.
