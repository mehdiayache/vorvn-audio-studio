# Voice Studio UI architecture

## Product rule

Projects does not own copies of production tools. It supplies context and
orchestrates the shared tools:

- Composer creates or replaces a part.
- Voice browser selects and auditions a voice.
- Player plays every audio source and every ordered sequence.
- Assets links reusable intros, outros, music and stingers.
- Subtitles operates on an audio generation.
- Translation creates language variants of an audio generation.
- Timeline visualizes a Production sequence.
- Finish produces an immutable Export snapshot and manifest.

Venture, Project and Production are contexts with different containment rules.
They are not three visual copies of one generic container.

## Inventory

| Concern | Current sources | Consumers | Decision |
|---|---|---|---|
| HTTP transport | `core/api-client.js` | domain services only | extracted; owns decoding, network errors and spend confirmation |
| Domain API | `services/*-api.js` | composed features | legacy-compatible adapters now; public v1 contract is `docs/API_V1.md` |
| DOM lookup | injected `get` dependency; `app.js` in remaining legacy areas | composed features | no extracted feature owns a global selector helper |
| Ask / confirm / empty | `app.js: ui` | every feature | keep as one shared primitive |
| Audio transport | `components/player.js` | Projects, Voices, Batch, History, Subtitles, takes | extracted single media engine |
| Waveform | `app.js: wave`, global player markup | same player | become an internal Player adapter |
| Audio trigger button | static markup plus many custom callbacks | recording preview, subtitles, rows, takes, voices | one reusable binder/view |
| Composer | `app.js: composer`, one movable DOM instance | Speak, Project part creation/editing | keep singleton; extract as a feature |
| Voice browser | `features/voices/browser.js`, one movable DOM instance | Voices, Composer, Project parts | extracted singleton; data and actions are injected |
| Voice identity | `voiceAvatar`, `voiceLabel`, `voiceDetail` | Player, parts, takes, voices | one shared component contract |
| Timeline | `projects-core.js` | Production workspace | already extracted and named |
| Project URL state | `projects-core.js` | tabs, breadcrumbs, Back/Forward | already extracted |
| Hierarchy rail | `hierarchy-view.js: rail` | Projects | callback-only navigation view |
| Hierarchy cards | `hierarchy-view.js: card` | Projects | shared identity with content-card semantics |
| Project picker | `hierarchy-view.js: picker` | move parts/projects | shared identity with selection semantics |
| Part row | `features/projects/part-row.js` | Production, Inbox | typed source variants: audio/draft/silence/asset |
| Take card | `drawTakes`, `drawModalTakes` | inline part and audio dialog | duplicated; replace with one renderer |
| Activity ledger | `features/activity/index.js` | Activity tab, Settings spend line | owns polling lifecycle and ledger presentation |
| Batch production | `features/batch/index.js` | Batch tab | owns sheet state, mapping, run and results |
| External subtitles | `features/subtitles/index.js` | Subtitles tab | owns uploaded transcription, vocabulary, translation and history |
| Multilingual versions | `features/multilingual/index.js` | Speak optional panel | owns selected languages and paid multi-version run |
| Settings administration | `features/settings/index.js` | Settings and key dialog | owns disk, limits, pronunciation, storage and credentials |
| Clone reference capture | `features/voices/clone-recorder.js` | Voices clone form | owns passages, microphone, upload and local review |
| Generic result rows | History, Batch, Subtitles, Activity, Voices | many tabs | unify only the row shell/actions, not feature content |
| Feature dialogs | many static dialogs | feature-specific | share dialog shell; keep business forms in their feature |

## Target boundaries

```text
ui/
  core/
    api.js
    dom.js
    events.js
  services/
    ventures-api.js
    projects-api.js
    parts-api.js
    assets-api.js
    captions-api.js
  components/
    player.js
    audio-trigger.js
    dialog.js
    list-row.js
    voice-identity.js
  features/
    projects/
      index.js
      router.js
      hierarchy.js
      cards.js
      workspace.js
      part-row.js
      timeline.js
    composer/
    voices/
    activity/
    subtitles/
    batch/
    multilingual/
    settings/
  app.js                 # boot and feature composition only
```

During migration, classic scripts expose narrow factories on `window` so the
running app can be changed incrementally. A feature may receive dependencies;
it may not reach into another feature's private state.

## Stable contracts

### Player

Input is a `Track`:

```js
{
  url, name, title, meta, voice,
  downloadable: true,
  waveform: true
}
```

Player owns transport, current track, playback state, global UI, waveform and
renderer release. A caller may provide `render(playing)` but may not touch the
global `<audio>` element.

### Project context

```js
{
  venture,
  project,
  production,
  canCreateChild,
  canContainParts,
  isUnsorted,
  isLibrary
}
```

Tools receive this context. They do not infer hierarchy by reading unrelated
DOM or global variables.

### Part row

The renderer receives a typed part plus callbacks. It does not call APIs.

```js
renderPart(part, {
  selected,
  onPlay,
  onEdit,
  onRetake,
  onOpen,
  onSelect,
  onAction
})
```

### Hierarchy

The model supplies `path`, `children`, `level`, `identity` and rolled-up
metrics once. Rail, cards and picker render different views of this same model.

## Migration order

1. Player transport and waveform.
2. Audio trigger and take card.
3. Projects hierarchy model, rail and picker.
4. Project cards and workspace controller.
5. Typed part row.
6. Composer and voice-browser feature boundaries.
7. Generic list-row/dialog shells where duplication remains measurable.

Each step must keep direct Project URLs, Back/Forward, Arabic direction, the
single audio element and the no-network contract tests working.

## Migration status

| Boundary | Status | Implementation |
|---|---|---|
| Player transport + waveform | complete | `components/player.js` owns the sole audio engine |
| Audio trigger | complete | `components/audio-trigger.js` binds controls to Player |
| Take card | complete | `components/take-card.js` supplies compact/detail densities |
| Projects route + Timeline | complete | `projects-core.js` |
| Projects hierarchy + context | complete | one indexed model feeds rail, cards, picker and capabilities |
| Projects hierarchy views | complete | rail, content card and picker in `hierarchy-view.js` |
| Projects workspace state | complete | pure capability and visibility rules in `workspace-state.js` |
| Part row | complete | typed source-only renderer in `features/projects/part-row.js` |
| Composer feature boundary | complete | movable session and destination state in `features/composer/index.js` |
| Voice browser boundary | complete | picker state and every exit live in `features/voices/browser.js` |
| Asset browser boundary | complete | search, destination and preview/insert separation in `features/assets/browser.js` |
| Project export card | complete | stitches are outputs in Finish, never source part rows |
| Caption manager | complete | original, translations, preview and exact-file download share one workspace |
| Shared HTTP client | complete | `core/api-client.js` owns fetch, response errors and paid-call confirmation |
| Projects/Parts/Assets/Captions adapters | complete | UI features receive domain calls; legacy routes stay behind adapters |
| Project music controller | complete | `features/projects/music.js` owns state, controls, asset selection and playback |
| Activity lifecycle + ledger | complete | `features/activity/index.js`; the app composes start/stop only |
| Batch controller | complete | `features/batch/index.js`; sheet state and result rendering are private |
| External subtitles controller | complete | `features/subtitles/index.js`; separate from Part captions |
| Multilingual controller | complete | `features/multilingual/index.js`; optional versions do not expand Composer state |
| Settings administration | complete | `features/settings/index.js`; config object is injected and deliberately shared |
| Clone reference recorder | complete | `features/voices/clone-recorder.js`; no provider call is involved in capture/review |
| Composition root reduction | in progress | `app.js` reduced from 5,730 to about 4,440 lines; Projects and Voices orchestration remain the next large boundaries |
| Public API v1 hierarchy reads | complete | typed Venture, Project, Production, Asset, Export and Part resources with one error shape |
| Public API v1 writes/auth/jobs | designed | `docs/API_V1.md`; implementation remains pending before external exposure |
| Generic dialogs/list shells | pending | extract only after feature boundaries are stable |
