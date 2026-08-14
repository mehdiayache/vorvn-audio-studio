# Design QA — Standalone Speak and Sandbox checkpoint

## Evidence

- Source visual truth: `/var/folders/cb/4m2zrd4916q19q1n5mrpc_jh0000gn/T/TemporaryItems/NSIRD_screencaptureui_gzQf9A/Screenshot 2026-08-14 at 07.53.07.png`
- Browser implementation capture: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/speak-sandbox-final.jpg`
- Normalized side-by-side comparison: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/design-qa-comparison.jpg`
- Source pixels: 2414 × 1052.
- Implementation pixels: 1280 × 720 at a 1280 × 720 CSS viewport and device scale factor 2. Browser capture is normalized by the in-app browser to 1280 × 720 pixels.
- Comparison normalization: the implementation Composer was cropped to its 1230 × 528 content frame; source and implementation were padded/scaled to 1230 × 536 before horizontal comparison.
- State: clean standalone Composer, no Voice/route selected, existing reusable recording history below the workstation.

## Comparison history

### Pass 1

- [P1] Voice setup consumed the visible primary column and pushed the script below the internal scroll boundary.
  - Fix: the setup became a compact, explicit summary row. Operators can write immediately and open setup only when choosing or changing the Voice and exact route.
- [P2] The page-level Speak title duplicated the Composer title and pushed the persistent Generate footer below the initial 1280 × 720 viewport.
  - Fix: the redundant page header was removed and the Composer header now owns the visible `Speak · Create a reusable recording` identity.
- [P2] Collapsing setup after route selection retained the primary column's previous scroll offset.
  - Fix: completion collapses setup and resets the primary workspace scroll position.

### Pass 2

The normalized side-by-side comparison shows the intended shared composition: context/setup across the top, script as the dominant left work area, performance/output in a subordinate right rail, and one persistent generation footer. The rejected session, destination, and Cast controls from the source are intentionally absent.

No actionable P0, P1, or P2 findings remain.

## Required fidelity surfaces

- Fonts and typography: existing Audio Studio Inter typography and VORVN weights are preserved. The script/editor hierarchy is stronger than utility labels, metadata remains legible, and labels do not truncate at 1280 px.
- Spacing and layout rhythm: the 1230 px workstation fits the 1280 px viewport with 25 px side margins and no horizontal overflow. The 1.7 / .78 column proportion keeps writing primary while preserving usable controls.
- Colors and visual tokens: only semantic VORVN surface, border, text, warning, data-series, and action tokens are used. The incomplete Voice state uses warning color; the interface does not become an undifferentiated black surface.
- Image quality and asset fidelity: the source contains no required product imagery. Audio Studio's real `VoiceIdentity` portrait remains in the shared Voice picker and recording cards after selection; no placeholder or handcrafted asset was introduced.
- Copy and content: `Session`, `New session`, and session destination wording are removed. The visible language now says Speak, reusable recording, Sandbox, and recordings. Real history cards retain voice, exact model, language, script, cost, duration, and durable operation state.

## Real product QA

- Opened the served application in the in-app browser.
- Verified the no-session `/audio-studio/speak` route against the live API.
- Opened the real 74-Voice selector, selected owned Voice Eva, and selected the exact `Qwen Audio 3.0 TTS · Flash` route.
- Verified setup auto-collapses after the exact route becomes valid and the script returns to the top of the primary work area.
- Verified existing reusable recordings load with playable actions and real metadata.
- Verified the singleton Composer draft saves through the live API.
- Verified zero horizontal document overflow at 1280 × 720.
- Browser console log after the final render: no errors.

## Focused comparison

The full normalized comparison keeps the controls and editor text readable, so a separate close crop was not necessary. The important focused state—Voice selector with real portraits and exact route selection—was exercised interactively in the browser rather than represented by fake fixture content.

## Verification

- Frontend: 73 files, 239 tests passed; API generation, typecheck, and production build passed.
- Python: 302 tests passed.
- Provider/domain contracts: 31/31 passed.
- Render contracts: 15/15 passed.
- Focused post-polish Composer tests: 10/10 passed; production build passed.

final result: passed
