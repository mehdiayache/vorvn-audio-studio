# Production UI rebuild log

Updated: 2026-08-06

## Product position

The supplied HTML prototype is a functional wireframe and coverage map. It is not a visual style to copy and it does not override the actual product model. The rebuild must make the existing application easier to understand while preserving its working voice, project, preview, music, caption, export, and hierarchy behavior.

The Production page is a compact narration-production workspace, not a generic folder browser and not a full DAW. A Venture is a brand. A Project groups related productions. A Production owns an ordered narration sequence, one parallel music bed, previews, and immutable exports. Venture Assets are reusable source libraries.

## Non-negotiable constraints

- Preserve the existing Python APIs, database records, generated media, and URL-addressable project state.
- Use React, TypeScript, Vite, Tailwind CSS, and shadcn/ui for the new frontend.
- Keep shadcn primitives local and compose VORVN-specific components above them.
- Build the new frontend beside the legacy UI until parity is verified; do not cut over incrementally to a half-working screen.
- No invented backend state. Unsupported wireframe concepts remain visibly absent or honestly disabled.
- Music is parallel to narration. It is never a sequential clip.
- Preview means the exact current sequence, with the current music mix when music is enabled.
- Arabic and other RTL scripts must affect content direction without mirroring the entire application chrome.
- Desktop, compact desktop, tablet, and phone states are deliberate states, not accidental wrapping.

## State model

### Route state

- top-level tool: Speak, Projects, Batch, Voices, Activity, Subtitles, Settings
- selected production ID from `?tab=projects&project={id}`
- Explorer expanded/collapsed and mobile drawer state
- Production workspace mode: Write, Perform, Review, Release

### Server state

- hierarchy, Venture, Project, Production identity
- ordered typed parts: recorded speech, draft speech, silence, linked Venture asset
- voices, takes, subtitles, translations, music settings, exports, generation cost
- pending mutations, API errors, missing linked media, preview/render progress

### Local interaction state

- selected rows and Shift range anchor
- focused/expanded row and insertion seam
- open tool panel: speech, asset library, silence, or none
- composer draft and dirty state
- timeline zoom and scroll position
- player status, active source, queue position, seek, volume, and playback rate
- confirmation dialogs and recoverable errors

### Derived state

- source duration, effective duration, part count, draft count, and historical spend
- preview freshness fingerprint derived from sequence + music settings
- whether preview/export is blocked by drafts, missing media, or invalid durations
- effective layout density and which actions move into overflow at each breakpoint

## Functional parity matrix

| Capability | Existing backend/UI | New surface | Cutover requirement |
| --- | --- | --- | --- |
| Open production by URL | working | typed route adapter | Back/Forward and direct open pass |
| Hierarchy context | working | global shell + optional Explorer | venture/project/production semantics remain distinct |
| Add speech | working shared Composer | Speech tool/part sheet | generate and save draft preserve destination/insertion |
| Recorded part actions | working | typed sequence card | play, take, duplicate, reorder, move, delete |
| Draft actions | working | typed draft card | edit, record, duplicate, reorder, delete |
| Silence | working | inline card + insertion tool | 0.1–120 s edit without modal |
| Venture asset insertion | working | asset library tool | Intro/Outro/Stinger only; linked-source errors visible |
| Reorder | working | pointer + keyboard affordances | server order and focus remain stable |
| Multi-selection | working | contextual selection bar | range, all, move, delete, clear |
| Music | working | dedicated parallel mix surface | audition, volume, start position, replace/remove |
| Exact mixed preview | working | one global player | narration and music play as one preview |
| Timeline | partial | derived overview/timing tray | proportional durations, locate part, music lane |
| Takes | working | part detail sheet | list and promote take |
| Captions/translations | working | Review/detail surfaces | existing transcription and translation behavior |
| Export | MP3 working | Release workspace | only actually supported formats/actions shown |
| Keyboard shortcuts | working partially | central shortcut map | no shortcut fires in text inputs unexpectedly |
| RTL content | working partially | content-level `dir=auto` | Arabic editing and reading order verified |
| Loading/empty/error states | inconsistent | explicit state components | every data boundary has all three states |

## Wireframe ideas that are not backend facts

These concepts must not be presented as persisted or functional until backend support exists: approvals, structured pronunciation issues, production assistant, outline generation, timestamped collaboration notes, mastering presets, WAV export, a persisted preview-freshness record, mixed-preview word following, production-specific background queue, fictional speech engines, and arbitrary uploads directly into the narration sequence.

The UI may reserve a clean extension point for a future capability. It may not fabricate data, success, or controls that do nothing.

## Component boundaries

### Application primitives

Local shadcn components: Button, Badge, Tabs, Toggle Group, Tooltip, Popover, Dropdown Menu, Sheet, Dialog/Alert Dialog, Command, Scroll Area, Separator, Input, Textarea, Select, Slider, Checkbox, Collapsible, Progress, Skeleton, and Sonner.

### VORVN components

- `AppShell`: global tools, responsive navigation, system status
- `ProjectExplorer`: semantic hierarchy navigation
- `ProductionHeader`: breadcrumbs, identity, metrics, Add, and Mix/Export destination
- `SequenceWorkspace`: ordered parts, seams, selection, keyboard movement
- `ProductionPartCard`: shared frame with speech/draft/silence/asset variants
- `SpeechTool`, `AssetTool`, `SilenceTool`: focused creation panels
- `MusicBed`: parallel track controls and source audition
- `TimingOverview`: always-visible full-production transport, clock, and music controls
- `ProductionPlayer`: the only production transport component
- `PartDetailSheet`: takes, captions, translations, metadata, destructive actions
- `ReleaseWorkspace`: readiness, exact supported exports, export history
- `AsyncBoundary`, `EmptyState`, `ErrorState`: consistent system feedback

## Migration sequence

1. Scaffold a parallel React/Vite/shadcn frontend and dev proxy to the current Python server.
2. Define typed API contracts and adapters without altering endpoints.
3. Rebuild shell, route state, Production header, sequence, tools, music, player, and Release in slices.
4. Verify each slice against live, non-billable reads and local mutations where safe; audio generation is excluded.
5. Run component, integration, responsive, keyboard, RTL, and legacy backend tests.
6. Add a server route for the built frontend and retain a deliberate legacy escape hatch.
7. Cut over only when the parity matrix is green.

## Decision log

- **2026-08-06 — Parallel migration.** A direct rewrite of the served vanilla UI would create an untestable mixed architecture. The React frontend is isolated until it can replace a complete surface.
- **2026-08-06 — Wireframe, not skin.** The handoff determines information coverage and layout relationships. Its gradients, invented features, and unsupported controls are not copied.
- **2026-08-06 — One transport.** All production playback routes through one player state machine so row audition, source audition, sequence preview, and mixed preview cannot fight each other.
- **2026-08-06 — Honest capability UI.** The interface derives enabled actions from API data and explicit capability flags. Missing backend concepts are not simulated.
- **2026-08-06 — Density by disclosure.** Frequent actions stay visible; destructive and cross-context actions use menus/sheets. The UI does not hide basic edit/play/reorder behavior behind an unexplained kebab.
- **2026-08-06 — Safe server cutover path.** The complete React build is served at `/studio/`; legacy tools remain at `/`. This makes the new Production surface usable through HTTP while preserving a deliberate escape hatch during parity work.
- **2026-08-06 — Wireframe correction from live data.** Venture Assets are rendered as a library, not a Production. Silence contributes to both header duration and Timing using the same duration function.
- **2026-08-06 — Composer uses the real provider contract.** The React Composer sends the existing `/api/speak` payload, preserves the API cost guard, routes Arabic to Omni/Tina, and loads owned cloned voices. It does not invent a second synthesis pipeline.
- **2026-08-06 — Assets remain Venture-owned.** Music/Intro/Outro/Stinger uploads target their actual fixed Venture collections and accept picker or drag-and-drop. Uploading is explicitly free and never becomes an implicit narration part.
- **2026-08-06 — Detail is one component.** Summary, archived takes, promotion, captions, translations, Text/SRT/VTT preview, and downloads live in one Part detail Sheet rather than separate stitched modals.
- **2026-08-07 — Color is semantic, not decorative.** The React surface uses a cool neutral foundation, graphite inverse surfaces, and one indigo action accent. Green, amber, red, and teal are reserved for connection/success, draft/warning, failure, and asset meaning. Warm brown/beige values and component-local palette decisions were removed; future brand changes now happen through root tokens.
- **2026-08-07 — Handoff v4 controls spatial architecture.** The Production page no longer uses a permanent Explorer column or a horizontal dashboard tool card. Its stable order is Production context header, compact identity, connected sequence, progressive Timing tray, and one floating Player. Music is edited inside the parallel Timing context; Composer and libraries remain captured-destination overlays.
- **2026-08-07 — Add is contextual and anchored.** Header Add defaults to the end and presents speech, silence, and Venture-audio choices. Every sequence seam presents the same supported choices beside the clicked position before opening an asynchronous Sheet.
- **2026-08-07 — Prototype ideas require a contract mapping.** The handoff HTML governs interaction grammar and spatial relationships; the technical brief governs domain truth; the live API governs which states may be presented as real. The mapping is maintained in `docs/HANDOFF_V4_AUDIT.md`.
- **2026-08-07 — Context dock is not an Add toolbar.** Its seven tools now match the handoff: Explorer, structure, voices, assets, search, issues, and commands. All content is derived from real Production state; Add remains in the header and seams.
- **2026-08-07 — Player discloses resource semantics.** The single player distinguishes full Production, music audition, linked asset, and individual take; it remains visible before the first preview, returns to the full Production explicitly, and exposes download only for real source files.
- **2026-08-07 — Perform and Review are not fake stages.** Performance direction belongs to a voice part and review state belongs to the affected source. The global Write/Perform/Review tabs were removed because they rendered the same sequence with explanatory banners instead of distinct jobs.
- **2026-08-07 — Music is primary Production context.** Full playback, the shared clock, the current bed, source audition, level, source position, ducking, replace and remove now appear before the sequence. Music is no longer hidden below a long sequence in a collapsed Timing tray.
- **2026-08-07 — Human voice identity is shared.** `VoiceIdentity` resolves saved metadata, catalogue names, clone names, images and provider fallbacks. Alibaba identifiers remain storage values and are not used as card, picker, context-panel or take labels.
- **2026-08-07 — Card geometry never changes on hover.** Selection, content and the 82 px action rail occupy explicit columns. Opening the action menu preserves the measured 600 px content column and 146 px card height; card content opens details and selection is a separate checkbox.
- **2026-08-08 — Composer execution is native.** The historical `/api/speak` mapping above described the migration bridge at that time. Standalone Speak, Add Part, New Take and Record Draft now use typed `/api/v1/jobs/speech`, one application service and one provider adapter; the old route and loopback process are removed from active runtime.

## Verification log

This section is updated as implementation advances. A checkbox means the behavior was executed, not merely inspected.

- [x] React production build succeeds — Vite 8 production bundle emitted under `ui-next/`
- [x] TypeScript has no errors — `tsc -b` clean
- [x] Component tests pass — 12/12 frontend contract tests across player, voice identity, duration, money and RTL contracts
- [x] Existing Python/backend tests pass — 80/80 audit checks and 15/15 render/destination checks
- [x] Live production loads from the existing API — Production 6, hierarchy, music, assets and exports inspected
- [x] Direct URL and Back/Forward work — navigated Production 6 → 4 → Back to 6
- [ ] Empty, loading, error, stale, and missing-media states verified — empty Production and 404/retry executed; stale and missing-media variants are implemented but still need a live fixture
- [ ] Sequence add/edit/reorder/duplicate/delete parity verified without generation
- [x] Music controls and mixed preview surface verified without generating audio — the live Production shows its bed, level, source position, ducking, audition, replace/remove and full-preview entry points
- [x] Desktop, tablet, phone, keyboard, and RTL passes complete — default desktop, 768 px tablet and 390 px phone have no horizontal overflow; Escape closes sheets; Arabic computes RTL and selects Omni/Tina/Arabic
- [x] Semantic color pass complete — desktop and 390 px phone inspected from the built `/studio/` route; computed colors resolve through tokens, no warm brown component colors remain, and the browser console is clean
- [x] Handoff v4 spatial architecture verified — no permanent Explorer column; sticky Production context; always-visible Production/music surface; 820 px connected sequence inside a 1120 px workspace; dock and Player are fixed overlays
- [x] Header and seam insertion verified — both menus expose supported source types; the seam menu is anchored within 6 px of its trigger and preserves the insertion position
- [x] Floating context system verified — both Explorer triggers share one panel; dock labels match all seven handoff tools; desktop and 390 px panel bounds stay inside the viewport
- [x] Player resource contract verified — idle Production state is visible; preview cache has no download action; source audio does; expanded speed control calls the shared player state
- [x] Final server cutover and legacy escape hatch verified — `/studio/?tab=projects&project=6` serves hashed CSS/JS; legacy `/` remains intact
