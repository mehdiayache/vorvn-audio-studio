# Scope 4 completion report

## Scope

`Scope 4 — Captions + Floating Transport`

## Status

`COMPLETE ON codex/production-v2-scopes-2-7 — READY FOR THE SCOPE 4 CHECKPOINT.`

Scope 4 turns Part captions into ordinary Production Workbench editing and
upgrades the one global Player into a compact, Canvas-centered Production
console. It preserves the approved direction 2 visual baseline and the desktop
program boundary.

## Product result

- The Speech Part caption summary opens the exact Part Captions Workbench.
- Captions Workbench presents current/stale truth, source language, saved
  originals and translations, cue count, duration, Text/SRT/VTT/JSON, and a
  direct download for the selected file.
- Creating, regenerating, and translating captions continue through durable
  transcription/translation Jobs with existing cost confirmation, review,
  failure, and safe-retry behavior.
- Review-required/ambiguous Jobs never receive an automatic retry action.
- Successful regeneration makes exactly one source caption set current and
  removes the superseded original and its translations. Stale work remains
  visible until a successful replacement exists.
- New Part transcription requests carry the selected immutable Take's output
  language as provider context instead of discarding known language truth.
- The global Player remains the single playback owner. Production does not add
  another audio element or page-specific state machine.
- The Production transport is centered over the Canvas and respects occupied
  Workbench width. It owns play/pause, seek, elapsed/total, volume, speed, CC,
  download where durable, and close.
- Real Part and Production-preview caption tracks drive a CC language menu and
  a current cue bubble. Clicking the cue opens the exact Part Captions context.
- Full Production preview computes the currently audible Part and marks that
  Sequence row without confusing playing, selected, and Workbench-active state.
- Any refreshed Production mix truth makes an already loaded preview visibly
  stale. The transport offers an explicit Refresh that prepares the current
  mix; no old preview is silently presented as current.

## Architecture and truth

`usePlayer` remains the one owner of media playback. It now also owns only the
playback projection of caption tracks, active CC language, and current cue;
canonical transcripts remain backend records and are never mutated by Player
choices.

`production-caption-tracks.ts` is the one projection from saved Part transcripts
to Player cue timelines. Part playback retains exact Part context. Production
preview combines cues by language using real Sequence offsets and immutable
Part durations. Caption-track loading is cached per current Production snapshot
and fails open to audio playback if captions cannot be loaded.

`usePartDetailData` continues to own Part caption selection and durable Job
coordination. It now opens the best current original by default and never lets a
late response from another Part overwrite the active Workbench. The shared
`durableOperationTruth` helper remains the only Job-to-human-state mapping.

## Information hierarchy and color grammar

The Captions Workbench leads with editorial state, then language files, then
the selected file's deliverable formats. Durable provider operation evidence is
visible while relevant but does not replace editorial context. The empty state
is intentionally quiet instead of filling the Workbench with placeholder cards.

Neutral surfaces carry normal caption work. Blue marks the selected file,
active CC, current cue context, and playing location. Amber marks stale captions
and an obsolete Preview. Red remains failure/destructive only. Green remains a
quiet ready/completed signal. No raw color value or component-local palette was
introduced.

shadcn Dropdown Menu and Tabs composition was inspected before implementation.
The local RadioGroup menu, Tabs, Select, Dialog, Button, Slider, Badge, and
Progress primitives were reused. The final shadcn audit confirmed imports,
installed dependencies, TypeScript/build health, and real-browser interaction.

## Replaced paths made unreachable

- Production no longer presents the generic full-width Player geometry; the
  Production host is the compact Canvas-centered console.
- The old captions panel that exposed only Text/SRT/VTT now routes through the
  editorial file hierarchy and also exposes canonical JSON cue data.
- Caption file selection no longer requires a manual first click after opening
  a Part with saved captions; the current original is opened automatically.
- A regenerated Part can no longer leave multiple competing current originals
  in the Part caption list.

The standalone Subtitles product remains available for external audio and was
not merged into Production.

## Real human product QA

Desktop exploratory QA used the persistent `test production of conversation`
Production (`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`) at the primary 1440 px
working width.

The pass opened Part 1 Captions from its real `CC —` summary and deliberately
issued one paid transcription request. The Job progressed from Running to
Completed, persisted five real cues for the 17-second expressive recording,
updated the Part to `CC Ready`, and populated Text/SRT/VTT/JSON plus Download.
The representative caption set was retained in the Living QA Production.

The same saved captions were then used in the real global transport for both
Part playback and a locally rendered 1:07 Production preview. QA enabled CC,
observed changing real cues, selected the caption language, verified exactly one
playing-Part marker, and clicked a cue back into `Part 01 · Speech → Captions`.

QA then changed the retained Silence from 1.4 to 1.5 seconds while the preview
was loaded. The player displayed `Preview out of date` and an explicit Refresh.
Silence was restored to 1.4 seconds, Refresh prepared the current preview, and
the stale state cleared. No QA Production was deleted.

Human visual review caught a transport-grid wrap once CC and Download coexisted.
The final console uses one compact row with a separate cue bubble. It also caught
that Part transcription had not submitted known selected-Take language; that
contract is now explicit and tested. A second regeneration pass was not issued
after the in-app browser's safety reviewer blocked further local interaction;
the successful real caption artifact was preserved and all contract behavior
was verified below the UI.

No mobile design or QA was performed.

## Verification

- React: 65 files, 218 tests passed.
- Python: 323 tests passed.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed.
- Voice package and exact-routing contracts passed.
- Domain integrity: 11/11 passed.
- OpenAPI export/generation, TypeScript, and Vite production build passed.
- Focused Player/transport/caption/API/Production suites: 26 tests passed before
  final convergence; full React acceptance includes every final change.
- `git diff --check` passed.
- shadcn component audit completed.

## Checkpoint boundary

`SCOPE 4 COMPLETE. NEXT IMPLEMENTATION TARGET: SCOPE 5 — CAST + MUSIC + ASSET SPATIAL INTEGRATION.`
