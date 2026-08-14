# Design QA — Integrated caption player

## Evidence

- Source visual truth: `/var/folders/cb/4m2zrd4916q19q1n5mrpc_jh0000gn/T/TemporaryItems/NSIRD_screencaptureui_fh6aJR/Screenshot 2026-08-14 at 10.18.40.png`
- Browser implementation capture, captions enabled at a silent timing gap: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/caption-player-integrated-final.png`
- Browser implementation capture, captions disabled: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/caption-player-no-captions-final.png`
- Normalized focused comparison: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/caption-player-design-qa-comparison.png`
- Source pixels: 723 × 526.
- Captions-enabled implementation pixels: 1608 × 955 at a 1608 × 964 CSS viewport and device scale factor 1.
- Captions-disabled implementation pixels: 1265 × 712. The focused player crop was normalized to the same 840 px comparison width as the captions-enabled state.
- State: Living QA Production, Part 01 selected, English Short captions, real saved transcript, paused spoken-cue and silent-gap positions.

## Comparison history

### Pass 1

- [P1] The caption surface was a conditional floating element outside the player.
  - Evidence: it was rendered only when `currentCaptionCue` existed and was positioned above the transport. During timing gaps the complete caption block disappeared and the player changed visual structure.
  - Fix: captions now render as the first grid row inside the one player card whenever a caption track is enabled. The controls remain the second row. Turning captions off removes only the caption row and returns the player to its one-row state.
- [P1] The caption/player geometry did not match the two-state source drawing.
  - Fix: the integrated caption row owns the player's top corners and bottom divider; the control row stays inside the same outer border, radius, and elevation.

### Pass 2

- [P2] A flexible caption-row height could still move the controls when Standard captions changed between one and two lines.
  - Fix: the caption row now reserves a fixed 56 px two-line region and clamps caption content to two lines. The complete captions-enabled player measured 115.59375 px in both a spoken cue and a silent gap.

The normalized comparison shows the exact source composition: a two-row player when captions are enabled and a single-row player when captions are disabled. No actionable P0, P1, or P2 findings remain.

## Required fidelity surfaces

- Fonts and typography: existing Audio Studio Inter typography, semantic VORVN caption/body sizes, and label/title weights are preserved. Caption text remains readable and is capped at the backend's two-line Standard contract.
- Spacing and layout rhythm: captions-enabled geometry is stable at a 56 px caption row and 115.59375 px total player height. Captions-disabled geometry is a 60 px single row. The row is in normal player grid flow, so it cannot float, overlap, or disappear between cues.
- Colors and visual tokens: the implementation uses existing surface, border, information, foreground, muted, radius, and shadow tokens. Information blue identifies the active caption language/mode without turning the full player into a status color.
- Image quality and asset fidelity: the source contains no required image assets. Existing Lucide media icons and real Audio Studio waveform/source treatment are preserved; no fake visual asset was introduced.
- Copy and content: live caption text remains primary. Silent timing gaps explicitly say `No spoken caption at this position` while preserving the caption row. Language and presentation mode remain visible.

## Real product QA

- Opened the served Living QA Production and played the existing captioned Part 01.
- Enabled English captions and verified the integrated caption row with a real spoken cue.
- Paused at a silent timing gap and verified that the row remained present with identical geometry.
- Reloaded and verified the captions-disabled one-row player state.
- Confirmed the CC language and display menu remains functional.
- Browser console after the final render: no errors.
- No provider call or paid transcription was issued.

## Focused comparison

The focused comparison places the founder's two-state player drawing beside the cropped real implementation. It is the correct comparison level because the requested change concerns player ownership and state geometry, not the surrounding Production table.

## Verification

- Frontend OpenAPI generation, TypeScript, production build, and all 242 React tests across 71 files passed.
- All 304 Python tests passed.
- Provider contracts passed 31/31 and render contracts passed 15/15.
- Domain invariants passed 11/11 against the local test database.

final result: passed
