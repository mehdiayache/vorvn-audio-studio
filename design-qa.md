# Design QA — Direct caption controls

## Evidence

- Source visual truth: `/var/folders/cb/4m2zrd4916q19q1n5mrpc_jh0000gn/T/TemporaryItems/NSIRD_screencaptureui_fh6aJR/Screenshot 2026-08-14 at 10.18.40.png`
- Desktop implementation: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/caption-controls-final.png`
- Language-menu implementation: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/caption-controls-language-menu.png`
- Mobile implementation: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/out/caption-controls-mobile.png`
- Desktop viewport: 1280 × 720 CSS pixels, device scale factor 1.
- Mobile viewport: 390 × 844 CSS pixels, device scale factor 1.
- State: Living QA Production `test production of conversation`, real English timed captions, Production preview paused on a spoken cue.
- The founder reference and the final desktop capture were reviewed together in one visual comparison input.

## Comparison history

### Pass 1 — interaction ownership

- [P1] The CC button opened an intermediary dropdown instead of performing the operator's primary action.
  - Fix: CC is now a direct, pressed-state show/hide control. Showing captions immediately uses the saved/default presentation and current track; hiding captions removes the caption row without closing the player.
- [P1] Language selection and Standard / Short / Word by word were hidden behind the same CC menu.
  - Fix: those settings now live persistently on the right side of the integrated caption row. The language uses the local shadcn Select and the three presentation modes use the local shadcn ToggleGroup.
- [P1] The old menu could render beneath the fixed player because the player used a sheet-level z-index above shadcn popups.
  - Fix: the player now uses the semantic dock layer (`40`); the shadcn Select popup stays at `50`, while dialogs and sheets remain higher.

### Pass 2 — geometry and behavior

- [P2] The language menu touched or overlapped the player edge.
  - Fix: the menu opens above with a 10 px side offset. Measured menu bottom: `586.5625`; player top: `588.40625`.
- [P2] Caption controls could outgrow the mobile player border.
  - Fix: the mobile caption panel is a 112 px stacked row inside the outer card. Measured panel width: `357`; player inner width: `357`; document horizontal overflow: `0`.
- [P2] A mobile player without the caption row could wrap CC and Close because the grid lost a control column.
  - Fix: a source with caption tracks reserves five transport columns whether captions are currently shown or hidden.

No actionable P0, P1, or P2 finding remains for this caption-player scope.

## Required fidelity surfaces

- Typography: existing Audio Studio Inter typography and semantic VORVN body/metadata weights remain intact. The actual cue is the primary content; controls are compact and secondary.
- Layout: the enabled player remains one card with a fixed 56 px caption row above the 60 px transport row. Language and the three display modes stay visible in the caption row. The disabled player collapses to the transport row only.
- Color grammar: information blue is reserved for the active caption capability and CC pressed state. Neutral surfaces carry the player, dropdown, and segmented controls. No decorative color competes with playback or transcript content.
- Components: no parallel primitive was created. Select, ToggleGroup, Button, and Lucide caption icons reuse the repository's local shadcn components.
- Content: the selected language remains visible even when only one track exists. Spoken cues are directly actionable; timing gaps retain `No spoken caption at this position` without making the whole caption surface disappear.

## Real product QA

- Opened the served Living QA Production and loaded its real recorded Preview.
- Clicked CC once and confirmed captions appeared directly with Standard selected; clicked it again and confirmed the caption row hid directly with no intermediary menu.
- Exercised Standard, Short, and Word by word, then returned to Standard and confirmed the durable active state.
- Opened the English selector and confirmed its popup was fully visible above the player, with z-index `50` over player z-index `40`.
- Clicked the real cue text and confirmed `Captions · Part 01` opened in place, on the same Production URL, with saved transcript and all three caption styles.
- Verified desktop player geometry: `832 × 115.59375`; caption row height: `56`; horizontal overflow: `0`.
- Verified mobile at 390 × 844: all four controls remain visible, player height `188`, caption panel height `112`, horizontal overflow `0`.
- No provider call or paid transcription was issued.

## Verification

- OpenAPI generation, TypeScript, production Vite build, and all 243 React tests across 71 files passed.
- All 304 Python tests passed.
- Provider contracts passed 31/31 and render contracts passed 15/15 as part of the Python suite.
- Domain invariants passed 11/11 against the local PostgreSQL database.

final result: passed
