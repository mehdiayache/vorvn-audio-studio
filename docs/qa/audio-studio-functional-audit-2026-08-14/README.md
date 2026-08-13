# Composer, Production, and captions functional QA

Date: 2026-08-14

Branch: `codex/production-v2-scopes-2-7`

Living QA Production: `Test Production of Conversation` (`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`)

## Outcome

Composer and the recorded Production path are functional. Three deliberate real-provider recordings were created with different voices and exact routes, persisted, reopened, and played. Production Preview loaded the recorded mix and honestly reported that the three remaining Draft Parts were omitted.

The caption regression is closed. Production once again exposes Standard, Short, and Word-by-word layout choices through the existing subtitle-layout domain service. The bottom Player now presents a compact caption cue with an explicit language label. Historical audio with no immutable language value is no longer guessed or advertised as `Unknown language`; the operator can choose the known spoken language before regeneration. Part 1 was deliberately regenerated as English and now persists English caption truth.

## Persistent human stress tests

The following useful state was deliberately retained in the Living QA Production:

1. Part 9 — 12.8 seconds, `nenek Jenna`, Qwen Audio Flash, Expressive + tags, English. Realistic harbor witness narration. Playback verified after persistence.
2. Part 10 — 15.1 seconds, `Nenek Primrose`, Qwen3 TTS Voice Clone, Exact long reading, English. Realistic quarry-inlet technical narration. Playback verified after persistence.
3. Part 11 — 14.4 seconds, `Eva`, Qwen Omni Flash, Natural performance, English. Realistic weather-chart narration. Playback verified after persistence.

The three recording calls cost approximately USD 0.0078 in total. Caption regeneration for Part 1 was a single deliberate request. No loop or uncontrolled paid action was used.

## Numbered product flow

1. **Before — Player caption failure.** The Player used a large overlay headed `UNKNOWN LANGUAGE`, creating the incorrect impression that the product had no language truth. See `01-production-player-unknown-language.jpg`.
2. **Before — caption authoring regression.** The Part caption panel omitted the established segmentation choices. See `02-captions-missing-segmentation-controls.jpg`.
3. **Composer — real input ready.** The Production Composer was exercised with meaningful narration and a real exact voice route. See `03-composer-ready-part-9.jpg`.
4. **Restored authoring system.** The Part panel now contains the spoken-language control and all three established caption profiles. See `04-captions-restored-layout-and-language-controls.jpg`.
5. **Word-by-word proof.** The same saved transcript is projected into 40 one-word cues without another transcription call. Short mode was also tested and produced 12 cues; Standard produced 6. See `05-word-by-word-caption-layout.jpg`.
6. **Player control proof.** The Player CC control exposes `English · Original`; the Production card reports `EN captions`. See `06-player-english-captions-fixed.jpg`.
7. **Live cue proof.** While audio plays, the compact overlay shows an English label and the current cue without obscuring the working canvas. See `07-player-live-caption-overlay.jpg`.
8. **Production Preview proof.** Preview loaded the 2:04 recorded mix, played and paused correctly, and reported `3 Drafts omitted`. See `08-production-preview-control.jpg`.
9. **Final caption truth.** Part 1 now persists `English · Original`, exposes Standard/Short/Word-by-word, and offers Text/SRT/VTT/JSON download views. See `09-final-english-caption-workspace.jpg`.

## Root cause and correction

Part 1 was genuinely missing language in its historical immutable Take snapshot and transcript. The old UI converted that absence into a loud `Unknown language` product label. The correction preserves truth instead of inferring English from the text:

- selected transcript language is preferred;
- immutable selected-Take language is used as a safe fallback;
- genuinely absent historical truth is labelled `Original captions`;
- the operator can explicitly select the spoken language before Create/Regenerate;
- retry preserves the exact language stored in the durable caption Job context.

Caption layout reuses the existing shared `subtitleLayout` endpoint and one common `CaptionStylePicker`. It does not create a second subtitle system or issue a paid transcription when the operator changes layout.

## Verification

- OpenAPI generation, TypeScript, and Vite production build: passed.
- React: 73 files, 240 tests passed.
- Python: 302 tests passed with the local PostgreSQL runtime.
- Provider/domain contracts: 31/31 passed.
- Render and paid-destination contracts: 15/15 passed.
- Canonical domain integrity: 11/11 passed.
- Voice package and exact voice-routing contracts: passed.
- `git diff --check`: passed.
- shadcn component audit: imports, dependencies, TypeScript, build, tests, and real browser flow checked.

## Remaining product state

The yellow `3 Production issues` count is not a runtime failure. It corresponds to intentionally retained unrecorded Draft Parts 12–14. Preview correctly omits them; final export remains correctly guarded until they are recorded or removed.
